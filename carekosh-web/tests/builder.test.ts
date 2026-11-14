import { expect, it, vi } from "vitest";
import type { Category, Item } from "../src/domain";
import { deleteReviewedCategory } from "../src/services/builder";
import type { Repository, Workspace } from "../src/services/workspace";

const stamp = "2026-10-27T00:00:00Z";
const kit: Category = {
  id: "kit",
  name: "Travel kit",
  displayOrder: 1,
  createdAt: stamp,
  updatedAt: stamp,
};
const item = (id: string, version = 1, categoryId = kit.id): Item => ({
  id,
  categoryId,
  name: `Item ${id}`,
  quantity: 1,
  unit: "pieces",
  minimumStock: 0,
  isActive: true,
  isCritical: false,
  version,
  createdAt: stamp,
  updatedAt: stamp,
});
function repository(items: Item[]) {
  const workspace: Workspace = {
    items,
    categories: [kit, { ...kit, id: "other", name: "Other" }],
    orders: [],
    activities: [],
  };
  return {
    workspace,
    repo: {
      load: vi.fn(async () => workspace),
      deleteItem: vi.fn(async () => {}),
      deleteCategory: vi.fn(async () => {}),
    } as unknown as Repository & {
      deleteItem: ReturnType<typeof vi.fn>;
      deleteCategory: ReturnType<typeof vi.fn>;
    },
  };
}

it("deletes nothing when another device added an item after confirmation", async () => {
  const { repo } = repository([item("a"), item("added-on-android")]);
  const backup = vi.fn();
  await expect(
    deleteReviewedCategory(repo, kit, [item("a")], backup),
  ).rejects.toThrow("Nothing was deleted");
  expect(backup).not.toHaveBeenCalled();
  expect(repo.deleteItem).not.toHaveBeenCalled();
  expect(repo.deleteCategory).not.toHaveBeenCalled();
});

it("deletes nothing when a confirmed item was edited elsewhere", async () => {
  const { repo } = repository([item("a", 2)]);
  const backup = vi.fn();
  await expect(
    deleteReviewedCategory(repo, kit, [item("a", 1)], backup),
  ).rejects.toThrow("changed after you confirmed");
  expect(repo.deleteItem).not.toHaveBeenCalled();
});

it("backs up the fresh snapshot, deletes the confirmed items by version, then requires an empty category", async () => {
  const { repo, workspace } = repository([
    item("a", 3),
    item("b", 1),
    item("elsewhere", 1, "other"),
  ]);
  const backup = vi.fn();
  await deleteReviewedCategory(repo, kit, [item("b", 1), item("a", 3)], backup);
  expect(backup).toHaveBeenCalledWith(workspace);
  expect(repo.deleteItem.mock.calls).toEqual([
    ["a", 3],
    ["b", 1],
  ]);
  expect(repo.deleteCategory).toHaveBeenCalledWith(kit, true);
});

it("catalog additions skip a matching name in any category", async () => {
  const { addMissingDefaults } = await import("../src/services/builder");
  const { SEED_DATA } = await import("../src/domain/catalog");
  const all = SEED_DATA.flatMap((c) =>
    c.items.map((i) => ({
      ...item(i.name),
      name: i.name,
      categoryId: "elsewhere",
    })),
  );
  const { repo, workspace } = repository(all);
  workspace.categories = SEED_DATA.map((c) => ({ ...kit, name: c.name }));
  repo.saveItem = vi.fn();
  await addMissingDefaults(repo, () => {});
  expect(repo.saveItem).not.toHaveBeenCalled();
});

it("only treats a concurrent 409 as a duplicate when a fresh matching item exists", async () => {
  const { addCatalogItem } = await import("../src/services/builder");
  const { repo } = repository([item("a")]);
  repo.saveItem = vi.fn(async () => {
    throw Object.assign(new Error("Conflict"), { status: 409 });
  });
  expect((await addCatalogItem(repo, item("a"))).id).toBe("a");
  await expect(addCatalogItem(repo, item("b"))).rejects.toThrow("Conflict");
});
