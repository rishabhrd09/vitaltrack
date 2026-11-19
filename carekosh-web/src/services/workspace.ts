import type {
  Item,
  Category,
  SavedOrder,
  ActivityLog,
  ItemInput,
  OrderRequest,
  User,
} from "../domain";
import { request, DEMO, ApiError } from "./api";
export interface Workspace {
  items: Item[];
  categories: Category[];
  orders: SavedOrder[];
  activities: ActivityLog[];
}
export interface Repository {
  load(signal?: AbortSignal): Promise<Workspace>;
  saveItem(input: ItemInput, id?: string, version?: number): Promise<Item>;
  deleteItem(id: string, version: number): Promise<void>;
  createCategory(name: string, description?: string): Promise<Category>;
  deleteCategory(category: Category, onlyIfEmpty?: boolean): Promise<void>;
  createOrder(input: OrderRequest): Promise<SavedOrder>;
  orderAction(
    id: string,
    action: "ordered" | "received" | "declined" | "apply" | "delete",
  ): Promise<void>;
  updateProfile(data: { name: string; username?: string }): Promise<User>;
}
// Bound the current complete-workspace model; never silently truncate a backup
// or a destructive-operation review. Larger workspaces need server-side views.
export const MAX_WORKSPACE_RECORDS = 10_000;
export async function pages<T>(
  path: string,
  key: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const first = await request<Record<string, unknown>>(
    `${path}?page=1&pageSize=100`,
    "GET",
    undefined,
    signal,
  );
  const result = new Map<string, T>();
  const append = (page: Record<string, unknown>) => {
    if (
      !Number.isSafeInteger(page.total) ||
      Number(page.total) < 0 ||
      !Array.isArray(page[key]) ||
      page[key].length > 100
    )
      throw new ApiError(
        "The server returned invalid pagination. Please reload your workspace.",
        502,
      );
    if (Number(page.total) > MAX_WORKSPACE_RECORDS)
      throw new ApiError(
        "This workspace exceeds the browser's current safe loading limit. Contact CareKosh support; no partial workspace has been loaded.",
        413,
      );
    if (page.total !== first.total)
      throw new ApiError(
        "Your workspace changed while loading. Reload to get a complete view.",
        409,
      );
    (page[key] as (T & { id: string })[]).forEach((row) => {
      if (!row || typeof row.id !== "string" || !row.id)
        throw new ApiError(
          "The server returned an invalid workspace record.",
          502,
        );
      result.set(row.id, row);
    });
  };
  append(first);
  const count = Math.ceil(Number(first.total) / 100);
  for (let page = 2; page <= count; page++)
    append(
      await request(
        `${path}?page=${page}&pageSize=100`,
        "GET",
        undefined,
        signal,
      ),
    );
  if (result.size !== Number(first.total))
    throw new ApiError(
      "Your workspace changed while loading. Reload to get a complete view.",
      409,
    );
  return [...result.values()];
}
const live: Repository = {
  async load(signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    try {
      const [items, categories, orders, activities] = await Promise.all([
        pages<Item>("/items", "items", controller.signal),
        request<{ categories: Category[] }>(
          "/categories",
          "GET",
          undefined,
          controller.signal,
        ),
        pages<SavedOrder>("/orders", "orders", controller.signal),
        request<{ activities: ActivityLog[] }>(
          "/activities?limit=100",
          "GET",
          undefined,
          controller.signal,
        ),
      ]);
      return {
        items,
        categories: categories.categories,
        orders,
        activities: activities.activities.filter(
          (a) =>
            ![
              "user_login",
              "user_logout",
              "user_register",
              "sync_push",
              "sync_pull",
            ].includes(a.action),
        ),
      };
    } catch (error) {
      controller.abort();
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  },
  saveItem(input, id, version) {
    const body: Record<string, unknown> = {
      ...input,
      ...(id ? { version } : { localId: crypto.randomUUID() }),
    };
    for (const key of [
      "description",
      "brand",
      "notes",
      "supplierName",
      "supplierContact",
      "purchaseLink",
      "imageUri",
      "expiryDate",
    ])
      if (!body[key]) body[key] = id ? null : undefined;
    return request<Item>(
      id ? `/items/${id}` : "/items",
      id ? "PUT" : "POST",
      body,
    );
  },
  async deleteItem(id, version) {
    await request(`/items/${id}?version=${version}`, "DELETE");
  },
  createCategory(name, description) {
    return request<Category>("/categories", "POST", {
      name,
      description,
      display_order: 0,
    });
  },
  async deleteCategory(c, onlyIfEmpty = false) {
    await request(
      `/categories/${c.id}?expectedUpdatedAt=${encodeURIComponent(c.updatedAt)}&onlyIfEmpty=${onlyIfEmpty}`,
      "DELETE",
    );
  },
  createOrder(input) {
    return request<SavedOrder>("/orders", "POST", input);
  },
  async orderAction(id, action) {
    if (action === "delete") await request(`/orders/${id}`, "DELETE");
    else if (action === "apply") await request(`/orders/${id}/apply`, "POST");
    else await request(`/orders/${id}/status`, "PATCH", { status: action });
  },
  updateProfile(data) {
    return request<User>("/auth/me", "PATCH", data);
  },
};
let loaded: Promise<Repository>;
export const repository = () =>
  (loaded ??= DEMO
    ? import("../demo/repository").then((m) => m.demoRepository)
    : Promise.resolve(live));
