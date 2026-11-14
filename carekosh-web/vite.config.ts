import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import routes from "./routes.json" with { type: "json" };
import { writeFileSync, readdirSync } from "node:fs";
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  if (mode === "api")
    Object.assign(env, {
      VITE_APP_ENV: "local",
      VITE_DATA_MODE: "api",
      VITE_API_BASE_URL: "/api/v1",
    });
  const targets: Record<string, [string, string]> = {
    production: [
      "https://api.carekosh.com/api/v1",
      "https://homeicuinventory.carekosh.com",
    ],
    staging: [
      "https://staging-api.carekosh.com/api/v1",
      "https://staging-app.carekosh.com",
    ],
  };
  if (
    targets[mode] &&
    (env.VITE_APP_ENV !== mode ||
      env.VITE_DATA_MODE !== "api" ||
      env.VITE_API_BASE_URL !== targets[mode][0] ||
      env.VITE_APP_ORIGIN !== targets[mode][1])
  )
    throw new Error(
      `Refusing ${mode} build: API, data mode, or app origin does not match its environment.`,
    );
  if (targets[mode]) {
    const publicKeys = new Set([
      "VITE_APP_ENV",
      "VITE_DATA_MODE",
      "VITE_API_BASE_URL",
      "VITE_APP_ORIGIN",
    ]);
    if (
      Object.keys(env).some(
        (key) => key.startsWith("VITE_") && !publicKeys.has(key),
      )
    )
      throw new Error(
        "Unexpected public VITE_ setting. Review it before adding it to the public configuration allowlist; secrets must never enter a browser bundle.",
      );
  }
  const outDir = targets[mode] ? `dist-${mode}` : "dist";
  return {
    resolve: {
      alias: targets[mode]
        ? [
            {
              find: /^.*\/demo\/repository$/,
              replacement: new URL(
                "./src/services/demo-disabled.ts",
                import.meta.url,
              ).pathname,
            },
          ]
        : [],
    },
    plugins: [
      react(),
      {
        name: "carekosh-headers",
        closeBundle() {
          if (command !== "build") return;
          writeFileSync(
            `${outDir}/_redirects`,
            [...routes.auth, ...Object.values(routes.workspace)]
              .map((path) => `${path} /index.html 200`)
              .join("\n") + "\n",
          );
          const connect = targets[mode]?.[0].replace("/api/v1", "") || "'self'";
          const assetHeaders = readdirSync(`${outDir}/assets`)
            .map(
              (name) =>
                `/assets/${name}\n  Cache-Control: public, max-age=31536000, immutable`,
            )
            .join("\n");
          writeFileSync(
            `${outDir}/_headers`,
            `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Resource-Policy: same-origin\n${targets[mode] ? "  Strict-Transport-Security: max-age=31536000\n" : ""}  Permissions-Policy: microphone=(), camera=(), geolocation=(), payment=(), usb=()\n  Content-Security-Policy: default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' https: blob: data:; media-src 'self' blob:; connect-src 'self' ${connect}; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'${targets[mode] ? "; upgrade-insecure-requests" : ""}\n  X-Robots-Tag: noindex, nofollow\n${assetHeaders}\n/index.html\n  Cache-Control: no-cache\n`,
          );
        },
      },
    ],
    define:
      mode === "api"
        ? {
            "import.meta.env.VITE_DATA_MODE": JSON.stringify("api"),
            "import.meta.env.VITE_APP_ENV": JSON.stringify("local"),
            "import.meta.env.VITE_API_BASE_URL": JSON.stringify("/api/v1"),
          }
        : {},
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.CAREKOSH_DEV_API_TARGET || "http://127.0.0.1:8000",
          changeOrigin: false,
        },
      },
    },
    build: { outDir, sourcemap: false },
  };
});
