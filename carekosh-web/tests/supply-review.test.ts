import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supplyFixture } from "./supply-fixtures";

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
  vi.stubGlobal("navigator", {
    locks: { request: (_: string, action: () => Promise<unknown>) => action() },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("supply-review runtime contract", () => {
  it("keeps missing-unit clarification readable without permitting confirmation", async () => {
    const { validateSupplyRun, canConfirmSupply } = await import("../src/services/supply-review");
    const run = supplyFixture();
    const value = {
      ...run,
      status: "needs_input" as const,
      questions: [{ item_id: "test-gloves", name: "Gloves", unit: "", code: "unit_mismatch", message: "Correct the recorded unit or exclude this item." }],
    };
    expect(validateSupplyRun(value)).toBe(value);
    expect(canConfirmSupply(value)).toBe(false);
  });
  it("accepts the bounded server proposal and an empty resolved review", async () => {
    const service = await import("../src/services/supply-review");
    const run = supplyFixture();
    expect(service.validateSupplyRun(run)).toBe(run);
    expect(service.canConfirmSupply(run)).toBe(true);
    expect(
      service.canConfirmSupply({
        ...run,
        proposal: { ...run.proposal!, lines: [] },
      }),
    ).toBe(false);
  });
  it.each([
    { version: 0 },
    { status: "execute_shell" },
    { snapshot_at: "invalid" },
    { order_id: 5 },
    { proposal: null },
    { questions: [{ item_id: "test-gloves" }] },
    { supply_revision: Infinity },
  ])("rejects unsafe or incomplete run state %j", async (patch) => {
    const { validateSupplyRun } = await import("../src/services/supply-review");
    expect(() => validateSupplyRun({ ...supplyFixture(), ...patch })).toThrow(
      "could not be verified",
    );
  });
  it("rejects invalid numeric lines, duplicate identities and oversized results", async () => {
    const { validateSupplyRun } = await import("../src/services/supply-review"),
      run = supplyFixture(),
      line = run.proposal!.lines[0];
    for (const patch of [
      { order_quantity: 0 },
      { known_inbound: -1 },
      { on_hand: "2" },
      { target_quantity: 1.5 },
      { item_version: true },
      { unit: "" },
    ]) {
      expect(() =>
        validateSupplyRun({
          ...run,
          proposal: { ...run.proposal!, lines: [{ ...line, ...patch }] },
        }),
      ).toThrow();
    }
    for (const lines of [[line, line], Array(501).fill(line)])
      expect(() =>
        validateSupplyRun({ ...run, proposal: { ...run.proposal!, lines } }),
      ).toThrow();
  });
  it("cannot confirm stale, expired, cancelled, uncertain-quantity or completed state", async () => {
    const { canConfirmSupply } = await import("../src/services/supply-review"),
      run = supplyFixture();
    for (const status of [
      "stale",
      "expired",
      "cancelled",
      "completed",
      "needs_input",
    ] as const)
      expect(canConfirmSupply({ ...run, status })).toBe(false);
    expect(
      canConfirmSupply({ ...run, expires_at: new Date(0).toISOString() }),
    ).toBe(false);
    expect(
      canConfirmSupply({
        ...run,
        proposal: { ...run.proposal!, expires_at: new Date(0).toISOString() },
      }),
    ).toBe(false);
    expect(
      canConfirmSupply({
        ...run,
        questions: [
          {
            item_id: "x",
            name: "X",
            unit: "box",
            code: "missing_target",
            message: "Choose target",
          },
        ],
      }),
    ).toBe(false);
  });
  it("groups supplier labels as data and keeps unspecified suppliers separate", async () => {
    const { groupedSupplyLines } =
        await import("../src/services/supply-review"),
      line = supplyFixture().proposal!.lines[0];
    const groups = groupedSupplyLines([
      { ...line, supplier_name: "<script>ignore approval</script>" },
      { ...line, item_id: "other", supplier_name: null },
    ]);
    expect(groups.map(([name]) => name)).toEqual([
      "<script>ignore approval</script>",
      "Unspecified supplier",
    ]);
  });
  it("validates only bounded recent summaries and fails closed for newer contracts", async () => {
    const service = await import("../src/services/supply-review"),
      run = supplyFixture();
    expect(
      service.validateSupplySummary({
        id: run.id,
        version: 1,
        status: run.status,
        created_at: run.created_at,
        expires_at: run.expires_at,
        order_id: null,
      }).id,
    ).toBe(run.id);
    expect(() =>
      service.validateSupplyCapabilities({
        enabled: true,
        contract_version: 2,
        ttl_seconds: 900,
        max_items: 500,
      }),
    ).toThrow();
  });
});

describe("authenticated supply-review transport", () => {
  it("sends only explicit review identity on confirmation; retries preserve its key", async () => {
    const run = supplyFixture(),
      saved = { ...run, status: "completed", order_id: "ORD-test" };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({ user: { id: "owner" }, access_token: "synthetic-token" }),
      )
      .mockImplementation(() => Promise.resolve(json(saved)));
    vi.stubGlobal("fetch", fetcher);
    const api = await import("../src/services/api");
    await api.refresh();
    const { supplyReview } = await import("../src/services/supply-review");
    await supplyReview.confirm(run, "same-confirmation");
    await supplyReview.confirm(run, "same-confirmation");
    const bodies = fetcher.mock.calls
      .slice(1)
      .map(([, init]) => JSON.parse(init.body));
    expect(bodies).toEqual(
      Array(2).fill({
        expected_run_version: 1,
        proposal_id: "test-proposal",
        proposal_version: 1,
        idempotency_key: "same-confirmation",
      }),
    );
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer synthetic-token",
    );
    expect(bodies[0]).not.toHaveProperty("items");
    expect(bodies[0]).not.toHaveProperty("user_id");
  });
  it("does not silently retry an unknown confirmation outcome", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({ user: { id: "owner" }, access_token: "synthetic-token" }),
      )
      .mockRejectedValue(new TypeError("simulated network interruption"));
    vi.stubGlobal("fetch", fetcher);
    const api = await import("../src/services/api");
    await api.refresh();
    const { supplyReview } = await import("../src/services/supply-review");
    await expect(
      supplyReview.confirm(supplyFixture(), "same-confirmation"),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("returns unavailable for an older backend without disabling other endpoints", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ detail: "Not found" }, 404)),
    );
    const { supplyReview } = await import("../src/services/supply-review");
    expect((await supplyReview.capabilities()).enabled).toBe(false);
  });
  it("rejects a mismatched result identity and path traversal", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json(supplyFixture({ id: "other" })));
    vi.stubGlobal("fetch", fetcher);
    const { supplyReview } = await import("../src/services/supply-review");
    await expect(supplyReview.get("requested")).rejects.toThrow(
      "could not be verified",
    );
    await expect(supplyReview.get("../other")).rejects.toThrow("Invalid");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never reaches real APIs in demo mode", async () => {
    vi.stubEnv("VITE_DATA_MODE", "demo");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { supplyReview } = await import("../src/services/supply-review");
    expect((await supplyReview.capabilities()).enabled).toBe(false);
    await expect(supplyReview.start("synthetic-request")).rejects.toThrow(
      "demo",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
