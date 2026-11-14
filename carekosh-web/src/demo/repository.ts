import { SEED_DATA } from "../domain/catalog";
import type { Workspace, Repository } from "../services/workspace";
import type {
  User,
  SavedOrder,
  OrderRequest,
  ActivityActionType,
} from "../domain";
import { ApiError } from "../services/api";
const KEY = "carekosh-demo-v1";
export const demoUser: User = {
  id: "demo-caregiver",
  name: "Alex Morgan",
  username: "alex_caregiver",
  email: "alex@example.com",
  is_active: true,
  is_verified: true,
  isEmailVerified: true,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};
const iso = () => new Date().toISOString();
function seed(): Workspace {
  const quantities = [
    2, 0, 3, 12, 2, 2, 2, 1, 2, 6, 3, 4, 3, 0, 8, 4, 12, 2, 2, 8, 2, 2, 2, 3, 2,
    2, 4, 8, 0, 6, 3, 4,
  ];
  const categories = SEED_DATA.map((c, n) => ({
    id: `category-${n}`,
    name: c.name,
    description: c.description,
    displayOrder: n,
    createdAt: iso(),
    updatedAt: iso(),
  }));
  let n = 0;
  const items = SEED_DATA.flatMap((c, index) =>
    c.items.map((i) => ({
      id: `item-${++n}`,
      categoryId: categories[index].id,
      ...i,
      quantity: quantities[n - 1] ?? 3,
      isActive: true,
      isCritical: false,
      version: 1,
      brand: n % 3 === 0 ? "Care essentials" : undefined,
      createdAt: iso(),
      updatedAt: iso(),
    })),
  );
  const orders: SavedOrder[] = ["ordered", "received", "stock_updated"].map(
    (status, i) => {
      const selected = items.slice(i * 3 + 2, i * 3 + 5);
      const date = new Date(Date.now() - (i + 1) * 86400000).toISOString();
      return {
        id: `demo-order-${i}`,
        orderId: `ORD-DEMO-00${3 - i}`,
        items: selected.map((item) => ({
          id: crypto.randomUUID(),
          orderId: `demo-order-${i}`,
          itemId: item.id,
          name: item.name,
          unit: item.unit,
          quantity: 3,
          currentStock: item.quantity,
          minimumStock: item.minimumStock,
        })),
        status: status as SavedOrder["status"],
        totalItems: 3,
        totalUnits: 9,
        exportedAt: date,
        orderedAt: date,
        receivedAt: i ? date : undefined,
        appliedAt: i === 2 ? date : undefined,
      };
    },
  );
  return {
    items,
    categories,
    orders,
    activities: [
      {
        id: "activity-1",
        action: "order_received",
        itemName: "Feeding supplies",
        details: "Order received · ready to update stock",
        timestamp: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
      },
      {
        id: "activity-2",
        action: "stock_update",
        itemName: "HME Filter",
        details: "Stock updated to 3 pieces",
        timestamp: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
      },
      {
        id: "activity-3",
        action: "item_create",
        itemName: "Oxygen Concentrator",
        details: "Added to Ventilator & Respiratory",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: "activity-4",
        action: "order_applied",
        itemName: "ORD-DEMO-001",
        details: "9 units added to inventory",
        timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
    ],
  };
}
let db: Workspace;
try {
  db = JSON.parse(localStorage.getItem(KEY) || "null") || seed();
} catch {
  db = seed();
}
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* Demo remains usable in memory. */
  }
};
const log = (action: ActivityActionType, itemName: string, details: string) => {
  db.activities.unshift({
    id: crypto.randomUUID(),
    action,
    itemName,
    details,
    timestamp: iso(),
  });
  persist();
};
export function resetDemo() {
  db = seed();
  persist();
}
export const demoRepository: Repository = {
  async load() {
    return structuredClone(db);
  },
  async saveItem(input, id, version) {
    const current = db.items.find((i) => i.id === id);
    if (current && current.version !== version)
      throw new ApiError(
        "This item changed. Reload the latest version before saving.",
        409,
        0,
        "Version conflict",
      );
    const value = {
      ...input,
      id: id || crypto.randomUUID(),
      version: (current?.version || 0) + 1,
      createdAt: current?.createdAt || iso(),
      updatedAt: iso(),
    };
    if (current) db.items = db.items.map((i) => (i.id === id ? value : i));
    else db.items.push(value);
    log(
      current ? "item_update" : "item_create",
      value.name,
      current ? "Item details updated" : "Added to inventory",
    );
    return structuredClone(value);
  },
  async deleteItem(id, version) {
    const item = db.items.find((i) => i.id === id);
    if (item && item.version !== version)
      throw new ApiError("Item changed. Refresh before deleting.", 409);
    db.items = db.items.filter((i) => i.id !== id);
    log("item_delete", item?.name || "Item", "Removed from inventory");
  },
  async createCategory(name, description) {
    if (db.categories.some((c) => c.name.toLowerCase() === name.toLowerCase()))
      throw new ApiError("A category with this name already exists.", 409);
    const c = {
      id: crypto.randomUUID(),
      name,
      description,
      displayOrder: db.categories.length,
      createdAt: iso(),
      updatedAt: iso(),
    };
    db.categories.push(c);
    log("category_create", name, "Category created");
    return structuredClone(c);
  },
  async deleteCategory(c, onlyIfEmpty = false) {
    if (onlyIfEmpty && db.items.some((i) => i.categoryId === c.id))
      throw new ApiError(
        "Category still contains items; it was not deleted.",
        409,
      );
    db.items = db.items.filter((i) => i.categoryId !== c.id);
    db.categories = db.categories.filter((x) => x.id !== c.id);
    log("category_delete", c.name, "Category and its items deleted");
  },
  async createOrder(input) {
    const existing = db.orders.find((o) => o.localId === input.localId);
    if (existing) {
      const lines = (items: OrderRequest["items"] | SavedOrder["items"]) =>
        items
          .map((row) =>
            JSON.stringify([
              row.itemId,
              row.name,
              row.brand,
              row.unit,
              row.quantity,
              row.currentStock,
              row.minimumStock,
              row.imageUri,
              row.supplierName,
              row.purchaseLink,
            ]),
          )
          .sort();
      if (
        JSON.stringify(lines(existing.items)) !==
        JSON.stringify(lines(input.items))
      )
        throw new ApiError(
          "This submission ID already belongs to a different order. Reload your saved orders before retrying.",
          409,
        );
      return structuredClone(existing);
    }
    for (const row of input.items) {
      const item = db.items.find((i) => i.id === row.itemId);
      if (!item || item.version !== row.expectedVersion)
        throw new ApiError(
          "Inventory changed. Review the latest quantities before confirming.",
          409,
        );
    }
    const id = crypto.randomUUID();
    const order: SavedOrder = {
      ...input,
      id,
      orderId: `ORD-DEMO-${String(db.orders.length + 1).padStart(3, "0")}`,
      items: input.items.map((i) => ({
        ...i,
        id: crypto.randomUUID(),
        orderId: id,
      })),
      createdAt: iso(),
      updatedAt: iso(),
    };
    db.orders.unshift(order);
    log(
      "order_created",
      order.orderId,
      `${order.totalItems} items · ${order.totalUnits} units`,
    );
    return structuredClone(order);
  },
  async orderAction(id, action) {
    const o = db.orders.find((o) => o.id === id);
    if (!o) throw new ApiError("Order no longer exists.", 404);
    if (action === "delete") {
      if (!["pending", "declined"].includes(o.status))
        throw new ApiError(
          "Only pending or declined orders can be deleted.",
          400,
        );
      db.orders = db.orders.filter((x) => x.id !== id);
      log("order_delete", o.orderId, "Order deleted");
      return;
    }
    if (action === "apply") {
      if (o.status === "stock_updated") return;
      if (o.status !== "received")
        throw new ApiError(
          "Mark this order received before applying stock.",
          409,
        );
      for (const row of o.items) {
        const item = db.items.find((i) => i.id === row.itemId);
        if (!item)
          throw new ApiError(
            "An ordered item was removed. Inventory was not updated.",
            409,
          );
        if (item.unit.trim().toLowerCase() !== row.unit.trim().toLowerCase())
          throw new ApiError(
            "An ordered item’s unit changed. Inventory was not updated.",
            409,
          );
        if (item.quantity + row.quantity > 999999)
          throw new ApiError("Stock exceeds the allowed quantity.", 409);
      }
      for (const row of o.items) {
        const item = db.items.find((i) => i.id === row.itemId)!;
        item.quantity += row.quantity;
        item.version++;
      }
      o.status = "stock_updated";
      o.appliedAt = iso();
      log("order_applied", o.orderId, `${o.totalUnits} units added to stock`);
      return;
    }
    const allowed: Record<string, string[]> = {
      pending: ["ordered", "received", "declined"],
      ordered: ["received"],
      received: ["declined"],
      partially_received: ["received", "declined"],
    };
    if (!allowed[o.status]?.includes(action))
      throw new ApiError("This order can no longer take that action.", 409);
    o.status = action;
    if (action === "received") o.receivedAt = iso();
    if (action === "ordered") o.orderedAt = iso();
    log(
      action === "received" ? "order_received" : "order_update",
      o.orderId,
      `Marked ${action}`,
    );
  },
  async updateProfile(data) {
    Object.assign(demoUser, data);
    return { ...demoUser };
  },
};
