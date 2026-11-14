import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { build, environments, root } from "./build.mjs";
for (const mode of ["production", "staging", "local"]) {
  const output = await build(mode);
  const html = await readFile(resolve(output, "index.html"), "utf8");
  const { app, robots } = environments[mode];
  assert(html.includes(`name="robots" content="${robots}"`));
  assert(html.includes(`${app}/register`) && html.includes(`${app}/login`));
  assert(!html.includes("{{"));
  assert(html.includes('data-appearance="light" aria-pressed="true"'));
  assert(html.includes('src="/assets/app-overview-light.jpg"'));
  if (mode !== "local")
    assert(!html.includes("127.0.0.1") && !html.includes("localhost"));
  if (mode === "production") assert(!html.includes("staging-app.carekosh.com"));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "IDs must be unique");
  for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (href.startsWith("#"))
      assert(ids.includes(href.slice(1)), `Broken fragment: ${href}`);
    else if (href.startsWith("/")) await access(resolve(output, "." + href));
    else
      assert(
        href.startsWith("https://") ||
          (mode === "local" && href.startsWith("http://127.0.0.1:")) ||
          href === "mailto:support@carekosh.com",
        `Unexpected destination: ${href}`,
      );
  }
  const css = await readFile(resolve(output, "styles.css"), "utf8");
  for (const [, asset] of css.matchAll(/url\('([^']+)'\)/g))
    await access(resolve(output, "." + asset));
  assert(
    (await readFile(resolve(output, "_headers"), "utf8")).includes(
      "connect-src 'none'",
    ),
  );
  const securityHeaders = await readFile(resolve(output, "_headers"), "utf8");
  for (const directive of [
    "script-src-attr 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "Cross-Origin-Opener-Policy: same-origin",
    "Cross-Origin-Resource-Policy: same-origin",
    "Referrer-Policy: no-referrer",
  ])
    assert(securityHeaders.includes(directive), `Missing ${directive}`);
  if (mode !== "local")
    assert(
      securityHeaders.includes("Strict-Transport-Security: max-age=31536000"),
    );
  console.log(
    `${mode}: links, images, fonts, metadata, environment separation and static headers passed.`,
  );
}
await access(resolve(root, "assets/INTER-LICENSE.txt"));
