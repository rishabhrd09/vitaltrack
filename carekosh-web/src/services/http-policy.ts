// Browser safeguards bound accidental load. Server/edge limits remain authoritative.
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export function retryAfterSeconds(value: string | null, now = Date.now()) {
  if (!value) return 30;
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) ? Math.max(1, Math.min(86400, seconds)) : 30;
}
export function assertApiPath(path: string) {
  if (!/^\/(?!\/)[^\s\\#]*$/.test(path)) throw new Error("Invalid API path.");
  const pathname = path.split("?")[0];
  for (const segment of pathname.split("/")) {
    const decoded = decodeURIComponent(segment);
    if (decoded === "." || decoded === ".." || /[\\/]/.test(decoded))
      throw new Error("Invalid API path.");
  }
}
export async function boundedJson(response: Response): Promise<unknown> {
  if (response.status === 204) return {};
  if (
    !/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    )
  )
    throw new Error(
      "The server returned an unexpected response. Please try again later.",
    );
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("The response is too large to load safely.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The server returned an empty response.");
  const decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("The response is too large to load safely.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
