import { isCriticalEquipment, type Category, type Item } from "../mobile-types";
import {
  Clarification,
  evaluateSelection,
  resolveItem,
  type Evaluation,
} from "./selection";
import { condition, toPlan, type Plan, type Specification } from "./contracts";
export type CartItem = {
  item: Item;
  quantity: number;
  source: "spoken" | "suggested" | "manual";
  basis?: string;
};
export function suggestedQuantity(item: Item): number | null {
  return Number.isFinite(item.minimumStock) &&
    item.minimumStock > 0 &&
    Number.isFinite(item.quantity)
    ? Math.max(Math.ceil(item.minimumStock - item.quantity), 1)
    : null;
}
const unitKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/s$/, "")
    .replace(/^boxe$/, "box");
/** Why a calculated quantity was proposed; shown beside the "Suggested" label. */
export function suggestionBasis(item: Item): string {
  if (item.minimumStock - item.quantity >= 1)
    return `Suggested · brings stock from ${item.quantity} to its minimum of ${item.minimumStock}`;
  return isCriticalEquipment(item) && item.quantity <= 1
    ? "Suggested · 1 backup for critical equipment"
    : `Suggested · 1; stock already meets its minimum of ${item.minimumStock}`;
}
export type DraftContext = {
  categories?: Category[];
  categoriesKnown?: boolean;
  /** Rows of the previous result, for a selection with scope=previous. */
  previous?: Item[];
  /** Items a line with target=previous may mean: the draft or single item just shown. */
  focus?: Item[];
};
function focusItem(
  context: DraftContext,
  active: Item[],
  chosen?: string,
): Item {
  const fresh = new Map(active.map((i) => [i.id, i]));
  const candidates = (context.focus || [])
    .map((i) => fresh.get(i.id))
    .filter((i): i is Item => !!i);
  const picked = candidates.find((i) => i.id === chosen);
  if (picked) return picked;
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length)
    throw new Clarification(
      "Name the item to change, for example “add five more hand gloves to the draft”. No draft changes were made.",
    );
  throw new Clarification(
    "Choose the draft item to change. No draft changes were made.",
    "__previous__",
    candidates.slice(0, 20),
  );
}
/** Explicit quantities first, then calculated suggestions for the selected rows; one row per item ID. Nothing is saved. */
export function prepareDraftResult(
  s: Specification | Plan,
  items: Item[],
  existing: CartItem[],
  selected: Record<string, string> = {},
  context: DraftContext = {},
): { rows: CartItem[]; evaluation?: Evaluation } {
  const p = toPlan(s);
  if (p.intent !== "draft_order" || !p.draft)
    throw new Error("Only a local draft specification is allowed.");
  const active = items.filter((i) => i.isActive);
  const rows = new Map(
    existing.map((r) => [r.item.id, { ...r, item: { ...r.item } }]),
  );
  const quantities = new Map<string, number>();
  const operations = new Map<string, string>();
  const removed = new Set<string>();
  for (const line of p.draft.lines) {
    const item =
      line.target === "previous"
        ? focusItem(context, active, selected.__previous__)
        : resolveItem(line.item_query!, active, selected[line.item_query!]);
    if (Array.isArray(item))
      throw new Clarification(
        `Choose the item meant by “${line.item_query}”. No draft changes were made.`,
        line.item_query!,
        item,
      );
    const prior = operations.get(item.id);
    if (prior && (prior !== line.operation || line.operation === "add"))
      throw new Clarification(
        `Conflicting draft operations for ${item.name}. Say one final quantity.`,
      );
    operations.set(item.id, line.operation);
    if (line.operation === "remove") {
      rows.delete(item.id);
      removed.add(item.id);
      continue;
    }
    if (line.quantity === null)
      throw new Clarification(
        `Say the order quantity for ${item.name}, in ${item.unit}.`,
      );
    if (line.unit && unitKey(line.unit) !== unitKey(item.unit))
      throw new Clarification(
        `${item.name} is recorded in ${item.unit}. You said ${line.unit}; no conversion was made. Please specify the quantity in ${item.unit}.`,
      );
    if (quantities.has(item.id)) {
      if (quantities.get(item.id) !== line.quantity || line.operation === "add")
        throw new Clarification(
          `Conflicting or repeated quantities for ${item.name}. Say one final quantity.`,
        );
      continue;
    }
    quantities.set(item.id, line.quantity);
    const before = rows.get(item.id)?.quantity || 0;
    const quantity =
      line.operation === "add" ? before + line.quantity : line.quantity;
    if (!Number.isInteger(quantity) || quantity > 999_999)
      throw new Clarification("Use an order quantity between 1 and 999,999.");
    rows.set(item.id, {
      item,
      quantity,
      source: "spoken",
      basis:
        line.operation === "add" && before
          ? `Your request · ${before} + ${line.quantity}`
          : "Your request",
    });
  }
  let evaluation: Evaluation | undefined;
  if (p.draft.include_selection && p.selection) {
    evaluation = evaluateSelection(p.selection, items, {
      categories: context.categories || [],
      categoriesKnown: context.categoriesKnown,
      previous: context.previous,
      selected,
    });
    if (p.selection.exclude.length && quantities.size) {
      // Exclusions belong to the requested draft, including explicit lines that
      // do not match a replenishment group. Conflicting instructions need a
      // decision; neither the explicit quantity nor the exclusion wins silently.
      const excluded = evaluateSelection(
        { ...p.selection, scope: "inventory", any_of: [condition()] },
        items,
        {
          categories: context.categories || [],
          categoriesKnown: context.categoriesKnown,
          selected,
        },
      ).excluded;
      const conflict = excluded.find(({ item }) => quantities.has(item.id));
      if (conflict)
        throw new Clarification(
          `${conflict.item.name} has an explicit order quantity and is also excluded. Say whether to include or exclude it. No draft changes were made.`,
        );
    }
    const missing: Item[] = [];
    for (const item of evaluation.rows) {
      if (rows.has(item.id) || removed.has(item.id)) continue; // explicit quantities and existing reviewed lines win
      const quantity = suggestedQuantity(item);
      if (quantity === null) {
        missing.push(item);
        continue;
      }
      rows.set(item.id, {
        item,
        quantity,
        source: "suggested",
        basis: suggestionBasis(item),
      });
    }
    if (missing.length) {
      const names =
        missing
          .slice(0, 5)
          .map((i) => i.name)
          .join(", ") +
        (missing.length > 5 ? ` and ${missing.length - 5} more` : "");
      throw new Clarification(
        `No meaningful minimum stock is recorded for ${names}. Say ${missing.length === 1 ? "its" : "their"} order quantity explicitly, or exclude ${missing.length === 1 ? "it" : "them"}. No draft changes were made.`,
      );
    }
  }
  if (rows.size > 1000)
    throw new Clarification(
      "An order supports at most 1,000 lines. Narrow this draft.",
    );
  return { rows: [...rows.values()], evaluation };
}
