import { isAbsolute, relative, resolve, sep } from "node:path";

const links = new Map();
const portValue = Bun.env.PORT ?? "3000";
const port = Number(portValue);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be an integer from 1 to 65535; received "${portValue}"`);
}

const configuredBaseUrl = Bun.env.BASE_URL;
const railwayDomain = Bun.env.RAILWAY_PUBLIC_DOMAIN;
const baseUrl = (
  configuredBaseUrl ||
  (railwayDomain ? `https://${railwayDomain}` : `http://localhost:${port}`)
).replace(/\/+$/, "");

let parsedBaseUrl;
try {
  parsedBaseUrl = new URL(baseUrl);
} catch {
  throw new Error("BASE_URL or RAILWAY_PUBLIC_DOMAIN must be a valid URL");
}

if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
  throw new Error("BASE_URL must use HTTP or HTTPS");
}

const shortUrlBase = parsedBaseUrl.origin;
const publicDirectory = Bun.env.PUBLIC_DIR
  ? resolve(process.cwd(), Bun.env.PUBLIC_DIR)
  : null;
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function createCode() {
  while (true) {
    let code = "";
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= 248) continue;
      code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }

    if (code.length === 6 && !links.has(code)) return code;
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function serveStatic(pathname) {
  if (!publicDirectory) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = resolve(publicDirectory, `.${requestedPath}`);
  const relativePath = relative(publicDirectory, filePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return null;
  }

  const file = Bun.file(filePath);
  return (await file.exists()) ? new Response(file) : null;
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (pathname === "/api/links") {
      if (request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return withCors(jsonResponse({ error: "Invalid JSON body" }, 400));
        }

        if (!body || typeof body.url !== "string") {
          return withCors(jsonResponse({ error: "A URL is required" }, 400));
        }

        let originalUrl;
        try {
          originalUrl = new URL(body.url);
        } catch {
          return withCors(jsonResponse({ error: "A valid HTTP or HTTPS URL is required" }, 400));
        }

        if (originalUrl.protocol !== "http:" && originalUrl.protocol !== "https:") {
          return withCors(jsonResponse({ error: "A valid HTTP or HTTPS URL is required" }, 400));
        }

        const code = createCode();
        const link = {
          code,
          url: originalUrl.href,
          shortUrl: `${shortUrlBase}/${code}`,
          hits: 0,
          createdAt: new Date().toISOString(),
        };
        links.set(code, link);
        return withCors(jsonResponse(link, 201));
      }

      if (request.method === "GET") {
        return withCors(jsonResponse(Array.from(links.values())));
      }

      return withCors(
        jsonResponse({ error: "Method not allowed" }, 405),
      );
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const staticResponse = await serveStatic(pathname);
      if (staticResponse) return withCors(staticResponse);
    }

    if (request.method === "GET" && /^\/[^/]+$/.test(pathname)) {
      const code = pathname.slice(1);
      const link = links.get(code);
      if (!link) return withCors(jsonResponse({ error: "Link not found" }, 404));

      link.hits += 1;
      return withCors(new Response(null, {
        status: 302,
        headers: { Location: link.url },
      }));
    }

    return withCors(jsonResponse({ error: "Not found" }, 404));
  },
});

console.log(`Snip backend listening on port ${port}`);
