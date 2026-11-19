import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertApiPath,
  boundedJson,
  MAX_RESPONSE_BYTES,
  retryAfterSeconds,
} from "../src/services/http-policy";
import { printOrder } from "../src/services/export";
import type { SavedOrder } from "../src/domain";
afterEach(() => vi.unstubAllGlobals());
describe("request boundaries", () => {
  it("allows local API routes and rejects external or traversing destinations", () => {
    for (const path of [
      "/items",
      "/items/example?version=2",
      "/auth/verify-email/token",
    ])
      expect(() => assertApiPath(path)).not.toThrow();
    for (const path of [
      "https://example.com",
      "//example.com",
      "/../auth",
      "/%2e%2e/auth",
      "/items/%2fsecret",
      "/items\\secret",
      "/items#fragment",
    ])
      expect(() => assertApiPath(path)).toThrow();
  });
  it("parses Retry-After dates and seconds with a safe fallback", () => {
    const now = Date.parse("2026-10-25T00:00:00Z");
    expect(retryAfterSeconds("120", now)).toBe(120);
    expect(retryAfterSeconds("Sun, 25 Oct 2026 00:01:00 GMT", now)).toBe(60);
    expect(retryAfterSeconds("invalid", now)).toBe(30);
  });
  it("rejects an oversized response even without Content-Length", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(MAX_RESPONSE_BYTES + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      boundedJson(
        new Response(body, { headers: { "content-type": "application/json" } }),
      ),
    ).rejects.toThrow("too large");
    expect(cancelled).toBe(true);
  });
});
it("escapes untrusted inventory text in print documents and severs the opener", () => {
  let html = "";
  const popup = {
    opener: {},
    print: vi.fn(),
    document: {
      write: (value: string) => {
        html = value;
      },
      close: vi.fn(),
      getElementById: () => ({}),
    },
  };
  vi.stubGlobal("window", { open: () => popup });
  printOrder(
    {
      orderId: '<script>alert("x")</script>',
      exportedAt: "2026-10-25",
      totalItems: 1,
      totalUnits: 1,
      items: [
        {
          name: '<img src=x onerror="alert(1)">',
          quantity: 1,
          unit: "piece",
          imageUri: "javascript:alert(1)",
        },
      ],
    } as SavedOrder,
    true,
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&lt;img src=x");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("javascript:");
  expect(popup.opener).toBeNull();
});
