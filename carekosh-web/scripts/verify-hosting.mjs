import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const origin = "http://127.0.0.1:8787";
try {
  await fetch(origin, { signal: AbortSignal.timeout(500) });
  throw new Error(
    "Port 8787 is already in use. Stop that process before testing hosting.",
  );
} catch (error) {
  if (error.message.startsWith("Port 8787")) throw error;
}
let output = "";
const worker = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "8787",
  ],
  {
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_LOG_PATH: join(tmpdir(), "carekosh-hosting-check.log"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const closed = once(worker, "exit");
worker.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
worker.stderr.on("data", (chunk) => {
  output += chunk.toString();
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (worker.exitCode !== null) throw new Error(output);
    try {
      await fetch(origin, {
        redirect: "manual",
        signal: AbortSignal.timeout(500),
      });
      ready = true;
      break;
    } catch {
      await delay(250);
    }
  }
  assert(ready, `Wrangler did not become ready: ${output}`);
  const manifest = JSON.parse(await readFile("routes.json", "utf8"));
  const routes = [...manifest.auth, ...Object.values(manifest.workspace)].map(
    (path) => path.replace(/:[A-Za-z_]\w*/g, "example"),
  );
  routes.push(
    "/item/new",
    "/inventory?q=oxygen",
    "/reset-password?token=example",
  );
  for (const headers of [
    {},
    { "Sec-Fetch-Mode": "navigate", Accept: "text/html" },
  ]) {
    for (const path of routes) {
      const response = await fetch(origin + path, {
        headers,
        redirect: "manual",
      });
      assert.equal(
        response.status,
        200,
        `${path} must serve the SPA without redirecting`,
      );
      assert.equal(
        response.headers.get("location"),
        null,
        `${path} must retain its URL`,
      );
      assert(response.headers.get("content-type")?.includes("text/html"));
      assert(
        response.headers
          .get("content-security-policy")
          ?.includes("frame-ancestors 'none'"),
      );
      assert(!response.headers.get("cache-control")?.includes("immutable"));
      assert.equal(
        response.headers.get("cross-origin-opener-policy"),
        "same-origin",
      );
      assert.equal(
        response.headers.get("cross-origin-resource-policy"),
        "same-origin",
      );
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(
        response.headers.get("strict-transport-security"),
        "max-age=31536000",
      );
      assert(
        response.headers
          .get("content-security-policy")
          ?.includes("script-src-attr 'none'"),
      );
      assert((await response.text()).includes('id="root"'));
    }
    for (const path of [
      "/assets/missing.js",
      "/missing.js",
      "/api/v1/items",
      "/unknown-route",
    ]) {
      const response = await fetch(origin + path, {
        headers,
        redirect: "manual",
      });
      assert.equal(response.status, 404, `${path} must remain a real 404`);
      assert(!response.headers.get("cache-control")?.includes("immutable"));
    }
  }
  const asset = (await readdir("dist-production/assets")).find((file) =>
    /^index-.*\.js$/.test(file),
  );
  assert(asset);
  const response = await fetch(`${origin}/assets/${asset}`, {
    redirect: "manual",
  });
  assert.equal(response.status, 200);
  assert(response.headers.get("content-type")?.includes("javascript"));
  assert(response.headers.get("cache-control")?.includes("immutable"));
  console.log(
    `Hosting passed: ${routes.length} deep links retain their URLs, 4 unknown paths return 404, security/cache headers are correct (with and without browser navigation headers).`,
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  worker.kill("SIGTERM");
  await closed;
}
