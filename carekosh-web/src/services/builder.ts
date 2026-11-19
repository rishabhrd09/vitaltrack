import { SEED_DATA } from "../domain/catalog";
import type { Category, Item, ItemInput } from "../domain";
import type { Repository, Workspace } from "./workspace";
export const sameItemName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
export async function addCatalogItem(repo: Repository, input: ItemInput) {
  try {
    return await repo.saveItem(input);
  } catch (error) {
    // A concurrent client may have added this name. Other 409s stay visible.
    if ((error as { status?: number }).status === 409) {
      const fresh = await repo.load();
      const existing = fresh.items.find((i) =>
        sameItemName(i.name, input.name),
      );
      if (existing) return existing;
    }
    throw error;
  }
}
export const protectedCategory = (name: string) =>
  SEED_DATA.some((c) => c.name.toLowerCase() === name.toLowerCase().trim());
// Another device may add or edit items after this page loaded. Back up and
// delete exactly the confirmed items; the server then requires an empty category.
export async function deleteReviewedCategory(
  repo: Repository,
  category: Category,
  confirmed: Item[],
  backup: (snapshot: Workspace) => void,
) {
  const snapshot = await repo.load();
  const fresh = snapshot.categories.find((c) => c.id === category.id);
  const items = snapshot.items.filter((i) => i.categoryId === category.id);
  const key = (list: Item[]) =>
    list
      .map((i) => `${i.id}:${i.version}`)
      .sort()
      .join();
  if (!fresh || key(items) !== key(confirmed))
    throw new Error(
      `${category.name} changed after you confirmed. Nothing was deleted; review it and try again.`,
    );
  backup(snapshot);
  for (const item of items) await repo.deleteItem(item.id, item.version);
  await repo.deleteCategory(fresh, true);
}
export async function addMissingDefaults(
  repo: Repository,
  progress: (text: string) => void,
) {
  const current = await repo.load();
  for (const seed of SEED_DATA) {
    progress(`Adding ${seed.name}…`);
    const category =
      current.categories.find(
        (c) => c.name.toLowerCase().trim() === seed.name.toLowerCase(),
      ) || (await repo.createCategory(seed.name, seed.description));
    for (const item of seed.items) {
      if (current.items.some((i) => sameItemName(i.name, item.name))) continue;
      const saved = await addCatalogItem(repo, {
        ...item,
        categoryId: category.id,
        quantity: 0,
        isActive: true,
        isCritical: false,
      });
      current.items.push(saved);
    }
  }
}
