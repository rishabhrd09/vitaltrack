import type { Workspace } from "./workspace";
import { BRAND } from "../brand";
import {
  safeImage,
  shortDate,
  type SavedOrder,
  type Item,
  type Category,
} from "../domain";
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function downloadJson(
  data: unknown,
  filename = "carekosh-inventory.json",
) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function backupPayload(data: Workspace) {
  return {
    version: "1.0.0-web",
    exportedAt: new Date().toISOString(),
    categories: data.categories,
    items: data.items,
    activityLogs: data.activities,
    savedOrders: data.orders,
  };
}
export function printInventory(
  items: Item[],
  categories: Category[],
  photos = false,
) {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  printTable(
    "Inventory report",
    `${items.length} items · ${shortDate(new Date().toISOString())}`,
    ["Item", "Category", "Stock", "Minimum", "Unit"],
    items.map((i) => [
      i.name,
      names.get(i.categoryId) || "—",
      i.quantity,
      i.minimumStock,
      i.unit,
    ]),
    photos ? items.map((i) => safeImage(i.imageUri)) : undefined,
  );
}
export function printOrder(order: SavedOrder, photos = false) {
  printTable(
    `Order ${order.orderId}`,
    `${order.totalItems} items · ${order.totalUnits} units · ${shortDate(order.exportedAt)}`,
    ["Item", "Brand", "Order quantity", "Unit", "Supplier"],
    order.items.map((i) => [
      i.name,
      i.brand || "—",
      i.quantity,
      i.unit,
      i.supplierName || "—",
    ]),
    photos ? order.items.map((i) => safeImage(i.imageUri)) : undefined,
  );
}
function printTable(
  title: string,
  subtitle: string,
  headers: string[],
  rows: unknown[][],
  photos?: (string | undefined)[],
) {
  const tab = window.open("", "_blank");
  if (!tab)
    throw new Error(
      "Your browser blocked the print window. Allow pop-ups for CareKosh and try exporting again.",
    );
  tab.document.write(
    `<!doctype html><html><head><title>${escape(title)} | ${escape(BRAND.browserTitle)}</title><meta charset="utf-8"><style>body{font:14px system-ui;color:#17212b;margin:40px}h1{font-size:27px}header{border-bottom:2px solid #4f8ee6;padding-bottom:22px;margin-bottom:28px}header strong{color:#3269b3;font-size:20px}p{color:#657383}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px 9px;border-bottom:1px solid #dce2e8;overflow-wrap:anywhere}th{font-size:12px;background:#f3f6fa}thead{display:table-header-group}tr{break-inside:avoid}img{width:48px;height:48px;object-fit:contain}button{padding:10px 20px;margin-bottom:20px}@page{size:A4;margin:16mm}@media print{body{margin:0}button{display:none}}</style></head><body><button id="print">Print / Save as PDF</button><header><strong>${escape(BRAND.fullName)}</strong><p>${escape(BRAND.tagline)}</p><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></header><table><thead><tr>${photos ? "<th>Photo</th>" : ""}${headers.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row, i) => `<tr>${photos ? `<td>${photos[i] ? `<img alt="Item photo" src="${escape(photos[i])}">` : "—"}</td>` : ""}${row.map((c) => `<td>${escape(c)}</td>`).join("")}</tr>`).join("")}</tbody></table><p>Prepared with CareKosh. An order document does not place a purchase or update inventory.</p></body></html>`,
  );
  tab.document.close();
  tab.document.getElementById("print")!.onclick = () => tab.print();
  tab.opener = null;
}
