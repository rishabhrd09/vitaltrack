import type { User } from "../domain";
import { assertApiPath, boundedJson, retryAfterSeconds } from "./http-policy";
export const DEMO = import.meta.env.VITE_DATA_MODE === "demo";
export const API = import.meta.env.VITE_API_BASE_URL || "/api/v1";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public retryAfter = 0,
    public code = "",
  ) {
    super(message);
  }
}
let access = "",
  epoch = 0;
let refreshPromise: Promise<User | null> | null = null;
// A 429 pauses only its endpoint; a 503 with Retry-After is server-wide overload.
const SERVER = "*";
const cooldowns = new Map<string, { until: number; status: number }>();
const pending = new Set<AbortController>();
let invalidated = () => {};
// A non-sensitive logout marker prevents an unreachable logout from silently
// restoring its cookie session on reload. No credential or account data is stored.
const LOGOUT_MARKER = "carekosh-signed-out";
function sessionBlocked() {
  try {
    return localStorage.getItem(LOGOUT_MARKER) === "1";
  } catch {
    return false;
  }
}
function markSignedOut(value: boolean) {
  try {
    if (value) localStorage.setItem(LOGOUT_MARKER, "1");
    else localStorage.removeItem(LOGOUT_MARKER);
  } catch {
    /* In-memory invalidation still applies. */
  }
}
export function onSessionInvalidated(callback: () => void) {
  invalidated = callback;
}
export function sessionEpoch() {
  return epoch;
}
export function invalidateSession(broadcast = true) {
  epoch++;
  access = "";
  refreshPromise = null;
  for (const c of pending) c.abort();
  pending.clear();
  invalidated();
  if (broadcast) channel?.postMessage("logout");
}
const channel =
  !DEMO && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("carekosh-session")
    : null;
channel?.addEventListener("message", (e) => {
  if (e.data === "logout" || e.data === "account-change")
    invalidateSession(false);
});
function pauseMessage(status: number, seconds: number) {
  return status === 429
    ? `Too many attempts. Please try again in ${seconds} seconds.`
    : `CareKosh is temporarily busy. Please try again in ${seconds} seconds.`;
}
async function serviceDetail(res: Response) {
  try {
    const data = (await boundedJson(res)) as { detail?: unknown } | null;
    return typeof data?.detail === "string" ? data.detail.slice(0, 1000) : "";
  } catch {
    return "";
  }
}
async function serialized<T>(action: () => Promise<T>): Promise<T> {
  if (!navigator.locks)
    throw new ApiError(
      "This browser cannot safely coordinate sign-in across tabs. Use a current Chrome, Edge, Firefox, or Safari browser.",
    );
  return navigator.locks.request("carekosh-browser-session", action);
}
async function raw<T>(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = false,
  signal?: AbortSignal,
): Promise<T> {
  if (DEMO) throw new ApiError("Real API requests are disabled in this demo.");
  assertApiPath(path);
  const endpoint = `${method} ${path.split("?")[0]}`;
  // Always allow a logout attempt, including during a service cooldown.
  if (path !== "/web-auth/logout")
    for (const key of [SERVER, endpoint]) {
      const pause = cooldowns.get(key);
      if (pause && pause.until > Date.now()) {
        const seconds = Math.ceil((pause.until - Date.now()) / 1000);
        throw new ApiError(
          pauseMessage(pause.status, seconds),
          pause.status,
          seconds,
        );
      }
    }
  const start = epoch,
    controller = new AbortController();
  pending.add(controller);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(API + path, {
      method,
      signal: controller.signal,
      credentials: cookie ? "include" : "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie
          ? { "X-CareKosh-Web": "1" }
          : access
            ? { Authorization: `Bearer ${access}` }
            : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (start !== epoch)
      throw new ApiError("The account changed. Please try again.");
    if (res.status === 429 || res.status === 503) {
      const header = res.headers.get("Retry-After");
      // A 503 without Retry-After (e.g. email not configured) is not overload:
      // show the server's reason and pause nothing.
      const key = res.status === 429 ? endpoint : header ? SERVER : null;
      if (!key) {
        const detail = await serviceDetail(res);
        throw new ApiError(
          detail ||
            "CareKosh is temporarily unavailable. Please try again later.",
          res.status,
        );
      }
      const seconds = retryAfterSeconds(header);
      cooldowns.set(key, {
        until: Math.max(
          cooldowns.get(key)?.until ?? 0,
          Date.now() + seconds * 1000,
        ),
        status: res.status,
      });
      await res.body?.cancel();
      throw new ApiError(
        pauseMessage(res.status, seconds),
        res.status,
        seconds,
      );
    }
    if (res.status >= 500) {
      await res.body?.cancel();
      throw new ApiError(
        "CareKosh could not complete this request. Please try again later.",
        res.status,
      );
    }
    let data: Record<string, unknown>;
    try {
      data = (await boundedJson(res)) as Record<string, unknown>;
      if (!data || typeof data !== "object")
        throw new Error("Invalid response.");
    } catch {
      throw new ApiError(
        "The server returned an unexpected or oversized response. Please try again later.",
        res.ok ? 502 : res.status,
      );
    }
    if (start !== epoch)
      throw new ApiError("The account changed. Please try again.");
    if (!res.ok) {
      const detail = data.detail;
      throw new ApiError(
        typeof detail === "string"
          ? detail.slice(0, 1000)
          : Array.isArray(detail)
            ? detail
                .map((e: { msg?: string }) => e?.msg || "Invalid input")
                .join(". ")
                .slice(0, 1000)
            : res.status === 422 &&
                Array.isArray(data.details) &&
                data.details.length
              ? data.details
                  .slice(0, 5)
                  .map((e: { message?: unknown } | null) =>
                    typeof e?.message === "string"
                      ? e.message.replace(/^Value error, /, "").slice(0, 200)
                      : "Invalid input",
                  )
                  .join(". ")
                  .slice(0, 1000)
              : typeof data.message === "string"
                ? data.message.slice(0, 1000)
                : `Request failed (${res.status}).`,
        res.status,
        0,
        typeof data.error === "string" ? data.error.slice(0, 80) : "",
      );
    }
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      controller.signal.aborted
        ? "The request was interrupted. Refresh to check whether it completed."
        : "Could not reach CareKosh. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
    pending.delete(controller);
    signal?.removeEventListener("abort", abort);
  }
}
export async function refresh(): Promise<User | null> {
  if (sessionBlocked()) return null;
  if (refreshPromise) return refreshPromise;
  const start = epoch;
  const pendingRefresh = serialized(async () => {
    if (start !== epoch) return null;
    try {
      const data = await raw<{ user: User; access_token: string }>(
        "/web-auth/refresh",
        "POST",
        {},
        true,
      );
      access = data.access_token;
      return data.user;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        access = "";
        return null;
      }
      throw e;
    }
  }).finally(() => {
    if (refreshPromise === pendingRefresh) refreshPromise = null;
  });
  refreshPromise = pendingRefresh;
  return refreshPromise;
}
export async function login(identifier: string, password: string) {
  return serialized(async () => {
    const data = await raw<{ user: User; access_token: string }>(
      "/web-auth/login",
      "POST",
      { identifier, password },
      true,
    );
    // Only a successful sign-in replaces the session here and in other tabs.
    invalidateSession(false);
    channel?.postMessage("account-change");
    access = data.access_token;
    markSignedOut(false);
    return data.user;
  });
}
export async function logout() {
  // Keep the account invalidated even if the server is unreachable; report that failure.
  markSignedOut(true);
  invalidateSession();
  await serialized(() => raw("/web-auth/logout", "POST", {}, true));
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const start = epoch;
  try {
    return await raw<T>(path, method, body, false, signal);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401 || start !== epoch)
      throw e;
    const user = await refresh();
    // An account change elsewhere also empties this refresh; it is not a logout.
    if (start !== epoch) throw new ApiError("Account changed.");
    if (!user) {
      invalidateSession();
      throw new ApiError(
        "Your session has expired. Please sign in again.",
        401,
      );
    }
    return raw<T>(path, method, body, false, signal);
  }
}
export const register = (body: unknown) =>
  serialized(() =>
    raw<{ verificationRequired: boolean; user: User }>(
      "/web-auth/register",
      "POST",
      body,
      true,
    ),
  );

export const retryRead = (failureCount: number, error: Error) =>
  failureCount < 1 && error instanceof ApiError && error.status === 0;
export const readRetryDelay = () => 1000 + Math.floor(Math.random() * 1000);
