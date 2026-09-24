import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let port;

before(async () => {
  server = spawn(process.execPath, ["server.mjs", "--port=0"], { cwd: repositoryRoot });
  let output = "";
  for await (const chunk of server.stdout) {
    output += chunk;
    const match = output.match(/listening at http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) {
      port = Number(match[1]);
      break;
    }
  }
  assert.ok(port, `server did not report a port: ${output}`);
});

after(async () => {
  server.kill("SIGTERM");
  await once(server, "exit");
});

// node:http sends the path exactly as given, unlike fetch, which normalises "..".
function request(method, rawPath) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: "127.0.0.1", port, method, path: rawPath }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

test("serves the page and its assets with the right content types", async () => {
  const page = await request("GET", "/");
  assert.equal(page.status, 200);
  assert.match(page.headers["content-type"], /^text\/html/);
  assert.match(page.body, /<title>Contrast Tailor<\/title>/);

  for (const [assetPath, type] of [
    ["/app.mjs", /^text\/javascript/],
    ["/contrast.mjs", /^text\/javascript/],
    ["/styles.css", /^text\/css/]
  ]) {
    const asset = await request("GET", assetPath);
    assert.equal(asset.status, 200, assetPath);
    assert.match(asset.headers["content-type"], type, assetPath);
  }
});

test("never serves files outside the public directory", async () => {
  for (const rawPath of [
    "/../package.json",
    "/%2e%2e/package.json",
    "/..%2fpackage.json",
    "/../server.mjs",
    "//etc/passwd"
  ]) {
    const response = await request("GET", rawPath);
    assert.notEqual(response.status, 200, rawPath);
    assert.doesNotMatch(response.body, /"name": "contrast-tailor"|createServer|root:/, rawPath);
  }
});

test("returns 404 for missing files and directories", async () => {
  assert.equal((await request("GET", "/missing.mjs")).status, 404);
  assert.equal((await request("GET", "/contrast-core.mjs")).status, 404);
});

test("answers HEAD without a body and rejects other methods", async () => {
  const head = await request("HEAD", "/");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  assert.ok(Number(head.headers["content-length"]) > 0);

  const post = await request("POST", "/");
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");
});
