import type { SupplyRun } from "../src/services/supply-review";

export function supplyFixture(patch: Partial<SupplyRun> = {}): SupplyRun {
  const created = new Date().toISOString(),
    expires = new Date(Date.now() + 900000).toISOString();
  return {
    id: "test-review",
    version: 1,
    status: "awaiting_review",
    created_at: created,
    expires_at: expires,
    snapshot_at: created,
    supply_revision: 3,
    proposal: {
      id: "test-proposal",
      version: 1,
      expires_at: expires,
      lines: [
        {
          item_id: "test-gloves",
          item_version: 1,
          name: "Gloves",
          unit: "pairs",
          supplier_name: "Test supplier",
          on_hand: 2,
          minimum_stock: 5,
          known_inbound: 1,
          target_quantity: 5,
          order_quantity: 2,
          reasons: [
            "Below the recorded minimum",
            "One pair is already recorded as ordered",
          ],
        },
      ],
    },
    questions: [],
    excluded: [],
    order_id: null,
    ...patch,
  };
}
