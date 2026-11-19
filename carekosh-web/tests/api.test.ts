import { beforeEach, afterEach, it, expect, vi } from "vitest";
const user = { id: "u", name: "Caregiver" };
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_DATA_MODE", "api");
  vi.stubEnv("VITE_API_BASE_URL", "/api/v1");
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      addEventListener() {}
      postMessage() {}
    },
  );
  let serial = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: (_key: string, fn: () => Promise<unknown>) => {
        const p = serial.then(fn);
        serial = p.catch(() => {}).then(() => {});
        return p;
      },
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("single-flights refresh, omits refresh token from storage and uses cookie-only auth transport", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(json({ user, access_token: "access" }));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  const [a, b] = await Promise.all([api.refresh(), api.refresh()]);
  expect(a).toEqual(user);
  expect(b).toEqual(user);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: "include",
    headers: { "X-CareKosh-Web": "1" },
  });
  fetcher.mockResolvedValueOnce(json({ items: [] }));
  await api.request("/items");
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    credentials: "omit",
    headers: { Authorization: "Bearer access" },
  });
});
it("never silently falls back to demo or exposes server diagnostics", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(json({ detail: "private server traceback" }, 500)),
  );
  const api = await import("../src/services/api");
  await expect(api.request("/items")).rejects.toThrow("could not complete");
});
it("shows the backend's registration validation messages without echoing submitted input", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      json(
        {
          error: "Validation Error",
          message: "Request validation failed",
          details: [
            {
              field: "body.password",
              message:
                "Value error, Password must contain at least one uppercase letter",
              code: "value_error",
              input: "must-not-be-displayed",
            },
          ],
        },
        422,
      ),
    ),
  );
  const api = await import("../src/services/api");
  await expect(
    api.register({
      name: "Mobile Test",
      email: "test@example.com",
      password: "weakpass",
    }),
  ).rejects.toMatchObject({
    status: 422,
    message: "Password must contain at least one uppercase letter",
  });
});
it("bounds malformed validation details and keeps non-validation errors unchanged", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      json(
        { details: [null, { message: 123 }, { message: "x".repeat(5000) }] },
        422,
      ),
    )
    .mockResolvedValueOnce(
      json(
        {
          message: "Please sign in again",
          details: [{ message: "Not a validation error" }],
        },
        401,
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  await expect(
    api.register({
      name: "Test",
      email: "test@example.com",
      password: "password",
    }),
  ).rejects.toMatchObject({
    message: `Invalid input. Invalid input. ${"x".repeat(200)}`,
  });
  await expect(api.login("test", "password")).rejects.toThrow(
    "Please sign in again",
  );
});

it("refuses redirects and sends no referrer or cacheable credentialed response", async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ items: [] }));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  await api.request("/items");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: "error",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
});

it("a 503 with Retry-After pauses every request except logout", async () => {
  vi.useFakeTimers();
  const response = json({ detail: "Server is busy." }, 503);
  response.headers.set("Retry-After", "60");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response)
    .mockImplementation(async () => json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  await expect(api.request("/items")).rejects.toMatchObject({
    status: 503,
    retryAfter: 60,
  });
  await expect(api.request("/categories")).rejects.toThrow("60 seconds");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await api.logout();
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_000);
  await expect(api.request("/items")).resolves.toEqual({ ok: true });
});

it("a 429 pauses only the limited endpoint, for its Retry-After", async () => {
  vi.useFakeTimers();
  const response = json({ error: "Rate limit exceeded: 3 per 1 hour" }, 429);
  response.headers.set("Retry-After", "3600");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response)
    .mockImplementation(async () => json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  await expect(api.register({})).rejects.toMatchObject({
    status: 429,
    retryAfter: 3600,
  });
  await expect(api.register({})).rejects.toThrow(
    "Too many attempts. Please try again in 3600 seconds.",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  // Signing in and reading the workspace are separate quotas.
  await expect(api.request("/items")).resolves.toEqual({ ok: true });
  await expect(api.request("/categories", "POST", {})).resolves.toEqual({
    ok: true,
  });
  await vi.advanceTimersByTimeAsync(3_600_000);
  await expect(api.register({})).resolves.toEqual({ ok: true });
});

it("a 503 without Retry-After shows the server's reason and pauses nothing", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      json(
        {
          detail:
            "Email service is not available. Account deletion requires email confirmation. Please try again later.",
        },
        503,
      ),
    )
    .mockResolvedValueOnce(
      new Response("<html>Service Unavailable</html>", {
        status: 503,
        headers: { "content-type": "text/html" },
      }),
    )
    .mockResolvedValueOnce(json({ id: "category" }, 201));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  await expect(api.request("/auth/me", "DELETE")).rejects.toMatchObject({
    status: 503,
    retryAfter: 0,
    message: expect.stringContaining("Email service is not available"),
  });
  await expect(api.request("/auth/me", "DELETE")).rejects.toThrow(
    "temporarily unavailable",
  );
  await expect(api.request("/categories", "POST", {})).resolves.toEqual({
    id: "category",
  });
});

it("does not accept an HTML challenge as a successful API response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("<html>challenge</html>", {
        headers: { "content-type": "text/html" },
      }),
    ),
  );
  const api = await import("../src/services/api");
  await expect(api.request("/items")).rejects.toMatchObject({ status: 502 });
});

it("does not automatically retry rate limits, authorization errors, or mutations", async () => {
  const api = await import("../src/services/api");
  for (const status of [401, 403, 409, 422, 429, 500, 503])
    expect(api.retryRead(0, new api.ApiError("test", status))).toBe(false);
  expect(api.retryRead(0, new api.ApiError("network"))).toBe(true);
  expect(api.retryRead(1, new api.ApiError("network"))).toBe(false);
});
it("invalidates late responses after account switch", async () => {
  let resolve!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
  );
  const api = await import("../src/services/api");
  const pending = api.request("/items");
  api.invalidateSession();
  resolve(json({ items: [{ name: "old account" }] }));
  await expect(pending).rejects.toThrow("account changed");
});
it("logout clears access even if cookie revocation fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ user, access_token: "access" }));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  await api.login("a", "b");
  fetcher.mockRejectedValueOnce(new Error("offline"));
  await expect(api.logout()).rejects.toThrow();
  fetcher.mockResolvedValueOnce(json({ items: [] }));
  await api.request("/items");
  expect(fetcher.mock.calls.at(-1)?.[1].headers.Authorization).toBeUndefined();
});
it("a 401 triggers only one replay after rotation", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ detail: "expired" }, 401))
    .mockResolvedValueOnce(json({ user, access_token: "new" }))
    .mockResolvedValueOnce(json({ items: [] }));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  await expect(api.request("/items")).resolves.toEqual({ items: [] });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("preserves a structured version conflict without confusing it with a duplicate-name rejection", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      json(
        {
          error: "Version conflict",
          message: "This item was modified by someone else.",
          server_version: 2,
        },
        409,
      ),
    )
    .mockResolvedValueOnce(
      json({ detail: "An item named 'Gloves' already exists" }, 409),
    );
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  await expect(api.request("/items/test", "PUT", {})).rejects.toMatchObject({
    status: 409,
    code: "Version conflict",
  });
  await expect(api.request("/items/test", "PUT", {})).rejects.toMatchObject({
    status: 409,
    code: "",
  });
});

function recordBroadcasts() {
  const posted: unknown[] = [];
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      addEventListener() {}
      postMessage(message: unknown) {
        posted.push(message);
      }
    },
  );
  return posted;
}

it("a failed sign-in keeps the current session and tells no other tab", async () => {
  const posted = recordBroadcasts();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ user, access_token: "current" }))
    .mockResolvedValueOnce(
      json({ detail: "Incorrect email/username or password" }, 401),
    )
    .mockResolvedValueOnce(json({ items: [] }));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  const invalidated = vi.fn();
  api.onSessionInvalidated(invalidated);
  await api.refresh();
  const epoch = api.sessionEpoch();
  await expect(api.login("caregiver", "mistyped")).rejects.toMatchObject({
    status: 401,
  });
  expect(posted).toEqual([]);
  expect(invalidated).not.toHaveBeenCalled();
  expect(api.sessionEpoch()).toBe(epoch);
  await api.request("/items");
  expect(fetcher.mock.calls.at(-1)?.[1].headers.Authorization).toBe(
    "Bearer current",
  );
});

it("a successful sign-in replaces the session in this and other tabs", async () => {
  const posted = recordBroadcasts();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ user, access_token: "current" }))
    .mockResolvedValueOnce(
      json({ user: { ...user, id: "other" }, access_token: "next" }),
    )
    .mockResolvedValueOnce(json({ items: [] }));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  const invalidated = vi.fn();
  api.onSessionInvalidated(invalidated);
  await api.refresh();
  await expect(api.login("other", "correct")).resolves.toMatchObject({
    id: "other",
  });
  expect(posted).toEqual(["account-change"]);
  expect(invalidated).toHaveBeenCalledTimes(1);
  await api.request("/items");
  expect(fetcher.mock.calls.at(-1)?.[1].headers.Authorization).toBe(
    "Bearer next",
  );
});

it("a refresh emptied by an account change elsewhere does not sign other tabs out", async () => {
  const posted = recordBroadcasts();
  let finishRegister: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/web-auth/register")
        ? new Promise<Response>((resolve) => {
            finishRegister = resolve;
          })
        : Promise.resolve(json({ detail: "expired" }, 401)),
    ),
  );
  const api = await import("../src/services/api");
  // Registration holds the cross-tab lock while this tab's request waits to refresh.
  const holding = api.register({}).catch(() => {});
  const pending = api.request("/items");
  await vi.waitFor(() => expect(finishRegister).toBeDefined());
  api.invalidateSession(false); // Another tab changed accounts meanwhile.
  finishRegister!(json({ verificationRequired: true, user }, 201));
  await holding;
  await expect(pending).rejects.toThrow("Account changed");
  expect(posted).not.toContain("logout");
});

it("keeps a failed logout signed out after a page reload", async () => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k),
    setItem: (k: string, v: string) => stored.set(k, v),
    removeItem: (k: string) => stored.delete(k),
  });
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetcher);
  const api = await import("../src/services/api");
  await expect(api.logout()).rejects.toThrow();
  vi.resetModules();
  const reloaded = await import("../src/services/api");
  await expect(reloaded.refresh()).resolves.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
