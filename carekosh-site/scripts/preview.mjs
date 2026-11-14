import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { build, root } from "./build.mjs";
const output = await build("local");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};
const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405);
    response.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1:5175").pathname,
    );
    if (pathname === "/__preview") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      });
      response.end(
        request.method === "HEAD"
          ? undefined
          : await readFile(resolve(root, "scripts/viewport.html")),
      );
      return;
    }
    const path = resolve(
      output,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (
      !path.startsWith(output + sep) ||
      pathname
        .split("/")
        .some((part) => part.startsWith("_") || part.startsWith("."))
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    });
    response.end(request.method === "HEAD" ? undefined : await readFile(path));
  } catch {
    response.writeHead(404, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      request.method === "HEAD"
        ? undefined
        : await readFile(resolve(output, "404.html")),
    );
  }
});
server.listen(5175, "127.0.0.1", () =>
  console.log("CareKosh landing preview: http://127.0.0.1:5175/"),
);
let timer;
let pending = Promise.resolve();
const watchers = ["src", "assets"].map((folder) =>
  watch(resolve(root, folder), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(() => build("local")).catch(console.error);
    }, 150);
  }),
);
function stop() {
  clearTimeout(timer);
  watchers.forEach((watcher) => watcher.close());
  server.close(() => process.exit(0));
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
