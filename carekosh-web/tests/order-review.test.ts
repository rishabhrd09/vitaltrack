import { describe, expect, it } from "vitest";
import {
  saveReviewedOrder,
  mergeMissingRows,
  type OrderDraft,
  type OrderReview,
} from "../src/services/order-review";
import {
  initialDraft,
  type Item,
  type OrderRequest,
  type SavedOrder,
} from "../src/domain";
const item: Item = {
  id: "supply",
  name: "Test supply",
  quantity: 1,
  minimumStock: 5,
  unit: "packs",
  isCritical: false,
  isActive: true,
  categoryId: "test",
  version: 1,
  createdAt: "2026-10-25",
  updatedAt: "2026-10-25",
};
function harness() {
  let draft: OrderDraft | null = { rows: initialDraft([item]) },
    active = true;
  const posts: OrderRequest[] = [],
    confirmations: boolean[] = [];
  const result = { id: "saved", orderId: "ORD-test" } as SavedOrder;
  const review: OrderReview = {
    getDraft: () => draft,
    replaceDraft: (expected, next) => {
      if (draft !== expected) return false;
      draft = next;
      return true;
    },
    active: () => active,
    check: async () => [item],
    confirm: async (retry) => {
      confirmations.push(retry);
      return true;
    },
    create: async (payload) => {
      posts.push(payload);
      return result;
    },
    recover: async () => {
      throw new Error("Lookup unavailable");
    },
    stage: () => {},
  };
  return {
    review,
    posts,
    confirmations,
    result,
    get draft() {
      return draft;
    },
    set draft(value) {
      draft = value;
    },
    leave() {
      active = false;
    },
  };
}
const rejected = (status: number) =>
  Object.assign(new Error("Simulated response"), { status });
describe("reviewed-order recovery", () => {
  it("does not save without explicit confirmation", async () => {
    const h = harness();
    h.review.confirm = async () => false;
    await saveReviewedOrder(h.review);
    expect(h.posts).toHaveLength(0);
    expect(h.draft?.attempt).toBeUndefined();
  });
  it("requires fresh review after inventory changes and retains the requested quantity", async () => {
    const h = harness();
    h.review.check = async () => [{ ...item, version: 2 }];
    await expect(saveReviewedOrder(h.review)).rejects.toThrow(
      "Inventory changed",
    );
    expect(h.posts).toHaveLength(0);
    expect(h.draft?.rows[0].quantity).toBe(4);
  });
  it("keeps an unknown request locked after a retry rejection and reuses its exact payload", async () => {
    const h = harness();
    let count = 0;
    h.review.create = async (payload) => {
      h.posts.push(payload);
      if (count++ === 0) throw rejected(0);
      if (count === 2) throw rejected(409);
      return h.result;
    };
    await expect(saveReviewedOrder(h.review)).rejects.toThrow();
    const original = h.draft?.attempt;
    await expect(saveReviewedOrder(h.review)).rejects.toThrow();
    expect(h.draft?.attempt).toBe(original);
    await saveReviewedOrder(h.review);
    expect(h.posts.every((p) => p === original)).toBe(true);
    expect(h.confirmations).toEqual([false, true, true]);
    expect(h.draft?.saved).toBe(h.result);
  });
  it("unlocks a definitively rejected first request for correction", async () => {
    const h = harness();
    h.review.create = async () => {
      throw rejected(422);
    };
    await expect(saveReviewedOrder(h.review)).rejects.toThrow();
    expect(h.draft?.attempt).toBeUndefined();
    expect(h.draft?.rows[0].quantity).toBe(4);
  });
  it("cannot save after leaving during preflight", async () => {
    const h = harness();
    h.review.check = async () => {
      h.leave();
      return [item];
    };
    await saveReviewedOrder(h.review);
    expect(h.posts).toHaveLength(0);
    expect(h.confirmations).toHaveLength(0);
  });
  it("requires removing and re-adding a line when its unit changes", async () => {
    const h = harness();
    h.review.check = async () => [{ ...item, unit: "boxes", version: 2 }];
    await expect(saveReviewedOrder(h.review)).rejects.toThrow("unit changed");
    expect(h.posts).toHaveLength(0);
    expect(h.draft?.rows[0].item.unit).toBe("packs");
  });
  it("cannot save a stale confirmation after the draft or account changes", async () => {
    const h = harness();
    h.review.confirm = async () => {
      h.draft = { rows: [] };
      return true;
    };
    await saveReviewedOrder(h.review);
    expect(h.posts).toHaveLength(0);
    expect(h.draft?.rows).toEqual([]);
  });
  it("retains the confirmed response after navigation", async () => {
    const h = harness();
    h.review.create = async () => {
      h.leave();
      return h.result;
    };
    await saveReviewedOrder(h.review);
    expect(h.draft?.saved).toBe(h.result);
  });
  it("a late success cannot replace a newer cart", async () => {
    const h = harness();
    const next = { rows: [] };
    h.review.create = async () => {
      h.draft = next;
      return h.result;
    };
    await saveReviewedOrder(h.review);
    expect(h.draft).toBe(next);
  });
  it("a late first-request rejection cannot unlock a remounted retry", async () => {
    const h = harness();
    const failures: Array<(error: Error) => void> = [];
    h.review.create = () =>
      new Promise((_, reject) => {
        failures.push(reject);
      });
    const original = saveReviewedOrder(h.review);
    while (failures.length < 1) await Promise.resolve();
    const request = h.draft!.attempt;
    const retry = saveReviewedOrder(h.review);
    while (failures.length < 2) await Promise.resolve();
    failures[0](rejected(422));
    await expect(original).rejects.toThrow();
    expect(h.draft?.attempt).toBe(request);
    failures[1](rejected(409));
    await expect(retry).rejects.toThrow();
    expect(h.draft?.attempt).toBe(request);
  });
  it("merging emergency rows retains user quantities and adds only missing items", () => {
    const existing = [{ item, quantity: 17, source: "manual" as const }];
    const incoming = initialDraft([item, { ...item, id: "other" }]);
    const merged = mergeMissingRows(existing, incoming);
    expect(merged.map((r) => [r.item.id, r.quantity])).toEqual([
      ["supply", 17],
      ["other", 4],
    ]);
    expect(merged[0]).toBe(existing[0]);
  });
});

it("unlocks a rejected retry only after lookup, retaining its submission ID across edits", async () => {
  const h = harness();
  h.review.create = async () => {
    throw rejected(0);
  };
  await expect(saveReviewedOrder(h.review)).rejects.toThrow();
  const key = h.draft!.attempt!.localId;
  h.review.create = async () => {
    throw rejected(409);
  };
  h.review.recover = async () => null;
  await expect(saveReviewedOrder(h.review)).rejects.toThrow();
  expect(h.draft?.attempt).toBeUndefined();
  expect(h.draft?.submissionId).toBe(key);
  h.draft!.rows[0].quantity = 7;
  h.review.create = async (payload) => {
    expect(payload.localId).toBe(key);
    expect(payload.items[0].quantity).toBe(7);
    return h.result;
  };
  expect(await saveReviewedOrder(h.review)).toBe(h.result);
});

it("recovers the original saved order when a late response overlaps an edited retry", async () => {
  const h = harness();
  h.draft = { ...h.draft!, submissionId: "original-key" };
  h.review.create = async () => {
    throw rejected(409);
  };
  h.review.recover = async (key) => {
    expect(key).toBe("original-key");
    return h.result;
  };
  expect(await saveReviewedOrder(h.review)).toBe(h.result);
  expect(h.draft?.saved).toBe(h.result);
});
