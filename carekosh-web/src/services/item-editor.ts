import type { ItemInput } from "../domain";

export function stepItemQuantity(value: number, direction: -1 | 1): number {
  const current = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(0, Math.min(999999, current + direction));
}

// Keep both item forms and programmatic validation within the existing API's
// create/update contract. These are character limits, not truncation rules.
export const ITEM_TEXT_LIMITS = {
  description: 1000,
  notes: 1000,
  purchaseLink: 500,
} as const;

export function itemTextError(input: ItemInput): string | null {
  const labels = {
    description: "Description",
    notes: "Notes",
    purchaseLink: "Purchase link",
  };
  for (const key of Object.keys(ITEM_TEXT_LIMITS) as Array<
    keyof typeof ITEM_TEXT_LIMITS
  >) {
    if ([...(input[key] || "")].length > ITEM_TEXT_LIMITS[key])
      return `${labels[key]} must be ${ITEM_TEXT_LIMITS[key].toLocaleString("en-IN")} characters or fewer. Your text has been kept; shorten it before saving.`;
  }
  return null;
}
