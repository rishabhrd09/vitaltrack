import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const environments = {
  production: {
    app: "https://homeicuinventory.carekosh.com",
    site: "https://carekosh.com",
    out: "dist",
    robots: "index,follow",
  },
  staging: {
    app: "https://staging-app.carekosh.com",
    site: "https://staging.carekosh.com",
    out: "dist-staging",
    robots: "noindex,nofollow",
  },
  local: {
    app: "http://127.0.0.1:5174",
    site: "http://127.0.0.1:5175",
    out: "dist-local",
    robots: "noindex,nofollow",
  },
};
export async function build(mode = "production") {
  const config = environments[mode];
  if (!config) throw new Error(`Unknown build mode: ${mode}`);
  const output = resolve(root, config.out);
  // These are fixed generated directories, never source or user-selected paths.
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  let html = await readFile(resolve(root, "src/index.html"), "utf8");
  for (const [key, value] of Object.entries({
    APP_ORIGIN: config.app,
    APP_HOST: new URL(config.app).host,
    SITE_ORIGIN: config.site,
    ROBOTS: config.robots,
  }))
    html = html.replaceAll(`{{${key}}}`, value);
  if (/\{\{[A-Z_]+\}\}/.test(html))
    throw new Error("Unresolved build placeholder");
  await Promise.all([
    writeFile(resolve(output, "index.html"), html),
    cp(resolve(root, "src/styles.css"), resolve(output, "styles.css")),
    cp(resolve(root, "src/site.js"), resolve(output, "site.js")),
    cp(resolve(root, "assets"), resolve(output, "assets"), { recursive: true }),
    writeFile(
      resolve(output, "robots.txt"),
      mode === "production"
        ? `User-agent: *\nAllow: /\nSitemap: ${config.site}/sitemap.xml\n`
        : "User-agent: *\nDisallow: /\n",
    ),
    writeFile(
      resolve(output, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${config.site}/</loc></url></urlset>\n`,
    ),
    writeFile(
      resolve(output, "404.html"),
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found | CareKosh</title><link rel="stylesheet" href="/styles.css"></head><body><main class="section-wrap hero"><p class="eyebrow">CAREKOSH — HOME ICU INVENTORY</p><h1>This page isn’t here.</h1><p class="hero-description">Let’s take you back to a little more clarity.</p><p class="hero-actions"><a class="button" href="/">Return home</a></p></main></body></html>',
    ),
    writeFile(
      resolve(output, "_headers"),
      `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Resource-Policy: same-origin\n${mode !== "local" ? "  Strict-Transport-Security: max-age=31536000\n" : ""}  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'${mode !== "local" ? "; upgrade-insecure-requests" : ""}\n  Cache-Control: public, max-age=0, must-revalidate\n${mode !== "production" ? "  X-Robots-Tag: noindex, nofollow\n" : ""}`,
    ),
  ]);
  console.log(`${mode}: ${config.out}/ → app links: ${config.app}`);
  return output;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await build(process.argv[2]);
