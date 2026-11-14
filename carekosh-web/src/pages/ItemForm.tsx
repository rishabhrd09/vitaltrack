import { useEffect, useId, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  Package,
  Save,
  Trash2,
  ShieldCheck,
  ExternalLink,
  Minus,
  Plus,
} from "lucide-react";
import { useApp } from "../context";
import { ApiError, sessionEpoch } from "../services/api";
import {
  ITEM_TEXT_LIMITS,
  itemTextError,
  stepItemQuantity,
} from "../services/item-editor";
import {
  type Item,
  type ItemInput,
  validateQuantity,
  safeImage,
  shortDate,
} from "../domain";
import {
  PageTitle,
  Field,
  Select,
  Loading,
  ErrorBox,
  StockBadge,
  Spinner,
} from "../components/ui";
export default function ItemPage() {
  const a = useApp(),
    { id } = useParams();
  if (a.loading) return <Loading />;
  if (!a.data)
    return <ErrorBox message={a.error || "Inventory unavailable."} />;
  const item = a.data.items.find((i) => i.id === id);
  if (id !== "new" && !item)
    return (
      <>
        <PageTitle
          title="Item not found"
          description="It may have been removed from your inventory."
        />
        <Link to="/inventory" className="button primary">
          Back to inventory
        </Link>
      </>
    );
  return <ItemForm key={id} item={item} />;
}
function ItemForm({ item }: { item?: Item }) {
  const a = useApp(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [error, setError] = useState("");
  // A background workspace refresh must never supply a newer concurrency token
  // for older editable values. Replace both only after explicit reload/review.
  const [snapshot, setSnapshot] = useState(() =>
    item ? { ...item } : undefined,
  );
  const [conflict, setConflict] = useState(false),
    [reloading, setReloading] = useState(false);
  const mounted = useRef(true),
    reloadLock = useRef(false),
    editRevision = useRef(0),
    quantityId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [form, setForm] = useState<ItemInput>(
    snapshot
      ? { ...snapshot }
      : {
          name: "",
          categoryId:
            a.data!.categories.find((c) => c.id === params.get("category"))
              ?.id ||
            a.data!.categories[0]?.id ||
            "",
          quantity: 0,
          minimumStock: 1,
          unit: "pieces",
          isActive: true,
          isCritical: false,
        },
  );
  const set = <K extends keyof ItemInput>(key: K, value: ItemInput[K]) => {
    editRevision.current++;
    setForm((p) => ({ ...p, [key]: value }));
  };
  const mustReview =
    !!snapshot && (conflict || item?.version !== snapshot.version);
  const reviewMessage =
    "This item changed elsewhere. Your unsaved edits are kept. Load and review the latest item before saving or deleting.";
  const loadLatest = async () => {
    if (!snapshot || a.busy || reloadLock.current) return;
    const epoch = sessionEpoch();
    reloadLock.current = true;
    setReloading(true);
    try {
      if (
        !(await a.confirm({
          title: "Load the latest item?",
          body: "This replaces your unsaved edits with the latest saved details and stock. Review them before making another change.",
          label: "Discard edits & load latest",
        })) ||
        !mounted.current ||
        sessionEpoch() !== epoch
      )
        return;
      const revision = editRevision.current;
      const current = await a.refresh();
      if (!mounted.current || sessionEpoch() !== epoch) return;
      if (editRevision.current !== revision) {
        setError(
          "Your newer edits were kept. Choose Load latest item again to replace them with the saved details.",
        );
        return;
      }
      const latest = current.items.find((i) => i.id === snapshot.id);
      if (!latest) throw new Error("This item is no longer in your inventory.");
      setSnapshot({ ...latest });
      setForm({ ...latest });
      setConflict(false);
      setError("");
      a.notify("Latest item loaded. Review the details before saving.");
    } catch (e) {
      if (mounted.current && sessionEpoch() === epoch)
        setError((e as Error).message);
    } finally {
      reloadLock.current = false;
      if (mounted.current) setReloading(false);
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reloadLock.current) return;
    setError("");
    if (mustReview) return setError(reviewMessage);
    if (!form.name.trim() || !form.categoryId || !form.unit.trim())
      return setError("Add a name, category, and unit.");
    if (
      !validateQuantity(form.quantity) ||
      !validateQuantity(form.minimumStock)
    )
      return setError(
        "Stock and minimum must be whole numbers between 0 and 999,999.",
      );
    if (form.purchaseLink && !/^https?:\/\//i.test(form.purchaseLink))
      return setError("Use a complete https:// purchase link.");
    const textError = itemTextError(form);
    if (textError) return setError(textError);
    try {
      await a.act(
        (r) =>
          r.saveItem(
            { ...form, name: form.name.trim(), unit: form.unit.trim() },
            snapshot?.id,
            snapshot?.version,
          ),
        item ? "Item updated." : "Item added to your inventory.",
      );
      navigate("/inventory");
    } catch (e) {
      if (
        snapshot &&
        e instanceof ApiError &&
        e.status === 409 &&
        e.code === "Version conflict"
      )
        setConflict(true);
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    if (reloadLock.current) return;
    if (mustReview) return setError(reviewMessage);
    if (
      !snapshot ||
      !(await a.confirm({
        title: `Delete ${snapshot.name}?`,
        body: "This removes the item from your inventory. Existing orders keep their saved details.",
        label: "Delete item",
        danger: true,
      }))
    )
      return;
    try {
      await a.act(
        (r) => r.deleteItem(snapshot.id, snapshot.version),
        "Item deleted.",
      );
      navigate("/inventory");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      setError((e as Error).message);
    }
  };
  return (
    <>
      <Link className="back-link" to="/inventory">
        <ArrowLeft size={16} />
        Back to inventory
      </Link>
      <PageTitle
        eyebrow={item ? "A PLACE FOR EVERY DETAIL" : "GROW YOUR CARE SPACE"}
        title={item ? item.name : "Add an item"}
        description={
          item
            ? "Keep the details and stock levels up to date."
            : "A few details now make caring a little easier later."
        }
      >
        {item && <StockBadge item={item} />}
      </PageTitle>
      <form onSubmit={save} className="editor-layout">
        <div className="editor-main">
          {error && <ErrorBox message={error} focus />}
          {mustReview && (
            <div className="panel form-section" role="status">
              <p>{reviewMessage}</p>
              <button
                type="button"
                className="button secondary"
                disabled={a.busy || reloading}
                onClick={loadLatest}
              >
                {reloading ? <Spinner /> : null}
                Load latest item
              </button>
            </div>
          )}
          <section className="panel form-section">
            <div className="section-heading">
              <div>
                <h2>Item details</h2>
                <p>The essentials, at a glance.</p>
              </div>
              <Package size={20} />
            </div>
            <div className="form-grid">
              <Field label="Item name" required>
                <input
                  autoFocus={!item}
                  required
                  maxLength={255}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Sterile gloves"
                />
              </Field>
              <Field label="Category" required>
                <Select
                  required
                  value={form.categoryId}
                  onChange={(e) => set("categoryId", e.target.value)}
                >
                  <option value="" disabled>
                    Select category
                  </option>
                  {a.data!.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Brand">
                <input
                  maxLength={100}
                  value={form.brand || ""}
                  onChange={(e) => set("brand", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Unit" required>
                <input
                  required
                  maxLength={50}
                  value={form.unit}
                  onChange={(e) => set("unit", e.target.value)}
                  list="unit-options"
                />
                <datalist id="unit-options">
                  {[
                    "pieces",
                    "unit",
                    "packets",
                    "bottles",
                    "sets",
                    "pairs",
                    "cylinders",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </datalist>
              </Field>
              <div className="full-width">
                <Field label="Description">
                  <textarea
                    rows={2}
                    maxLength={ITEM_TEXT_LIMITS.description}
                    value={form.description || ""}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Size, model, or any useful details"
                  />
                </Field>
              </div>
            </div>
            {!a.data!.categories.length && (
              <Link to="/builder" className="text-link">
                Create a category first
              </Link>
            )}
          </section>
          <section className="panel form-section">
            <div className="section-heading">
              <div>
                <h2>Stock & readiness</h2>
                <p>Set a minimum to know when supplies need attention.</p>
              </div>
              <ShieldCheck size={20} />
            </div>
            <div className="form-grid">
              <Field label="Current quantity" required htmlFor={quantityId}>
                <div className="stepper">
                  <button
                    type="button"
                    aria-label="Decrease current quantity"
                    onClick={() =>
                      set("quantity", stepItemQuantity(form.quantity, -1))
                    }
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    id={quantityId}
                    aria-label="Current quantity"
                    type="number"
                    min={0}
                    max={999999}
                    step={1}
                    required
                    value={Number.isFinite(form.quantity) ? form.quantity : ""}
                    onChange={(e) => set("quantity", e.target.valueAsNumber)}
                  />
                  <button
                    type="button"
                    aria-label="Increase current quantity"
                    onClick={() =>
                      set("quantity", stepItemQuantity(form.quantity, 1))
                    }
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </Field>
              <Field label="Minimum stock" required>
                <input
                  type="number"
                  min={0}
                  max={999999}
                  step={1}
                  required
                  value={
                    Number.isFinite(form.minimumStock) ? form.minimumStock : ""
                  }
                  onChange={(e) => set("minimumStock", e.target.valueAsNumber)}
                />
              </Field>
              <Field
                label="Expiry date"
                hint="Saved for reference; expiry alerts are not available."
              >
                <input
                  type="date"
                  value={form.expiryDate?.slice(0, 10) || ""}
                  onChange={(e) => set("expiryDate", e.target.value)}
                />
              </Field>
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={form.isCritical}
                  onChange={(e) => set("isCritical", e.target.checked)}
                />
                <span>
                  <strong>Critical equipment</strong>
                  <small>
                    Highlight this item for backup readiness. Recognized
                    equipment is also detected by name.
                  </small>
                </span>
              </label>
            </div>
          </section>
          <section className="panel form-section">
            <div className="section-heading">
              <div>
                <h2>Supplier & notes</h2>
                <p>Keep useful information close to hand.</p>
              </div>
            </div>
            <div className="form-grid">
              <Field label="Supplier name">
                <input
                  maxLength={255}
                  value={form.supplierName || ""}
                  onChange={(e) => set("supplierName", e.target.value)}
                />
              </Field>
              <Field label="Supplier contact">
                <input
                  maxLength={255}
                  value={form.supplierContact || ""}
                  onChange={(e) => set("supplierContact", e.target.value)}
                />
              </Field>
              <div className="full-width">
                <Field label="Purchase link">
                  <input
                    type="url"
                    maxLength={ITEM_TEXT_LIMITS.purchaseLink}
                    value={form.purchaseLink || ""}
                    onChange={(e) => set("purchaseLink", e.target.value)}
                    placeholder="https://"
                  />
                </Field>
              </div>
              <div className="full-width">
                <Field label="Notes">
                  <textarea
                    rows={3}
                    maxLength={ITEM_TEXT_LIMITS.notes}
                    value={form.notes || ""}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Anything you would like to remember"
                  />
                </Field>
              </div>
            </div>
          </section>
          <div className="form-actions">
            {item && (
              <button
                type="button"
                className="button ghost-danger"
                onClick={remove}
                disabled={a.busy || reloading || mustReview}
              >
                <Trash2 size={16} />
                Delete item
              </button>
            )}
            <div className="spacer" />
            <Link className="button secondary" to="/inventory">
              Cancel
            </Link>
            <button
              className="button primary"
              disabled={
                a.busy || reloading || mustReview || !a.data!.categories.length
              }
            >
              {a.busy ? <Spinner /> : <Save size={16} />}Save item
            </button>
          </div>
        </div>
        <aside className="editor-aside">
          <div className="panel item-preview">
            {safeImage(form.imageUri) ? (
              <img
                src={safeImage(form.imageUri)}
                alt={form.name}
                onError={(e) => {
                  e.currentTarget.hidden = true;
                }}
              />
            ) : (
              <div className="item-art">
                <Package size={56} strokeWidth={1.2} />
                <span>CARE ESSENTIAL</span>
              </div>
            )}
            <h3>{form.name || "Your next essential"}</h3>
            <p>
              {a.data!.categories.find((c) => c.id === form.categoryId)?.name ||
                "Choose a category"}
            </p>
            <div className="preview-stock">
              <strong>
                {Number.isFinite(form.quantity) ? form.quantity : 0}
              </strong>
              <span>{form.unit} on hand</span>
            </div>
            {item && <small>Last updated {shortDate(item.updatedAt)}</small>}
          </div>
          <div className="tip-card">
            <ShieldCheck size={19} />
            <h3>Prepared feels better.</h3>
            <p>
              Critical equipment with only one unit is flagged for attention,
              even when it meets your minimum.
            </p>
          </div>
          {form.purchaseLink && /^https:\/\//.test(form.purchaseLink) && (
            <a
              className="button secondary"
              href={form.purchaseLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit supplier
              <ExternalLink size={16} />
            </a>
          )}
          <p className="small-note">
            Item photos from the mobile app appear when they use an accessible
            HTTPS URL. Browser uploads are not yet supported by the API.
          </p>
        </aside>
      </form>
    </>
  );
}
