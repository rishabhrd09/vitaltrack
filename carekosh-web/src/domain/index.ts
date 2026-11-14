export * from "./mobile-types";
import {
  isCriticalEquipment,
  isLowStock,
  isOutOfStock,
  needsEmergencyBackup,
  type Item,
  type SavedOrder,
} from "./mobile-types";
export type ItemInput = Omit<
  Item,
  "id" | "version" | "createdAt" | "updatedAt" | "localId"
>;
export type DraftRow = {
  item: Item;
  quantity: number;
  source: "suggested" | "manual";
};
export type OrderRequest = {
  localId: string;
  items: {
    itemId: string;
    name: string;
    quantity: number;
    expectedVersion: number;
    unit: string;
    currentStock: number;
    minimumStock: number;
    brand?: string;
    supplierName?: string;
    imageUri?: string;
    purchaseLink?: string;
  }[];
  orderId: string;
  totalItems: number;
  totalUnits: number;
  status: "pending";
  exportedAt: string;
};
export const attention = (i: Item) =>
  isOutOfStock(i) || isLowStock(i) || needsEmergencyBackup(i);
export const backup = needsEmergencyBackup;
export const stockStatus = (i: Item) =>
  isOutOfStock(i) ? "out" : isLowStock(i) ? "low" : "good";
export const statusLabel = (i: Item) =>
  ({ out: "Out of stock", low: "Low stock", good: "In stock" })[stockStatus(i)];
export const suggestedQuantity = (i: Item) =>
  Number.isFinite(i.minimumStock) && i.minimumStock > 0
    ? Math.max(Math.ceil(i.minimumStock - i.quantity), 1)
    : null;
export const activeOrders = (orders: SavedOrder[]) =>
  orders.filter((o) => ["pending", "ordered", "received"].includes(o.status));
export function initialDraft(items: Item[], emergency = false): DraftRow[] {
  return items
    .filter(
      (i) => i.isActive && (emergency ? backup(i) : attention(i) || backup(i)),
    )
    .sort(
      (a, b) =>
        Number(isCriticalEquipment(b)) - Number(isCriticalEquipment(a)) ||
        a.name.localeCompare(b.name),
    )
    .map((item) => ({
      item,
      quantity: suggestedQuantity(item) ?? Number.NaN,
      source: "suggested",
    }));
}
export function validateQuantity(n: number, positive = false) {
  return Number.isInteger(n) && n >= (positive ? 1 : 0) && n <= 999999;
}
export function makeOrderRequest(
  rows: DraftRow[],
  localId: string,
): OrderRequest {
  if (
    !rows.length ||
    rows.length > 1000 ||
    rows.some((r) => !validateQuantity(r.quantity, true))
  )
    throw new Error(
      "Every order line needs a whole quantity between 1 and 999,999.",
    );
  if (new Set(rows.map((r) => r.item.id)).size !== rows.length)
    throw new Error("An item can appear only once in an order.");
  return {
    localId,
    orderId: `WEB-${localId}`,
    totalItems: rows.length,
    totalUnits: rows.reduce((s, r) => s + r.quantity, 0),
    status: "pending",
    exportedAt: new Date().toISOString(),
    items: rows.map(({ item, quantity }) => ({
      itemId: item.id,
      name: item.name,
      quantity,
      expectedVersion: item.version,
      unit: item.unit,
      currentStock: item.quantity,
      minimumStock: item.minimumStock,
      brand: item.brand,
      supplierName: item.supplierName,
      imageUri: item.imageUri,
      purchaseLink: item.purchaseLink,
    })),
  };
}
export const orderLabels: Record<string, string> = {
  pending: "Pending",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  stock_updated: "Stock updated",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Completed",
};
export const shortDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "—";
export const safeImage = (value?: string) =>
  value && /^(https:\/\/|\/brand\/)/.test(value) ? value : undefined;
export const initials = (name?: string) =>
  (name || "Caregiver")
    .split(" ")
    .map((v) => v[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// Preserve custom units and measurement abbreviations; inflect known count nouns only.
export function unitLabel(quantity: number, unit: string) {
  const singular = [
    "unit",
    "piece",
    "set",
    "box",
    "pack",
    "packet",
    "bottle",
    "tube",
    "pair",
    "roll",
    "kit",
  ];
  const text = unit.trim();
  for (const word of singular) {
    const plural = word === "box" ? "boxes" : `${word}s`;
    if ([word, plural].includes(text.toLowerCase()))
      return quantity === 1 ? word : plural;
  }
  return text || (quantity === 1 ? "unit" : "units");
}
