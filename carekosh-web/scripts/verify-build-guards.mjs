import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const cases = [
  { VITE_DATA_MODE: "demo" },
  { VITE_APP_ENV: "local" },
  { VITE_API_BASE_URL: "https://unapproved.example/api/v1" },
  { VITE_SECRET: "public-test-placeholder-not-a-secret" },
];
for (const mode of ["staging", "production"])
  for (const invalid of cases) {
    const result = spawnSync(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "build", "--mode", mode],
      {
        env: { ...process.env, ...invalid },
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    assert(
      result.status !== 0,
      `Unsafe configuration was accepted: ${Object.keys(invalid)}`,
    );
    assert(
      /Refusing (production|staging) build|Unexpected public VITE_ setting/.test(
        result.stderr,
      ),
      "Build failed for an unrelated reason",
    );
  }
console.log(
  "Build guards passed: demo mode, wrong environment/API, and unexpected public settings are rejected.",
);
