import { useState } from "react";
import { Link } from "react-router-dom";
import {
  FolderPlus,
  Plus,
  Trash2,
  Package,
  ArrowUpRight,
  RotateCcw,
  Download,
  Check,
} from "lucide-react";
import { useApp } from "../context";
import { SEED_DATA, ESSENTIAL_ITEM_KEYWORDS } from "../domain/catalog";
import {
  PageTitle,
  Loading,
  ErrorBox,
  Dialog,
  Field,
  Spinner,
  Select,
} from "../components/ui";
import { downloadJson, backupPayload } from "../services/export";
import {
  addMissingDefaults,
  deleteReviewedCategory,
  protectedCategory,
} from "../services/builder";
import { CategoryWorkspace } from "../components/CategoryWorkspace";
const catalogCount = SEED_DATA.flatMap((c) => c.items).length;
export default function Builder() {
  const a = useApp(),
    [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [selectedCategory, setSelectedCategory] = useState("");
  if (a.loading) return <Loading />;
  if (!a.data)
    return <ErrorBox message={a.error || "Inventory unavailable."} />;
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await a.act(
        (r) => r.createCategory(name.trim(), description.trim()),
        "Category created.",
      );
      setOpen(false);
      setName("");
      setDescription("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const defaults = async (replace = false) => {
    if (
      !(await a.confirm({
        title: replace
          ? "Replace inventory with defaults?"
          : "Add home ICU essentials?",
        body: replace
          ? "Download a backup, remove all current items and custom categories, then add the home ICU catalog at zero stock. Orders are kept. This cannot be undone here."
          : `Add missing categories and items from the same ${catalogCount}-item catalog as Android. Existing items and quantities will be kept.`,
        label: replace ? "Back up & replace" : "Add defaults",
        danger: replace,
      }))
    )
      return;
    setError("");
    try {
      await a.act(async (r) => {
        if (replace) {
          const snapshot = await r.load();
          downloadJson(
            backupPayload(snapshot),
            "carekosh-before-replacement.json",
          );
          for (const item of snapshot.items) {
            setProgress(`Removing ${item.name}…`);
            await r.deleteItem(item.id, item.version);
          }
          for (const category of snapshot.categories.filter(
            (c) => !c.isDefault && !protectedCategory(c.name),
          )) {
            setProgress(`Removing ${category.name}…`);
            await r.deleteCategory(category, true);
          }
        }
        await addMissingDefaults(r, setProgress);
      }, "Missing essentials added.");
    } catch (e) {
      setError(
        `Some changes may have completed. Refresh before retrying. ${(e as Error).message}`,
      );
      await a.refresh().catch(() => {});
    } finally {
      setProgress("");
    }
  };
  const fresh = async () => {
    const count = a.data!.items.filter(
      (i) =>
        !ESSENTIAL_ITEM_KEYWORDS.some((k) => i.name.toLowerCase().includes(k)),
    ).length;
    if (
      !(await a.confirm({
        title: "Start fresh with essential equipment?",
        body: `Download a complete backup, then delete ${count} nonessential items. Essential respiratory equipment is kept. Orders are preserved. This cannot be undone here.`,
        label: "Back up & start fresh",
        danger: true,
      }))
    )
      return;
    setError("");
    try {
      await a.act(async (r) => {
        const snapshot = await r.load();
        downloadJson(backupPayload(snapshot), "carekosh-before-reset.json");
        for (const i of snapshot.items.filter(
          (i) =>
            !ESSENTIAL_ITEM_KEYWORDS.some((k) =>
              i.name.toLowerCase().includes(k),
            ),
        )) {
          setProgress(`Removing ${i.name}…`);
          await r.deleteItem(i.id, i.version);
        }
      }, "Inventory reset complete. Essential equipment kept.");
    } catch (e) {
      setError(
        `Reset stopped; completed changes remain saved. Your backup contains the original inventory. ${(e as Error).message}`,
      );
      await a.refresh().catch(() => {});
    } finally {
      setProgress("");
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="MAKE ROOM FOR BETTER CARE"
        title="Build your inventory"
        description="Organize your supplies in a way that feels natural to you."
      >
        <button
          className="button primary"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          <FolderPlus size={17} />
          New category
        </button>
      </PageTitle>
      {error && !open && <ErrorBox message={error} />}
      <div className="builder-intro panel">
        <div className="builder-illustration">
          <Package size={43} strokeWidth={1.3} />
          <span>
            <Check size={13} />
          </span>
        </div>
        <div>
          <p className="eyebrow">A THOUGHTFUL STARTING POINT</p>
          <h2>Your home ICU essentials, organized.</h2>
          <p>
            {SEED_DATA.length} familiar categories. {catalogCount} essential
            supplies. Add anything that’s missing without changing your existing
            stock.
          </p>
        </div>
        <button
          className="button primary"
          disabled={a.busy}
          onClick={() => defaults()}
        >
          {a.busy ? <Spinner /> : <Plus size={16} />}Add defaults
        </button>
      </div>
      {progress && (
        <p className="operation-progress" role="status">
          <Spinner />
          {progress}
        </p>
      )}
      <div className="section-heading">
        <div>
          <h2>
            Your categories{" "}
            <span className="count-pill">{a.data.categories.length}</span>
          </h2>
          <p>A clear home for every item.</p>
        </div>
      </div>
      {a.data.categories.length > 0 && (
        <section className="panel builder-workspace">
          <div className="section-heading padded">
            <div>
              <h2>Manage a category</h2>
              <p>Edit your supplies or add a missing catalog item.</p>
            </div>
            <Select
              aria-label="Category to manage"
              value={selectedCategory || a.data.categories[0]?.id}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {a.data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <CategoryWorkspace
            key={selectedCategory || a.data.categories[0]?.id}
            category={
              a.data.categories.find((c) => c.id === selectedCategory) ||
              a.data.categories[0]
            }
          />
        </section>
      )}
      <div className="builder-grid">
        {a.data.categories.map((c, index) => {
          const items = a.data!.items.filter((i) => i.categoryId === c.id);
          return (
            <article className="panel category-card" key={c.id}>
              <div className="category-card-top">
                <span className={`category-icon tone-${index % 4}`}>
                  <Package size={22} />
                </span>
                <button
                  className="icon-button"
                  disabled={a.busy || c.isDefault || protectedCategory(c.name)}
                  aria-label={`Delete ${c.name}`}
                  title={
                    c.isDefault || protectedCategory(c.name)
                      ? "Default category cannot be deleted"
                      : "Delete category"
                  }
                  onClick={async () => {
                    if (
                      !(await a.confirm({
                        title: `Delete ${c.name}?`,
                        body: `This will permanently remove the category and all ${items.length} items inside it. A backup is downloaded first.`,
                        label: "Back up & delete",
                        danger: true,
                      }))
                    )
                      return;
                    setError("");
                    try {
                      await a.act(
                        (r) =>
                          deleteReviewedCategory(r, c, items, (snapshot) =>
                            downloadJson(
                              backupPayload(snapshot),
                              "carekosh-before-category-delete.json",
                            ),
                          ),
                        "Category deleted.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                      await a.refresh().catch(() => {});
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <h3>{c.name}</h3>
              <p>{c.description || "Your supplies, together in one place."}</p>
              <Link to={`/inventory?view=categories&category=${c.id}`}>
                <span>
                  {items.length} {items.length === 1 ? "item" : "items"}
                </span>
                <ArrowUpRight size={17} />
              </Link>
            </article>
          );
        })}
        <button
          className="category-card add-category"
          onClick={() => setOpen(true)}
        >
          <Plus size={26} />
          <strong>Create a category</strong>
          <span>Make this space your own</span>
        </button>
      </div>
      <div className="panel reset-panel">
        <div>
          <h3>A fresh start, when you need one.</h3>
          <p>
            Keep essential equipment and clear other supplies. A full backup
            downloads before any changes.
          </p>
        </div>
        <button className="button secondary" disabled={a.busy} onClick={fresh}>
          <RotateCcw size={16} />
          Start fresh
        </button>
        <button
          className="icon-button"
          title="Download full backup"
          aria-label="Download full backup"
          onClick={() =>
            downloadJson(backupPayload(a.data!), "carekosh-full-backup.json")
          }
        >
          <Download size={18} />
        </button>
      </div>
      <div className="replace-defaults">
        <span>Need to rebuild everything from the starter catalog?</span>
        <button
          className="text-button"
          disabled={a.busy}
          onClick={() => defaults(true)}
        >
          Replace all with defaults
        </button>
      </div>
      {open && (
        <Dialog
          title="Create a category"
          onClose={() => {
            if (!a.busy) setOpen(false);
          }}
        >
          <form onSubmit={create}>
            {error && <ErrorBox message={error} />}
            <Field label="Category name" required>
              <input
                autoFocus
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wound care"
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What belongs here?"
              />
            </Field>
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={a.busy || !name.trim()}
              >
                {a.busy ? <Spinner /> : <Plus size={16} />}Create category
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
