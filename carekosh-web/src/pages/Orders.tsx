import { useState, useRef, useEffect } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  ShoppingCart,
  ArrowLeft,
  Download,
  Check,
  PackageCheck,
  Trash2,
  Search,
  X,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../context";
import {
  initialDraft,
  unitLabel,
  shortDate,
  validateQuantity,
  type SavedOrder,
} from "../domain";
import { DEMO, request, sessionEpoch } from "../services/api";
import {
  saveReviewedOrder,
  mergeMissingRows,
  type SaveStage,
} from "../services/order-review";
import { repository } from "../services/workspace";
import { printOrder } from "../services/export";
import {
  PageTitle,
  Loading,
  ErrorBox,
  Empty,
  OrderBadge,
  Dialog,
  StockBadge,
  Spinner,
  Select,
} from "../components/ui";
export function Orders() {
  const a = useApp(),
    [filter, setFilter] = useState("all");
  if (a.loading) return <Loading />;
  if (!a.data) return <ErrorBox message={a.error || "Orders unavailable."} />;
  const orders = [...a.data.orders]
    .filter((o) => filter === "all" || o.status === filter)
    .sort((x, y) => y.exportedAt.localeCompare(x.exportedAt));
  return (
    <>
      <PageTitle
        eyebrow="FROM NEEDED TO READY"
        title="Your orders"
        description="A clear path from low stock to a well-prepared home."
      >
        <Link className="button primary" to="/orders/create">
          <Plus size={16} />
          Create order
        </Link>
      </PageTitle>
      {a.draft && (
        <Link to="/orders/create" className="draft-banner">
          <ShoppingCart size={20} />
          <div>
            <strong>
              {a.draft.saved
                ? "Your saved order is ready"
                : "You have an order draft"}
            </strong>
            <span>
              {a.draft.rows.length} items · Continue where you left off
            </span>
          </div>
          <ArrowUpRight size={19} />
        </Link>
      )}
      <section className="panel">
        <div className="inventory-toolbar">
          <div className="tabs">
            {[
              ["all", "All orders"],
              ["pending", "Pending"],
              ["ordered", "Ordered"],
              ["received", "Received"],
              ["stock_updated", "Stock updated"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={filter === key ? "active" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="muted">
            {orders.length} {orders.length === 1 ? "order" : "orders"}
          </span>
        </div>
        {!orders.length ? (
          <Empty
            title="No orders here yet"
            body="Create an order from supplies that need attention, or add items of your choice."
          >
            <Link to="/orders/create" className="button primary">
              <Plus size={16} />
              Create order
            </Link>
          </Empty>
        ) : (
          <div className="order-list">
            <div className="order-table-head">
              <span>ORDER</span>
              <span>CREATED</span>
              <span>ITEMS</span>
              <span>STATUS</span>
              <span />
            </div>
            {orders.map((o) => (
              <Link
                className="order-list-row"
                to={`/orders/${o.id}`}
                key={o.id}
              >
                <div className="item-name-cell">
                  <span className="item-symbol">
                    <ShoppingCart size={19} />
                  </span>
                  <span>
                    <strong>{o.orderId}</strong>
                    <small>{o.totalUnits} total units</small>
                  </span>
                </div>
                <span className="order-date">{shortDate(o.exportedAt)}</span>
                <span className="order-item-count">{o.totalItems} items</span>
                <OrderBadge status={o.status} />
                <ArrowUpRight size={17} />
              </Link>
            ))}
          </div>
        )}
        <div className="panel-bottom">
          <ShieldCheck size={14} />
          <span>
            Orders help you organize supplies. They do not place a purchase with
            a supplier.
          </span>
        </div>
      </section>
      <div className="order-guide">
        <span>
          01 <b>Create your list</b>
        </span>
        <i />
        <span>
          02 <b>Mark received</b>
        </span>
        <i />
        <span>
          03 <b>Apply to stock</b>
        </span>
      </div>
    </>
  );
}
export function OrderDetail() {
  const a = useApp(),
    { id } = useParams(),
    navigate = useNavigate(),
    [error, setError] = useState(""),
    [photos, setPhotos] = useState(false);
  if (a.loading) return <Loading />;
  if (!a.data) return <ErrorBox message={a.error || "Order unavailable."} />;
  const order = a.data.orders.find((o) => o.id === id);
  if (!order)
    return (
      <Empty title="Order not found" body="It may have been deleted.">
        <Link className="button primary" to="/orders">
          Back to orders
        </Link>
      </Empty>
    );
  const action = async (
    type: "ordered" | "received" | "declined" | "apply" | "delete",
  ) => {
    const text = {
      ordered: [
        "Mark as ordered?",
        "Confirm that you have placed this order with your supplier.",
        "Mark ordered",
      ],
      received: [
        "Have these supplies arrived?",
        "Mark this order received. Your inventory quantities will change only after you apply it to stock.",
        "Mark received",
      ],
      declined: [
        "Decline this order?",
        "This closes the order without changing your inventory.",
        "Decline order",
      ],
      apply: [
        "Add these supplies to stock?",
        `Add the quantities from ${order.orderId} to your inventory. This can be applied only once.`,
        "Apply to stock",
      ],
      delete: [
        "Delete this order?",
        "Remove this pending or declined order. Inventory quantities stay unchanged.",
        "Delete order",
      ],
    }[type];
    if (
      !(await a.confirm({
        title: text[0],
        body: text[1],
        label: text[2],
        danger: type === "delete" || type === "declined",
      }))
    )
      return;
    setError("");
    try {
      await a.act(
        (r) => r.orderAction(order.id, type),
        type === "apply"
          ? "Order applied to stock."
          : type === "delete"
            ? "Order deleted."
            : "Order updated.",
      );
      if (type === "delete") navigate("/orders");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <Link className="back-link" to="/orders">
        <ArrowLeft size={16} />
        Back to orders
      </Link>
      <PageTitle
        eyebrow="ORDER DETAILS"
        title={order.orderId}
        description={`Created ${shortDate(order.exportedAt)} · ${order.totalItems} items · ${order.totalUnits} units`}
      >
        <OrderBadge status={order.status} />
      </PageTitle>
      {error && <ErrorBox message={error} focus />}
      <div className="editor-layout">
        <div className="editor-main">
          <OrderLines order={order} />
          <div className="panel order-lifecycle">
            {[
              ["pending", "Created", order.exportedAt],
              ["ordered", "Ordered", order.orderedAt],
              ["received", "Received", order.receivedAt],
              ["stock_updated", "Stock updated", order.appliedAt],
            ].map(([key, label, date]) => (
              <div key={key} className={date ? "done" : ""}>
                <span>{date ? <Check size={16} /> : <span />}</span>
                <strong>{label}</strong>
                <small>{date ? shortDate(date) : "Not yet"}</small>
              </div>
            ))}
          </div>
        </div>
        <aside className="editor-aside">
          <section className="panel form-section">
            <h2>Next step</h2>
            <p className="muted">
              {order.status === "received"
                ? "Supplies are here. Apply this order to update inventory."
                : order.status === "stock_updated"
                  ? "These quantities have already been added to your inventory."
                  : "Track this order as it makes its way to you."}
            </p>
            <div className="stack-actions">
              {order.status === "pending" && (
                <button
                  className="button primary"
                  disabled={a.busy}
                  onClick={() => action("ordered")}
                >
                  Mark ordered
                  <ArrowUpRight size={16} />
                </button>
              )}
              {["pending", "ordered", "partially_received"].includes(
                order.status,
              ) && (
                <button
                  className="button secondary"
                  disabled={a.busy}
                  onClick={() => action("received")}
                >
                  <PackageCheck size={16} />
                  Mark received
                </button>
              )}
              {order.status === "received" && (
                <button
                  className="button primary"
                  disabled={a.busy}
                  onClick={() => action("apply")}
                >
                  <Check size={16} />
                  Apply to stock
                </button>
              )}
              {[
                "pending",
                "ordered",
                "partially_received",
                "received",
              ].includes(order.status) && (
                <button
                  className="button ghost-danger"
                  disabled={a.busy}
                  onClick={() => action("declined")}
                >
                  Decline order
                </button>
              )}
            </div>
          </section>
          <section className="panel form-section">
            <h3>Share your supply list</h3>
            <p className="muted">
              Print or save a PDF to share with your supplier.
            </p>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={photos}
                onChange={(e) => setPhotos(e.target.checked)}
              />
              Include available photos
            </label>
            <button
              className="button secondary full-width"
              onClick={() => {
                try {
                  printOrder(order, photos);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Download size={16} />
              Print / Save PDF
            </button>
          </section>
          {["pending", "declined"].includes(order.status) && (
            <button
              className="button ghost-danger"
              disabled={a.busy}
              onClick={() => action("delete")}
            >
              <Trash2 size={16} />
              Delete order
            </button>
          )}
        </aside>
      </div>
    </>
  );
}
function OrderLines({ order }: { order: SavedOrder }) {
  return (
    <section className="panel">
      <div className="section-heading padded">
        <div>
          <h2>Items in this order</h2>
          <p>Quantities saved when the order was created.</p>
        </div>
      </div>
      {order.items.map((i, index) => (
        <div className="order-line" key={i.id || index}>
          <span className="line-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <strong>{i.name}</strong>
            <small>
              {i.brand ||
                i.categoryName ||
                `Stock at creation: ${i.currentStock}`}
            </small>
          </div>
          <b>
            {i.quantity}
            <small> {unitLabel(i.quantity, i.unit)}</small>
          </b>
        </div>
      ))}
      <div className="panel-bottom">
        <span>{order.totalItems} items</span>
        <strong>{order.totalUnits} total units</strong>
      </div>
    </section>
  );
}
export function CreateOrder() {
  const a = useApp(),
    [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate();
  const [error, setError] = useState(""),
    [pick, setPick] = useState(false),
    [q, setQ] = useState("");
  const [mode, setMode] = useState(
    params.get("mode") === "emergency" ? "emergency" : "attention",
  );
  const [stage, setStage] = useState<SaveStage | null>(null),
    [refreshing, setRefreshing] = useState(false);
  const [handledEntry, setHandledEntry] = useState<string | null>(null),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const saving = useRef(false),
    mounted = useRef(true),
    preflight = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.visibilityState === "hidden") preflight.current?.abort();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      preflight.current?.abort();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [location.key]);
  const d = a.draft;
  const locked = a.busy || stage !== null || refreshing || !!d?.attempt;
  const emergencyChoice =
    params.get("mode") === "emergency" && !!d && handledEntry !== location.key;
  const begin = () => {
    a.setDraft({ rows: initialDraft(a.data!.items, mode === "emergency") });
    setHandledEntry(location.key);
  };
  const chooseEmergency = (choice: "keep" | "replace" | "merge") => {
    if (!d || a.getDraft() !== d || !mounted.current) return;
    if (choice !== "keep") {
      if (locked) return;
      const rows = initialDraft(a.data!.items, true);
      a.replaceDraft(d, {
        ...d,
        rows: choice === "merge" ? mergeMissingRows(d.rows, rows) : rows,
      });
      setSelected(new Set());
    }
    setHandledEntry(location.key);
  };
  const change = (id: string, quantity: number) => {
    if (!d || locked) return;
    a.replaceDraft(d, {
      ...d,
      rows: d.rows.map((r) =>
        r.item.id === id ? { ...r, quantity, source: "manual" } : r,
      ),
    });
  };
  const save = async () => {
    if (!d || saving.current || a.busy) return;
    saving.current = true;
    setError("");
    const epoch = sessionEpoch(),
      controller = new AbortController();
    preflight.current = controller;
    try {
      await saveReviewedOrder({
        getDraft: a.getDraft,
        replaceDraft: a.replaceDraft,
        active: () =>
          mounted.current &&
          !controller.signal.aborted &&
          sessionEpoch() === epoch,
        stage: setStage,
        check: async () => {
          if (!DEMO) {
            const caps = await request<{ order_review_guard: boolean }>(
              "/ai/capabilities",
              "GET",
              undefined,
              controller.signal,
            );
            if (!caps.order_review_guard)
              throw new Error(
                "This server does not support reviewed orders yet. Your draft is retained.",
              );
          }
          return (await (await repository()).load(controller.signal)).items;
        },
        confirm: (retry, payload) =>
          a.confirm({
            title: retry ? "Retry the same submission?" : "Save this order?",
            body: retry
              ? "The server may already have saved this order. This uses the original submission ID and unchanged quantities to prevent duplicates."
              : `Create a pending order for ${payload.totalItems} items and ${payload.totalUnits} units. No stock will change and no purchase is placed.`,
            label: retry ? "Retry same order" : "Save order",
          }),
        recover: async (localId) =>
          (await (await repository()).load()).orders.find(
            (o) => o.localId === localId,
          ) || null,
        create: (payload) =>
          a.act((r) => r.createOrder(payload), "Order saved."),
      });
    } catch (e) {
      if (mounted.current && sessionEpoch() === epoch)
        setError((e as Error).message);
    } finally {
      saving.current = false;
      if (mounted.current) setStage(null);
    }
  };
  const refreshDraft = async () => {
    if (!d || locked) return;
    const controller = new AbortController();
    preflight.current = controller;
    setRefreshing(true);
    try {
      const current = await (await repository()).load(controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      for (const row of d.rows) {
        const fresh = current.items.find((i) => i.id === row.item.id);
        if (fresh && fresh.unit !== row.item.unit)
          throw new Error(
            `${row.item.name}'s unit changed. Remove and re-add this line before saving.`,
          );
      }
      const rows = d.rows
        .filter((r) =>
          current.items.some((i) => i.id === r.item.id && i.isActive),
        )
        .map((r) => ({
          ...r,
          item: current.items.find((i) => i.id === r.item.id)!,
        }));
      if (a.replaceDraft(d, { ...d, rows })) {
        setError("");
        a.notify(
          "Draft updated with current inventory. Your order quantities were kept; review before saving.",
        );
      }
    } catch (e) {
      if (mounted.current && !controller.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  };
  const selectedIds =
    d?.rows.filter((r) => selected.has(r.item.id)).map((r) => r.item.id) || [];
  const removeSelected = async () => {
    if (!d || locked || !selectedIds.length) return;
    if (
      await a.confirm({
        title: "Remove selected draft items?",
        body: `Remove ${selectedIds.length} items from this draft. Inventory stays unchanged.`,
        label: "Remove selected",
        danger: true,
      })
    ) {
      if (!mounted.current || a.getDraft() !== d) return;
      a.replaceDraft(d, {
        ...d,
        rows: d.rows.filter((r) => !selectedIds.includes(r.item.id)),
      });
      setSelected(new Set());
    }
  };
  if (a.loading) return <Loading />;
  if (!a.data)
    return <ErrorBox message={a.error || "Inventory unavailable."} />;
  if (d?.saved)
    return (
      <>
        <PageTitle
          eyebrow="ONE LESS THING TO REMEMBER"
          title="Your order is ready."
          description={`${d.saved.orderId} has been saved. You can print it now or come back to it later.`}
        />
        <div className="success-banner">
          <span>
            <Check size={24} />
          </span>
          <div>
            <h2>Saved to your orders</h2>
            <p>
              Your stock stays unchanged until the received order is applied.
            </p>
          </div>
        </div>
        {error && <ErrorBox message={error} focus />}
        <OrderLines order={d.saved} />
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => {
              try {
                printOrder(d.saved!);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Download size={16} />
            Print / Save PDF
          </button>
          <button
            className="button primary"
            onClick={() => {
              const id = d.saved!.id;
              a.setDraft(null);
              navigate(`/orders/${id}`);
            }}
          >
            View saved order
            <ArrowUpRight size={16} />
          </button>
        </div>
      </>
    );
  return (
    <>
      <Link to="/orders" className="back-link">
        <ArrowLeft size={16} />
        Back to orders
      </Link>
      <PageTitle
        eyebrow="A LITTLE PREPARATION GOES A LONG WAY"
        title="Create an order"
        description="Review the supplies you need, then save a list to share."
      />
      {error && <ErrorBox message={error} focus />}
      {emergencyChoice && (
        <section className="order-notice" aria-label="Emergency order review">
          <h2>
            {d?.attempt
              ? "Existing submission retained"
              : "Emergency order · existing draft"}
          </h2>
          <p>
            {d?.attempt
              ? "Resolve the previous submission before starting another order. Its original reference and quantities are retained."
              : "Keep your current draft, replace it with critical equipment that has one or no units, or add only missing emergency items. Existing quantities are kept when adding."}
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => chooseEmergency("keep")}
            >
              Keep current draft
            </button>
            {!d?.attempt && (
              <>
                <button
                  className="button secondary"
                  disabled={locked}
                  onClick={() => chooseEmergency("merge")}
                >
                  Add missing emergency items
                </button>
                <button
                  className="button ghost-danger"
                  disabled={locked}
                  onClick={() => chooseEmergency("replace")}
                >
                  Replace with emergency items
                </button>
              </>
            )}
          </div>
        </section>
      )}
      {!d ? (
        <div className="panel draft-start">
          <span className="empty-icon">
            <ShoppingCart size={32} />
          </span>
          <h2>Start with what needs attention.</h2>
          <p>
            We’ll suggest a quantity for each item based on your minimum stock.
            You can adjust every line.
          </p>
          <Select
            aria-label="Suggested items"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="attention">All items needing attention</option>
            <option value="emergency">
              Critical equipment · one or no units
            </option>
          </Select>
          <button className="button primary" onClick={begin}>
            Review suggested items
            <ArrowUpRight size={16} />
          </button>
          <button
            className="text-button"
            onClick={() => {
              a.setDraft({ rows: [] });
              setPick(true);
            }}
          >
            Start with a blank order
          </button>
        </div>
      ) : (
        <div className="editor-layout">
          <div className="editor-main">
            <section className="panel">
              <div className="section-heading padded">
                <div>
                  <h2>
                    Your supply list{" "}
                    <span className="count-pill">{d.rows.length}</span>
                  </h2>
                  <p>
                    Suggested quantities are editable. Check each item before
                    saving.
                  </p>
                </div>
                <button
                  className="button secondary"
                  disabled={locked}
                  onClick={() => setPick(true)}
                >
                  <Plus size={16} />
                  Add items
                </button>
              </div>
              {d.rows.length > 0 && (
                <div className="draft-selection">
                  <label>
                    <input
                      type="checkbox"
                      aria-label="Select all draft items"
                      disabled={locked}
                      checked={selectedIds.length === d.rows.length}
                      onChange={(e) =>
                        setSelected(
                          new Set(
                            e.target.checked
                              ? d.rows.map((r) => r.item.id)
                              : [],
                          ),
                        )
                      }
                    />{" "}
                    Select all
                  </label>
                  <span>{selectedIds.length} selected</span>
                  <button
                    className="text-button"
                    disabled={locked || !selectedIds.length}
                    onClick={removeSelected}
                  >
                    Remove selected
                  </button>
                </div>
              )}
              {!d.rows.length ? (
                <Empty
                  title="Your list is empty"
                  body="Add supplies to create an order."
                />
              ) : (
                d.rows.map(({ item, quantity, source }) => (
                  <div className="draft-line" key={item.id}>
                    <input
                      type="checkbox"
                      className="draft-check"
                      aria-label={`Select ${item.name} for removal`}
                      disabled={locked}
                      checked={selected.has(item.id)}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        })
                      }
                    />
                    <div>
                      <Link to={`/item/${item.id}`}>
                        <strong>{item.name}</strong>
                      </Link>
                      <small>
                        {item.quantity} {unitLabel(item.quantity, item.unit)} in
                        stock · Minimum {item.minimumStock}
                      </small>
                      <span
                        className="suggestion-label"
                        id={`quantity-hint-${item.id}`}
                      >
                        {!validateQuantity(quantity, true)
                          ? "Enter a whole quantity from 1 to 999,999."
                          : source === "suggested"
                            ? `Suggested · current ${item.quantity}, minimum ${item.minimumStock}`
                            : "Your quantity"}
                      </span>
                    </div>
                    <StockBadge item={item} />
                    <label className="draft-quantity">
                      <span className="sr-only">
                        Order quantity for {item.name}
                      </span>
                      <input
                        aria-label={`Order quantity for ${item.name}`}
                        aria-describedby={`quantity-hint-${item.id}`}
                        aria-invalid={!validateQuantity(quantity, true)}
                        type="number"
                        min={1}
                        max={999999}
                        step={1}
                        value={Number.isNaN(quantity) ? "" : quantity}
                        disabled={locked}
                        onChange={(e) =>
                          change(item.id, e.target.valueAsNumber)
                        }
                      />
                      <small>{item.unit}</small>
                    </label>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${item.name} from draft`}
                      disabled={locked}
                      onClick={() =>
                        !locked &&
                        a.replaceDraft(d, {
                          ...d,
                          rows: d.rows.filter((r) => r.item.id !== item.id),
                        })
                      }
                    >
                      <X size={17} />
                    </button>
                  </div>
                ))
              )}
            </section>
            <div className="form-actions">
              <button
                className="text-button"
                disabled={locked}
                onClick={refreshDraft}
              >
                Refresh draft
              </button>
              <div className="spacer" />
              <button
                className="button ghost-danger"
                disabled={locked}
                onClick={async () => {
                  if (
                    await a.confirm({
                      title: "Discard this draft?",
                      body: "Your unsaved order lines will be removed.",
                      label: "Discard draft",
                      danger: true,
                    })
                  ) {
                    if (!mounted.current || a.getDraft() !== d) return;
                    a.setDraft(null);
                    setError("");
                  }
                }}
              >
                Discard draft
              </button>
            </div>
          </div>
          <aside className="editor-aside">
            <div className="panel form-section order-summary">
              <h2>Order summary</h2>
              <div>
                <span>Items</span>
                <b>{d.rows.length}</b>
              </div>
              <div>
                <span>Total units</span>
                <b>
                  {d.rows.reduce(
                    (s, r) =>
                      s + (Number.isFinite(r.quantity) ? r.quantity : 0),
                    0,
                  )}
                </b>
              </div>
              <hr />
              <p>
                Save this order first. You can print or share it whenever you’re
                ready.
              </p>
              {stage && (
                <div className="order-progress" role="status">
                  <Spinner />
                  <div>
                    <strong>
                      {stage === "checking"
                        ? "Checking current stock"
                        : stage === "confirming"
                          ? "Review your confirmation"
                          : "Saving your order"}
                    </strong>
                    <p>
                      {stage === "saving"
                        ? "Waiting for server confirmation. Your quantities are locked. A retry will use this same submission."
                        : "Your draft and order quantities are retained."}
                    </p>
                  </div>
                </div>
              )}
              <button
                className="button primary full-width"
                disabled={
                  a.busy ||
                  stage !== null ||
                  refreshing ||
                  !d.rows.length ||
                  d.rows.some((r) => !validateQuantity(r.quantity, true))
                }
                onClick={save}
              >
                {stage || a.busy ? <Spinner /> : <Check size={16} />}{" "}
                {stage === "saving"
                  ? "Saving order…"
                  : stage === "checking"
                    ? "Checking stock…"
                    : d.attempt
                      ? "Retry same order"
                      : "Save order"}
              </button>
              {d.attempt && (
                <p className="small-note" role="status">
                  <strong>
                    {stage === "saving"
                      ? "Submission in progress. "
                      : "Save status unknown. "}
                  </strong>
                  The previous request may have reached the server. Retry uses
                  the same order reference to prevent duplicates. Keep this tab
                  open until resolved.
                </p>
              )}
            </div>
            <div className="tip-card">
              <ShieldCheck size={20} />
              <h3>You’re in control.</h3>
              <p>
                Saving an order does not purchase supplies or change stock.
                Update stock only after your order arrives.
              </p>
            </div>
          </aside>
        </div>
      )}
      {pick && (
        <Dialog
          wide
          title="Add supplies to your order"
          onClose={() => setPick(false)}
        >
          <div className="search-input">
            <Search size={18} />
            <input
              autoFocus
              aria-label="Find items for order"
              placeholder="Find an item…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="picker-list">
            {a.data.items
              .filter(
                (i) =>
                  i.isActive && i.name.toLowerCase().includes(q.toLowerCase()),
              )
              .map((i) => {
                const selected = d?.rows.some((r) => r.item.id === i.id);
                return (
                  <button
                    key={i.id}
                    className="search-result"
                    disabled={selected || locked}
                    onClick={() =>
                      !locked &&
                      a.setDraft((prev) =>
                        prev?.attempt
                          ? prev
                          : {
                              ...prev,
                              rows: [
                                ...(prev?.rows || []),
                                { item: i, quantity: 1, source: "manual" },
                              ],
                            },
                      )
                    }
                  >
                    <div>
                      <strong>{i.name}</strong>
                      <small>
                        {i.quantity} {unitLabel(i.quantity, i.unit)} on hand
                      </small>
                    </div>
                    {selected ? <Check size={18} /> : <Plus size={18} />}
                  </button>
                );
              })}
          </div>
          <div className="dialog-actions">
            <button className="button primary" onClick={() => setPick(false)}>
              Done · {d?.rows.length || 0} items
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
