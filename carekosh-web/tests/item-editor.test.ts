import { expect, it } from "vitest";
import type { ItemInput } from "../src/domain";
import { itemTextError, stepItemQuantity } from "../src/services/item-editor";

const input: ItemInput = {
  name: "Gloves",
  categoryId: "supplies",
  quantity: 2,
  unit: "pairs",
  minimumStock: 5,
  isActive: true,
  isCritical: false,
};

it.each([
  [Number.NaN, 1, 1],
  [Number.NaN, -1, 0],
  [0, -1, 0],
  [999999, 1, 999999],
  [3, 1, 4],
  [3, -1, 2],
  [2.5, 1, 3],
  [Infinity, 1, 1],
] as const)(
  "quantity buttons recover from %s with step %s",
  (value, direction, expected) => {
    expect(stepItemQuantity(value, direction)).toBe(expected);
  },
);

it.each([
  ["description", "Description", "a".repeat(1000)],
  ["notes", "Notes", "अ".repeat(1000)],
  ["purchaseLink", "Purchase link", "https://example.com/" + "a".repeat(480)],
] as const)(
  "allows the API boundary for %s and rejects one extra character without truncation",
  (key, label, value) => {
    const valid = { ...input, [key]: value };
    expect(itemTextError(valid)).toBeNull();
    const tooLong = { ...input, [key]: value + "x" };
    expect(itemTextError(tooLong)).toContain(label);
    expect(itemTextError(tooLong)).toContain("Your text has been kept");
    expect(tooLong[key]).toBe(value + "x");
  },
);

it("uses the API's Unicode character count for saved text", () => {
  expect(itemTextError({ ...input, notes: "🧤".repeat(1000) })).toBeNull();
  expect(itemTextError({ ...input, notes: "🧤".repeat(1001) })).toContain(
    "1,000 characters",
  );
});
