#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");

const DEFAULT_API = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 10_000;

function usage() {
  return [
    "Usage:",
    "  snip add <url>    Create a short link",
    "  snip ls           List links and hit counts",
    "  snip open <code>  Open the original URL in your browser",
    "  snip help         Show this help",
    "",
    "Set SNIP_API to use a different API base URL (default: http://localhost:3000).",
  ].join("\n");
}

function apiBaseUrl() {
  const configured = (process.env.SNIP_API || DEFAULT_API).replace(/\/+$/, "");
  let parsed;

  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("SNIP_API must be a valid HTTP or HTTPS URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("SNIP_API must be a valid HTTP or HTTPS URL");
  }

  return configured;
}

async function fetchApi(path, options) {
  const baseUrl = apiBaseUrl();

  try {
    return await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(`API request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    }

    throw new Error(`Unable to reach Snip API at ${baseUrl}: ${error.message}`);
  }
}

async function responseError(response) {
  const body = await response.text();

  if (body) {
    try {
      const payload = JSON.parse(body);
      if (payload && typeof payload.error === "string" && payload.error) {
        return payload.error;
      }
    } catch {
      return body.trim();
    }
  }

  return `API request failed with status ${response.status}`;
}

async function requestJson(path, options) {
  const response = await fetchApi(path, options);
  if (!response.ok) {
    throw new Error(await responseError(response));
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`API returned invalid JSON (HTTP ${response.status})`);
  }
}

function validateUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Please provide a valid HTTP or HTTPS URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Please provide a valid HTTP or HTTPS URL");
  }
}

function validateCode(code) {
  if (!/^[0-9A-Za-z]{6}$/.test(code)) {
    throw new Error("Please provide a six-character base62 short code");
  }
}

function validateLink(link) {
  if (
    !link ||
    typeof link.code !== "string" ||
    typeof link.url !== "string" ||
    typeof link.shortUrl !== "string" ||
    !Number.isFinite(link.hits)
  ) {
    throw new Error("API returned a link with an invalid shape");
  }
}

async function add(args) {
  if (args.length !== 1) {
    throw new Error("Usage: snip add <url>");
  }

  validateUrl(args[0]);
  const link = await requestJson("/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: args[0] }),
  });
  validateLink(link);
  console.log(link.shortUrl);
}

async function list(args) {
  if (args.length !== 0) {
    throw new Error("Usage: snip ls");
  }

  const links = await requestJson("/api/links");
  if (!Array.isArray(links)) {
    throw new Error("API returned an invalid links list");
  }

  for (const link of links) validateLink(link);

  if (links.length === 0) {
    console.log("No links yet.");
    return;
  }

  const codeWidth = links.reduce((width, link) => Math.max(width, link.code.length), 4);
  const hitsWidth = links.reduce((width, link) => Math.max(width, String(link.hits).length), 4);
  console.log(`${"CODE".padEnd(codeWidth)}  ${"HITS".padStart(hitsWidth)}  URL`);

  for (const link of links) {
    console.log(
      `${link.code.padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`,
    );
  }
}

function browserLaunchSpec(platform, url) {
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/v:off", "/s", "/c", 'start "" "%SNIP_CLI_OPEN_URL%"'],
      env: { SNIP_CLI_OPEN_URL: url },
    };
  }

  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }

  return { command: "xdg-open", args: [url] };
}

function launchBrowser(url) {
  const spec = browserLaunchSpec(process.platform, url);

  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: spec.env ? { ...process.env, ...spec.env } : process.env,
    });

    child.once("error", (error) => {
      reject(new Error(`Unable to launch the default browser: ${error.message}`));
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function open(args) {
  if (args.length !== 1) {
    throw new Error("Usage: snip open <code>");
  }

  const [code] = args;
  validateCode(code);
  const response = await fetchApi(`/${encodeURIComponent(code)}`, {
    redirect: "manual",
  });

  if (response.status === 404) {
    throw new Error(`Unknown short code: ${code}`);
  }

  if (response.status !== 302) {
    throw new Error(await responseError(response));
  }

  const location = response.headers.get("location");
  if (!location) {
    throw new Error("API redirect did not include a Location header");
  }

  let target;
  try {
    target = new URL(location, apiBaseUrl());
  } catch {
    throw new Error("API redirect included an invalid Location URL");
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("API redirect included a non-HTTP(S) Location URL");
  }

  await launchBrowser(target.href);
}

async function main(args) {
  const [command, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    if (rest.length !== 0) {
      throw new Error(usage());
    }
    console.log(usage());
    return;
  }

  if (command === "add") return add(rest);
  if (command === "ls") return list(rest);
  if (command === "open") return open(rest);
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { browserLaunchSpec };
