import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, ArrowUpRight } from "lucide-react";
import { useApp } from "../context";
import type { Category } from "../domain";
import { SEED_DATA } from "../domain/catalog";
import { StockBadge, ErrorBox } from "./ui";
import { downloadJson, backupPayload } from "../services/export";
import { addCatalogItem, sameItemName } from "../services/builder";
export function CategoryWorkspace({ category }: { category: Category }) {
  const a = useApp(),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [error, setError] = useState("");
  const items = a.data!.items.filter((i) => i.categoryId === category.id);
  const suggestions =
    SEED_DATA.find(
      (c) => c.name.toLowerCase() === category.name.toLowerCase(),
    )?.items.filter(
      (i) => !a.data!.items.some((x) => sameItemName(x.name, i.name)),
    ) || [];
  const remove = async () => {
    if (
      !(await a.confirm({
        title: `Delete ${selected.size} selected items?`,
        body: "A complete backup downloads first. Item versions are checked as each deletion is sent. Completed changes remain saved if a later item fails.",
        label: "Back up & delete",
        danger: true,
      }))
    )
      return;
    setError("");
    try {
      await a.act(async (r) => {
        const snapshot = await r.load();
        const rows = items.filter((i) => selected.has(i.id));
        if (
          rows.some(
            (i) =>
              snapshot.items.find((x) => x.id === i.id)?.version !== i.version,
          )
        )
          throw new Error(
            "Selected items changed. Refresh and select them again.",
          );
        downloadJson(
          backupPayload(snapshot),
          "carekosh-before-item-deletion.json",
        );
        for (const item of rows) await r.deleteItem(item.id, item.version);
      }, "Selected items deleted.");
      setSelected(new Set());
    } catch (e) {
      setError(`Deletion stopped. ${(e as Error).message}`);
      await a.refresh().catch(() => {});
    }
  };
  return (
    <div className="category-workspace">
      {error && <ErrorBox message={error} />}
      <div className="category-workspace-actions">
        <label className="checkbox-line">
          <input
            aria-label="Select all items in category"
            type="checkbox"
            checked={!!items.length && selected.size === items.length}
            disabled={!items.length || a.busy}
            onChange={(e) =>
              setSelected(
                new Set(e.target.checked ? items.map((i) => i.id) : []),
              )
            }
          />
          {selected.size
            ? `${selected.size} selected`
            : `${items.length} items`}
        </label>
        {selected.size > 0 && (
          <button
            className="button ghost-danger"
            disabled={a.busy}
            onClick={remove}
          >
            <Trash2 size={14} />
            Delete selected
          </button>
        )}
        <Link className="text-link" to={`/item/new?category=${category.id}`}>
          <Plus size={15} />
          Add item
        </Link>
      </div>
      {items.map((item) => (
        <div className="category-manage-row" key={item.id}>
          <input
            type="checkbox"
            aria-label={`Select ${item.name}`}
            checked={selected.has(item.id)}
            disabled={a.busy}
            onChange={(e) =>
              setSelected((old) => {
                const s = new Set(old);
                if (e.target.checked) s.add(item.id);
                else s.delete(item.id);
                return s;
              })
            }
          />
          <Link to={`/item/${item.id}`}>
            <strong>{item.name}</strong>
            <small>
              {item.quantity} {item.unit} · Minimum {item.minimumStock}
            </small>
          </Link>
          <StockBadge item={item} />
          <Link
            className="icon-button"
            aria-label={`Edit ${item.name}`}
            to={`/item/${item.id}`}
          >
            <ArrowUpRight size={16} />
          </Link>
        </div>
      ))}
      {!items.length && (
        <p className="muted category-empty">No items in this category yet.</p>
      )}
      {!!suggestions.length && (
        <div className="catalog-suggestions">
          <h3>Suggested for {category.name}</h3>
          <p>From the same home ICU catalog as Android.</p>
          <div>
            {suggestions.map((item) => (
              <button
                key={item.name}
                disabled={a.busy}
                onClick={async () => {
                  setError("");
                  try {
                    await a.act(async (r) => {
                      const latest = await r.load();
                      if (
                        latest.items.some((i) =>
                          sameItemName(i.name, item.name),
                        )
                      )
                        return;
                      await addCatalogItem(r, {
                        ...item,
                        categoryId: category.id,
                        quantity: 0,
                        isActive: true,
                        isCritical: false,
                      });
                    }, `${item.name} added.`);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Plus size={13} />
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
