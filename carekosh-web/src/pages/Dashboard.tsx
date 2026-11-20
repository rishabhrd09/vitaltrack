import { Link } from "react-router-dom";
import { useState } from "react";
import {
  Package,
  CircleAlert,
  TriangleAlert,
  ShoppingCart,
  ArrowUpRight,
  Plus,
  Check,
  Clock3,
  ArrowRight,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useApp } from "../context";
import { CoachMark } from "../components/CoachMark";
import {
  attention,
  backup,
  activeOrders,
  isOutOfStock,
  isLowStock,
  isCriticalEquipment,
  shortDate,
} from "../domain";
import {
  PageTitle,
  SectionTitle,
  Critical,
  StockBadge,
  ErrorBox,
  Loading,
} from "../components/ui";
export default function Dashboard() {
  const a = useApp();
  const [showEmergency, setShowEmergency] = useState(false);
  if (a.loading) return <Loading />;
  if (!a.data)
    return (
      <ErrorBox
        message={a.error || "Inventory is unavailable."}
        retry={() => void a.refresh().catch((e) => a.notify(e.message))}
      />
    );
  const { categories, orders, activities } = a.data,
    items = a.data.items.filter((i) => i.isActive),
    low = items.filter(isLowStock),
    out = items.filter(isOutOfStock),
    emergency = items
      .filter(backup)
      .sort((x, y) => x.quantity - y.quantity || x.name.localeCompare(y.name)),
    needs = items
      .filter(attention)
      .sort(
        (x, y) =>
          Number(isCriticalEquipment(y)) - Number(isCriticalEquipment(x)) ||
          x.quantity - y.quantity,
      ),
    stocked = items.length - low.length - out.length;
  const stats = [
    {
      label: "Total items",
      value: items.length,
      detail: `${categories.length} ${categories.length === 1 ? "category" : "categories"}`,
      icon: Package,
      color: "blue",
      to: "/inventory",
    },
    {
      label: "Out of stock",
      value: out.length,
      icon: CircleAlert,
      color: "out",
      to: "/inventory?status=out",
    },
    {
      label: "Low stock",
      value: low.length,
      icon: TriangleAlert,
      color: "low",
      to: "/inventory?status=low",
    },
    {
      label: "Pending orders",
      value: activeOrders(orders).length,
      icon: ShoppingCart,
      color: "blue",
      to: "/orders",
    },
  ];
  return (
    <div className="dashboard-page">
      <PageTitle title="Inventory overview">
        <Link className="button secondary" to="/builder">
          <SlidersHorizontal size={16} />
          Build Inventory
        </Link>
      </PageTitle>
      <div className="stat-grid">
        {stats.map(({ label, value, detail, icon: Icon, color, to }) => (
          <Link key={label} to={to} className={`stat-card ${color}`}>
            <div className="stat-top">
              <span className={`stat-icon ${color}`}>
                <Icon size={20} />
              </span>
              <ArrowUpRight className="stat-arrow" size={17} />
            </div>
            <div className="stat-value">
              {value}
              <span>{label}</span>
            </div>
            {detail && <p>{detail}</p>}
          </Link>
        ))}
      </div>
      {emergency.length > 0 && (
        <section
          className="emergency-panel"
          aria-label="Emergency backup equipment"
        >
          <div className="backup-banner">
            <div className="backup-icon">
              <ShieldCheck size={22} />
            </div>
            <div>
              <strong>Emergency backup</strong>
              <p>
                {emergency.length} critical{" "}
                {emergency.length === 1 ? "item has" : "items have"} one unit.
                Backup attention is separate from the recorded minimum.
              </p>
            </div>
            <Link to="/orders/new?mode=emergency" className="text-link">
              Review emergency order
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="emergency-summary">
            <span className="badge low">
              {emergency.filter((i) => i.quantity === 1).length} low reserve
            </span>
          </div>
          <div id="emergency-items" className="emergency-items">
            {(showEmergency ? emergency : emergency.slice(0, 3)).map((item) => (
              <Link
                key={item.id}
                to={`/item/${item.id}`}
                className="emergency-item"
                aria-label={`Review ${item.name}, ${item.quantity} ${item.unit}, ${item.quantity === 0 ? "out of stock" : "low reserve"}`}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {categories.find((c) => c.id === item.categoryId)?.name}
                  </small>
                </span>
                <span className="emergency-quantity">
                  <strong>
                    {item.quantity} <small>{item.unit}</small>
                  </strong>
                  <small>
                    {item.quantity === 0 ? "Out of stock" : "Low reserve"}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
          {emergency.length > 3 && (
            <button
              className="text-button emergency-expand"
              aria-expanded={showEmergency}
              aria-controls="emergency-items"
              onClick={() => setShowEmergency(!showEmergency)}
            >
              {showEmergency
                ? "Show fewer emergency items"
                : `View all ${emergency.length} emergency items`}
            </button>
          )}
        </section>
      )}
      <div className="dashboard-grid">
        <section className="panel attention-panel">
          <SectionTitle
            title="Needs attention"
            to="/inventory?status=attention"
          />
          {needs.length ? (
            <>
              <div className="attention-tabs">
                <span>
                  <i className="status-dot out" />
                  Out of stock <b>{out.length}</b>
                </span>
                <span>
                  <i className="status-dot low" />
                  Low stock <b>{low.length}</b>
                </span>
                <Link to="/orders/new">
                  Create order
                  <Plus size={15} />
                </Link>
              </div>
              <div className="attention-table">
                <div className="attention-table-head">
                  <span>ITEM</span>
                  <span>AVAILABLE</span>
                  <span>STATUS</span>
                  <span />
                </div>
                {needs.slice(0, 6).map((i) => (
                  <Link
                    to={`/item/${i.id}`}
                    key={i.id}
                    className="attention-row"
                  >
                    <div className="item-name-cell">
                      <span
                        className={`item-symbol ${isOutOfStock(i) ? "out" : "low"}`}
                      >
                        <Package size={18} />
                      </span>
                      <span>
                        <strong>
                          {i.name}
                          <Critical item={i} />
                        </strong>
                        <small>
                          {categories.find((c) => c.id === i.categoryId)?.name}
                        </small>
                      </span>
                    </div>
                    <span className="quantity">
                      <b>{i.quantity}</b>
                      <small>
                        {i.unit} · min {i.minimumStock}
                      </small>
                    </span>
                    <StockBadge item={i} />
                    <ArrowUpRight size={16} className="row-arrow" />
                  </Link>
                ))}
              </div>
              <div className="panel-bottom">
                <span>
                  {needs.length > 6
                    ? `Showing 6 of ${needs.length} items needing attention`
                    : `${needs.length} ${needs.length === 1 ? "item" : "items"} needing attention`}
                </span>
                <Link to="/inventory?status=attention">
                  View inventory
                  <ArrowRight size={14} />
                </Link>
              </div>
            </>
          ) : (
            <div className="stocked-empty">
              <span className="all-good">
                <Check size={25} />
              </span>
              <h3>{items.length ? "No stock alerts" : "No inventory items yet"}</h3>
              <Link className="button secondary" to="/builder">
                Build Inventory
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </section>
        <aside className="dashboard-side">
          <section className="panel coverage-card">
            <div className="coverage-header">
              <span className="stat-icon good">
                <Package size={19} />
              </span>
              <span>Stock overview</span>
            </div>
            <div className="coverage-number">
              {stocked}
              <span>/ {items.length}</span>
            </div>
            <p>items meeting their recorded minimum</p>
            <div
              className="stock-track"
              aria-label={`${stocked} in stock, ${low.length} low, ${out.length} out`}
            >
              {items.length ? (
                <>
                  <span className="fill-good" style={{ flex: stocked }} />
                  <span className="fill-low" style={{ flex: low.length }} />
                  <span className="fill-out" style={{ flex: out.length }} />
                </>
              ) : (
                <span className="fill-empty" />
              )}
            </div>
            <div className="stock-legend">
              <span>
                <i className="status-dot good" />
                In stock <b>{stocked}</b>
              </span>
              <span>
                <i className="status-dot low" />
                Low <b>{low.length}</b>
              </span>
              <span>
                <i className="status-dot out" />
                Out <b>{out.length}</b>
              </span>
            </div>
          </section>
          <section className="panel activity-card">
            <SectionTitle title="Recent activity" to="/activity" />
            <div className="activity-list">
              {activities.slice(0, 4).map((v, n) => (
                <div className="activity" key={v.id}>
                  <span className={`activity-dot ${n === 0 ? "blue" : ""}`}>
                    {v.action.includes("order") ? (
                      <ShoppingCart size={13} />
                    ) : (
                      <Package size={13} />
                    )}
                  </span>
                  <div>
                    <strong>{v.itemName}</strong>
                    <p>{v.details}</p>
                    <small>
                      <Clock3 size={10} />
                      {shortDate(v.timestamp)}
                    </small>
                  </div>
                </div>
              ))}
              {!activities.length && (
                <p className="muted">
                  Your inventory updates will appear here.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
      <button
        className="coach-card coach-entry"
        type="button"
        aria-haspopup="dialog"
        onClick={() => a.setCoachOpen(true)}
      >
        <CoachMark className="coach-mark-large" />
        <span>Ask CareKosh</span>
        <ArrowUpRight size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
