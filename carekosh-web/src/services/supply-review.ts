import { ApiError, DEMO, request, sessionEpoch } from "./api";

export type SupplyStatus =
  | "needs_input"
  | "awaiting_review"
  | "completed"
  | "cancelled"
  | "expired"
  | "stale";
export type SupplyLine = {
  item_id: string;
  item_version: number;
  name: string;
  unit: string;
  supplier_name: string | null;
  on_hand: number;
  minimum_stock: number;
  known_inbound: number;
  target_quantity: number;
  order_quantity: number;
  reasons: string[];
};
export type SupplyQuestion = {
  item_id: string;
  name: string;
  unit: string;
  code: string;
  message: string;
};
export type SupplyRun = {
  id: string;
  version: number;
  status: SupplyStatus;
  created_at: string;
  expires_at: string;
  snapshot_at: string;
  supply_revision: number;
  proposal: {
    id: string;
    version: number;
    expires_at: string;
    lines: SupplyLine[];
  } | null;
  questions: SupplyQuestion[];
  excluded: { item_id: string; name: string; reason: string }[];
  order_id: string | null;
};
export type SupplyCapabilities = {
  enabled: boolean;
  contract_version: 1;
  ttl_seconds: number;
  max_items: number;
  /** Client metadata; a missing endpoint differs from an operator pause. */
  supported?: boolean;
  has_history?: boolean;
};
export type SupplySummary = Pick<
  SupplyRun,
  "id" | "version" | "status" | "created_at" | "expires_at" | "order_id"
>;
export type SupplyAnswer = {
  item_id: string;
  target_quantity?: number;
  exclude?: boolean;
};
const unavailable: SupplyCapabilities = {
  enabled: false,
  contract_version: 1,
  ttl_seconds: 900,
  max_items: 500,
  supported: false,
};
const statuses = new Set<SupplyStatus>([
  "needs_input",
  "awaiting_review",
  "completed",
  "cancelled",
  "expired",
  "stale",
]);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 1000): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const number = (v: unknown, min = 0, max = 2_147_483_647): v is number =>
  Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const date = (v: unknown): v is string =>
  text(v, 80) && Number.isFinite(Date.parse(v));
const list = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.length <= 500;
const identity = (v: unknown): v is string =>
  text(v, 128) && /^[a-zA-Z0-9_-]+$/.test(v);
function invalid(): never {
  throw new Error(
    "The supply review response could not be verified. Refresh before reviewing or saving.",
  );
}
function unique(rows: { item_id: string }[]) {
  return new Set(rows.map((x) => x.item_id)).size === rows.length;
}
export function validateSupplyRun(value: unknown): SupplyRun {
  if (
    !record(value) ||
    !identity(value.id) ||
    !number(value.version, 1) ||
    !statuses.has(value.status as SupplyStatus) ||
    !date(value.created_at) ||
    !date(value.expires_at) ||
    !date(value.snapshot_at) ||
    !number(value.supply_revision) ||
    !(value.order_id === null || text(value.order_id, 100)) ||
    !list(value.questions) ||
    !list(value.excluded)
  )
    invalid();
  for (const q of value.questions)
    if (
      !record(q) ||
      !identity(q.item_id) ||
      !text(q.name, 255) ||
      !(typeof q.unit === "string" && q.unit.length <= 50) ||
      !text(q.code, 80) ||
      !text(q.message, 2000)
    )
      invalid();
  for (const row of value.excluded)
    if (
      !record(row) ||
      !identity(row.item_id) ||
      !text(row.name, 255) ||
      !text(row.reason, 2000)
    )
      invalid();
  if (value.proposal !== null) {
    const p = value.proposal;
    if (
      !record(p) ||
      !identity(p.id) ||
      !number(p.version, 1) ||
      !date(p.expires_at) ||
      !list(p.lines)
    )
      invalid();
    for (const row of p.lines) {
      if (
        !record(row) ||
        !identity(row.item_id) ||
        !number(row.item_version, 1) ||
        !text(row.name, 255) ||
        !text(row.unit, 50) ||
        !(
          row.supplier_name === null ||
          (typeof row.supplier_name === "string" &&
            row.supplier_name.length <= 255)
        ) ||
        !number(row.on_hand) ||
        !number(row.minimum_stock) ||
        !number(row.known_inbound) ||
        !number(row.target_quantity, 0, 999999) ||
        !number(row.order_quantity, 1, 999999) ||
        !list(row.reasons) ||
        row.reasons.length > 20 ||
        !row.reasons.every((r) => text(r, 2000))
      )
        invalid();
    }
    if (!unique(p.lines as SupplyLine[])) invalid();
  }
  if (
    !unique(value.questions as SupplyQuestion[]) ||
    !unique(value.excluded as { item_id: string }[])
  )
    invalid();
  if (
    value.status === "awaiting_review" &&
    (value.proposal === null || value.questions.length > 0)
  )
    invalid();
  if (value.status === "completed" && value.order_id === null) invalid();
  return value as unknown as SupplyRun;
}
export function validateSupplyCapabilities(value: unknown): SupplyCapabilities {
  if (
    !record(value) ||
    typeof value.enabled !== "boolean" ||
    !(
      value.has_history === undefined || typeof value.has_history === "boolean"
    ) ||
    value.contract_version !== 1 ||
    !number(value.ttl_seconds, 1, 86400) ||
    !number(value.max_items, 1, 500)
  )
    invalid();
  return value as SupplyCapabilities;
}
export function validateSupplySummary(value: unknown): SupplySummary {
  if (
    !record(value) ||
    !identity(value.id) ||
    !number(value.version, 1) ||
    !statuses.has(value.status as SupplyStatus) ||
    !date(value.created_at) ||
    !date(value.expires_at) ||
    !(value.order_id === null || text(value.order_id, 100))
  )
    invalid();
  return value as SupplySummary;
}
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (DEMO)
    throw new Error(
      "Supply review uses your authenticated inventory. It is unavailable in the demo.",
    );
  const epoch = sessionEpoch();
  const result = await request<unknown>(path, method, body, signal);
  if (epoch !== sessionEpoch() || signal?.aborted)
    throw new Error("Account or page changed. Supply review stopped.");
  return result;
}
function path(id: string) {
  if (!identity(id)) throw new Error("Invalid supply review ID.");
  return `/supply-reviews/${encodeURIComponent(id)}`;
}
function forRun(value: unknown, id: string) {
  const result = validateSupplyRun(value);
  if (result.id !== id) invalid();
  return result;
}
export const supplyReview = {
  async capabilities(signal?: AbortSignal): Promise<SupplyCapabilities> {
    if (DEMO) return unavailable;
    try {
      return {
        ...validateSupplyCapabilities(
          await call("/supply-reviews/capabilities", "GET", undefined, signal),
        ),
        supported: true,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return unavailable;
      throw error;
    }
  },
  async list(signal?: AbortSignal): Promise<SupplySummary[]> {
    const value = await call("/supply-reviews", "GET", undefined, signal);
    if (!record(value) || !Array.isArray(value.runs) || value.runs.length > 20)
      invalid();
    const runs = value.runs.map(validateSupplySummary);
    if (new Set(runs.map((r) => r.id)).size !== runs.length) invalid();
    return runs;
  },
  async start(requestId: string, signal?: AbortSignal): Promise<SupplyRun> {
    return validateSupplyRun(
      await call(
        "/supply-reviews",
        "POST",
        { request_id: requestId, target_mode: "minimum" },
        signal,
      ),
    );
  },
  async get(id: string, signal?: AbortSignal): Promise<SupplyRun> {
    return forRun(await call(path(id), "GET", undefined, signal), id);
  },
  async answer(
    run: SupplyRun,
    answers: SupplyAnswer[],
    signal?: AbortSignal,
  ): Promise<SupplyRun> {
    return forRun(
      await call(
        `${path(run.id)}/answers`,
        "POST",
        { expected_run_version: run.version, answers },
        signal,
      ),
      run.id,
    );
  },
  async refresh(run: SupplyRun, signal?: AbortSignal): Promise<SupplyRun> {
    return forRun(
      await call(
        `${path(run.id)}/refresh`,
        "POST",
        { expected_run_version: run.version },
        signal,
      ),
      run.id,
    );
  },
  async cancel(run: SupplyRun, signal?: AbortSignal): Promise<SupplyRun> {
    return forRun(
      await call(
        `${path(run.id)}/cancel`,
        "POST",
        { expected_run_version: run.version },
        signal,
      ),
      run.id,
    );
  },
  async confirm(
    run: SupplyRun,
    key: string,
    signal?: AbortSignal,
  ): Promise<SupplyRun> {
    if (
      !run.proposal ||
      !run.proposal.lines.length ||
      run.status !== "awaiting_review" ||
      run.questions.length
    )
      throw new Error("Review the current proposal before confirming.");
    return forRun(
      await call(
        `${path(run.id)}/confirm`,
        "POST",
        {
          expected_run_version: run.version,
          proposal_id: run.proposal.id,
          proposal_version: run.proposal.version,
          idempotency_key: key,
        },
        signal,
      ),
      run.id,
    );
  },
};
/** Local clocks inform the UI; the server repeats expiry and snapshot checks transactionally. */
export function canConfirmSupply(run: SupplyRun, now = Date.now()) {
  return (
    run.status === "awaiting_review" &&
    !!run.proposal?.lines.length &&
    !run.questions.length &&
    Date.parse(run.expires_at) > now &&
    Date.parse(run.proposal.expires_at) > now
  );
}
export function groupedSupplyLines(lines: SupplyLine[]) {
  const groups = new Map<string, SupplyLine[]>();
  for (const line of lines) {
    const name = line.supplier_name?.trim() || "Unspecified supplier";
    const existing = groups.get(name);
    if (existing) existing.push(line);
    else groups.set(name, [line]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}
