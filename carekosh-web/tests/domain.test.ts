import { describe, it, expect } from "vitest";
import {
  type Item,
  isLowStock,
  isOutOfStock,
  backup,
  initialDraft,
  makeOrderRequest,
  validateQuantity,
} from "../src/domain";
import { routeLocally } from "../src/domain/assistant/queries";
import { toPlan } from "../src/domain/assistant/contracts";
import { prepareDraftResult } from "../src/domain/assistant/drafts";
import { SEED_DATA } from "../src/domain/catalog";
const item = (p: Partial<Item> = {}): Item => ({
  id: "a",
  name: "Gloves",
  categoryId: "c",
  quantity: 2,
  minimumStock: 5,
  unit: "pieces",
  isActive: true,
  isCritical: false,
  version: 3,
  createdAt: "2026-10-24",
  updatedAt: "2026-10-24",
  ...p,
});
describe("Android stock parity", () => {
  it("keeps the exact starter catalog", () => {
    expect(SEED_DATA).toHaveLength(10);
    expect(SEED_DATA.flatMap((c) => c.items)).toHaveLength(32);
  });
  it("separates no stock from low stock", () => {
    expect(isOutOfStock(item({ quantity: 0 }))).toBe(true);
    expect(isLowStock(item({ quantity: 0 }))).toBe(false);
    expect(isLowStock(item())).toBe(true);
  });
  it("emergency review matches only active critical backup equipment", () => {
    const rows = [
      item({ id: "critical-one", isCritical: true, quantity: 1 }),
      item({ id: "critical-zero", isCritical: true, quantity: 0 }),
      item({ id: "ordinary-zero", quantity: 0 }),
      item({ id: "inactive", isCritical: true, quantity: 0, isActive: false }),
      item({ id: "enough", isCritical: true, quantity: 3 }),
    ];
    expect(
      initialDraft(rows, true)
        .map((r) => r.item.id)
        .sort(),
    ).toEqual(["critical-one"]);
    expect(initialDraft(rows).map((r) => r.item.id)).toContain("ordinary-zero");
  });
  it("one critical unit needs a backup even at minimum", () => {
    const x = item({
      name: "Oxygen Cylinder",
      isCritical: true,
      quantity: 1,
      minimumStock: 1,
    });
    expect(isLowStock(x)).toBe(false);
    expect(backup(x)).toBe(true);
    expect(initialDraft([x])[0].quantity).toBe(1);
  });
  it("ordinary single item is low only below its recorded minimum", () => {
    expect(isLowStock(item({ quantity: 1, minimumStock: 1 }))).toBe(false);
    expect(isLowStock(item({ quantity: 1, minimumStock: 2 }))).toBe(true);
    expect(isLowStock(item({ quantity: 1, minimumStock: 0 }))).toBe(false);
  });
  it("legacy keyword recognition cannot invent an explicit backup flag", () => {
    expect(
      backup(
        item({
          name: "Oxygen Cylinder",
          isCritical: false,
          quantity: 1,
          minimumStock: 1,
        }),
      ),
    ).toBe(false);
  });
  it("order payload preserves versions and idempotency key", () => {
    const payload = makeOrderRequest(
      initialDraft([
        item({
          supplierName: "Example supplier",
          imageUri: "https://example.com/supply.png",
          purchaseLink: "https://example.com/supply",
        }),
      ]),
      "attempt-one",
    );
    expect(payload.localId).toBe("attempt-one");
    expect(payload.items[0]).toMatchObject({
      expectedVersion: 3,
      quantity: 3,
      currentStock: 2,
      supplierName: "Example supplier",
      imageUri: "https://example.com/supply.png",
      purchaseLink: "https://example.com/supply",
    });
    expect(payload.totalUnits).toBe(3);
  });
  it("rejects fractions, negative quantities and duplicated order lines", () => {
    expect(validateQuantity(1.2)).toBe(false);
    expect(validateQuantity(-1)).toBe(false);
    expect(validateQuantity(0, true)).toBe(false);
    const rows = initialDraft([item()]);
    expect(() => makeOrderRequest([...rows, ...rows], "a")).toThrow();
  });
  it("reuses deterministic Android draft interpretation without mutating stock", () => {
    const stock = [item()];
    const command = routeLocally("Prepare a draft for all low-stock items", [
      "Gloves",
    ]);
    expect(command && "version" in command).toBe(true);
    if (!command || !("version" in command)) throw new Error("Expected draft");
    const result = prepareDraftResult(
      toPlan(command),
      stock,
      [],
      {},
      { categories: [] },
    );
    expect(result.rows[0].quantity).toBe(3);
    expect(stock[0].quantity).toBe(2);
  });
});

it("does not invent an order quantity when no meaningful minimum exists", () => {
  const row = initialDraft([item({ quantity: 0, minimumStock: 0 })])[0];
  expect(Number.isNaN(row.quantity)).toBe(true);
  expect(() => makeOrderRequest([row], "zero-minimum")).toThrow();
});
