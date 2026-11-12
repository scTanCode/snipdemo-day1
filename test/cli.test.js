"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const { browserLaunchSpec } = require("../cli");

const cliPath = path.resolve(__dirname, "..", "cli.js");

async function withApi(handler, run) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const apiUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(apiUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function runCli(args, apiUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, SNIP_API: apiUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

test("help prints usage without contacting an API", async () => {
  const result = await runCli(["help"], "http://127.0.0.1:1");
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, "");
});

test("add sends a URL to the API and prints the returned short URL", async () => {
  await withApi((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/links");
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      assert.deepEqual(JSON.parse(body), { url: "https://example.com/path" });
      sendJson(response, 201, {
        code: "a1B2c3",
        url: "https://example.com/path",
        shortUrl: "http://127.0.0.1:3000/a1B2c3",
        hits: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    });
  }, async (apiUrl) => {
    const result = await runCli(["add", "https://example.com/path"], apiUrl);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "http://127.0.0.1:3000/a1B2c3\n");
    assert.equal(result.stderr, "");
  });
});

test("ls prints an aligned link table and handles an empty list", async () => {
  let links = [{
    code: "a1B2c3",
    url: "https://example.com",
    shortUrl: "http://localhost:3000/a1B2c3",
    hits: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
  }];

  await withApi((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/api/links");
    sendJson(response, 200, links);
  }, async (apiUrl) => {
    const populated = await runCli(["ls"], apiUrl);
    assert.equal(populated.code, 0);
    assert.match(populated.stdout, /CODE\s+HITS\s+URL/);
    assert.match(populated.stdout, /a1B2c3\s+12\s+https:\/\/example\.com/);
    assert.equal(populated.stderr, "");

    links = [];
    const empty = await runCli(["ls"], apiUrl);
    assert.equal(empty.code, 0);
    assert.equal(empty.stdout, "No links yet.\n");
  });
});

test("invalid arguments fail on stderr before making an API request", async () => {
  const result = await runCli(["add", "file:///tmp/nope"], "http://127.0.0.1:1");
  assert.equal(result.code, 1);
  assert.match(result.stderr, /valid HTTP or HTTPS URL/);
  assert.equal(result.stdout, "");
});

test("API errors and unknown codes fail with a useful message", async () => {
  await withApi((request, response) => {
    sendJson(response, 404, { error: "Link not found" });
  }, async (apiUrl) => {
    const result = await runCli(["open", "a1B2c3"], apiUrl);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown short code: a1B2c3/);
    assert.equal(result.stdout, "");
  });
});

test("an unreachable API exits with code 1", async () => {
  const server = http.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const apiUrl = `http://127.0.0.1:${server.address().port}`;
  server.close();
  await once(server, "close");

  const result = await runCli(["ls"], apiUrl);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unable to reach Snip API/);
  assert.equal(result.stdout, "");
});

test("browser launchers use the platform opener without interpolating the URL into a command", () => {
  const url = "https://example.com/?first=1&second=2";

  assert.deepEqual(browserLaunchSpec("win32", url), {
    command: "cmd.exe",
    args: ["/d", "/v:off", "/s", "/c", 'start "" "%SNIP_CLI_OPEN_URL%"'],
    env: { SNIP_CLI_OPEN_URL: url },
  });
  assert.deepEqual(browserLaunchSpec("darwin", url), {
    command: "open",
    args: [url],
  });
  assert.deepEqual(browserLaunchSpec("linux", url), {
    command: "xdg-open",
    args: [url],
  });
});
