import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const mode = process.argv[2] || "production";
assert(["production", "staging"].includes(mode), "Use production or staging");
const api =
  mode === "production"
    ? "https://api.carekosh.com/api/v1"
    : "https://staging-api.carekosh.com/api/v1";
const directory = `dist-${mode}`;
const routes = JSON.parse(await readFile("routes.json", "utf8"));
const files = await readdir(`${directory}/assets`);
const js = (
  await Promise.all(
    files
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFile(`${directory}/assets/${f}`, "utf8")),
  )
).join("\n");
assert(js.includes(api), "Expected API host is absent");
for (const forbidden of [
  "alex@example.com",
  "ORD-DEMO-",
  "carekosh-demo-v1",
  "http://127.0.0.1:8000",
])
  assert(!js.includes(forbidden), `Forbidden fixture/dev value: ${forbidden}`);
assert(
  !js.includes(
    mode === "production"
      ? "https://staging-api.carekosh.com/api/v1"
      : "https://api.carekosh.com/api/v1",
  ),
  "Cross-environment API found",
);
assert(!files.some((f) => f.endsWith(".map")), "Do not ship source maps");
const headers = await readFile(`${directory}/_headers`, "utf8");
for (const header of [
  "Content-Security-Policy:",
  "X-Content-Type-Options: nosniff",
  "frame-ancestors 'none'",
  "X-Robots-Tag: noindex",
  "Cache-Control: no-cache",
])
  assert(headers.includes(header), `Missing ${header}`);
for (const header of [
  "script-src-attr 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "Cross-Origin-Opener-Policy: same-origin",
  "Cross-Origin-Resource-Policy: same-origin",
  "Strict-Transport-Security: max-age=31536000",
  "Referrer-Policy: no-referrer",
  "microphone=()",
  "upgrade-insecure-requests",
])
  assert(headers.includes(header), `Missing security directive: ${header}`);
assert(!headers.includes("'unsafe-eval'"), "Never enable eval in the app CSP");
const rootFiles = await readdir(directory);
assert(
  !rootFiles.some(
    (f) => f.startsWith(".env") || f.startsWith("__") || f.endsWith(".map"),
  ),
  "Development files must not ship",
);
assert(
  js.includes(
    mode === "production"
      ? "https://carekosh.com"
      : "https://staging.carekosh.com",
  ),
  "Expected landing origin missing",
);
const rewrites = await readFile(`${directory}/_redirects`, "utf8");
for (const route of [...routes.auth, ...Object.values(routes.workspace)])
  assert(rewrites.includes(`${route} /index.html 200`));
assert(
  !rewrites.includes("/* /index.html"),
  "No blanket missing-asset fallback",
);
const hosting = await readFile("wrangler.jsonc", "utf8");
assert.equal(
  [...hosting.matchAll(/"html_handling"\s*:\s*"none"/g)].length,
  3,
  "All three Wrangler environments must disable HTML redirects",
);
console.log(
  `${mode}: API isolation, fixture exclusion, headers, routes, and source-map checks passed.`,
);
