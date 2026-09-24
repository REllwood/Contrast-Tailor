import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const portArgument = process.argv.find((value) => value.startsWith("--port="));
const requestedPort = Number.parseInt(portArgument?.split("=")[1] ?? process.env.PORT ?? "4173", 10);
const port = Number.isFinite(requestedPort) ? requestedPort : 4173;
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }
  try {
    const requestedPath = new URL(request.url ?? "/", "http://localhost").pathname;
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
    const candidate = path.resolve(root, relativePath);
    if (!candidate.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const details = await stat(candidate);
    if (!details.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    const body = await readFile(candidate);
    response.writeHead(200, {
      "content-type": contentTypes.get(path.extname(candidate)) ?? "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : port;
  console.log(`Contrast Tailor listening at http://127.0.0.1:${activePort}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
