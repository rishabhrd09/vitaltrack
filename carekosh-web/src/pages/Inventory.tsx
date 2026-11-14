import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  List,
  FolderOpen,
  Package,
  ChevronRight,
  ArrowUpRight,
  X,
  SlidersHorizontal,
  Plus,
} from "lucide-react";
import { useApp } from "../context";
import { attention, stockStatus, backup } from "../domain";
import {
  PageTitle,
  Loading,
  ErrorBox,
  Empty,
  Select,
  Critical,
  StockBadge,
} from "../components/ui";
export default function Inventory() {
  const a = useApp(),
    [params, setParams] = useSearchParams(),
    [closed, setClosed] = useState<Set<string>>(new Set());
  const view = params.get("view") || "all",
    q = params.get("q") || "",
    category = params.get("category") || "",
    status = params.get("status") || "",
    sort = params.get("sort") || "name";
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  if (a.loading) return <Loading />;
  if (!a.data)
    return (
      <ErrorBox
        message={a.error || "Unable to load inventory."}
        retry={() => void a.refresh().catch((e) => a.notify(e.message))}
      />
    );
  const items = a.data.items
    .filter(
      (i) =>
        i.isActive &&
        (!q ||
          `${i.name} ${i.brand || ""}`
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!category || i.categoryId === category) &&
        (!status || status === "attention"
          ? !status || attention(i)
          : status === "backup"
            ? backup(i)
            : stockStatus(i) === status),
    )
    .sort((x, y) =>
      sort === "quantity"
        ? x.quantity - y.quantity
        : sort === "status"
          ? Number(attention(y)) - Number(attention(x)) ||
            x.name.localeCompare(y.name)
          : x.name.localeCompare(y.name),
    );
  const row = (i: (typeof items)[number]) => (
    <Link to={`/item/${i.id}`} className="inventory-row" key={i.id}>
      <div className="item-name-cell">
        <span className="item-symbol">
          <Package size={19} />
        </span>
        <span>
          <strong>
            {i.name}
            <Critical item={i} />
          </strong>
          <small>
            {i.brand ||
              a.data!.categories.find((c) => c.id === i.categoryId)?.name}
          </small>
        </span>
      </div>
      <span className="category-cell">
        {a.data!.categories.find((c) => c.id === i.categoryId)?.name}
      </span>
      <span className="table-quantity">
        <span className="mobile-cell-label">Stock</span>
        <b>{i.quantity}</b>
        <small>{i.unit}</small>
      </span>
      <span className="min-cell">
        <span className="mobile-cell-label">Minimum</span>
        {i.minimumStock}
      </span>
      <StockBadge item={i} />
      <ArrowUpRight size={16} className="row-arrow" />
    </Link>
  );
  return (
    <>
      <PageTitle
        eyebrow="EVERY SUPPLY, IN ITS PLACE"
        title="Your inventory"
        description="Know what you have. Find what you need."
      >
        <Link className="button secondary" to="/builder">
          <SlidersHorizontal size={16} />
          Manage categories
        </Link>
      </PageTitle>
      <section className="panel inventory-panel">
        <div className="inventory-toolbar">
          <div className="segmented">
            <button
              className={view === "all" ? "active" : ""}
              onClick={() => set("view", "all")}
            >
              <List size={16} />
              All items
            </button>
            <button
              className={view === "categories" ? "active" : ""}
              onClick={() => set("view", "categories")}
            >
              <FolderOpen size={16} />
              Categories
            </button>
          </div>
          <span className="item-count">
            {a.data.items.filter((i) => i.isActive).length} items <span>·</span>{" "}
            {a.data.categories.length} categories
          </span>
          <Link to="/item/new" className="text-link">
            <Plus size={15} />
            Add item
          </Link>
        </div>
        <div className="filter-bar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Search inventory"
              placeholder="Search items…"
              value={q}
              onChange={(e) => set("q", e.target.value)}
            />
            {q && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => set("q", "")}
              >
                <X size={15} />
              </button>
            )}
          </div>
          <Select
            aria-label="Category filter"
            value={category}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">All categories</option>
            {a.data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Stock status filter"
            value={status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="good">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="attention">Needs attention</option>
            <option value="backup">Emergency backup</option>
          </Select>
          <Select
            aria-label="Sort inventory"
            value={sort}
            onChange={(e) => set("sort", e.target.value)}
          >
            <option value="name">Name A–Z</option>
            <option value="quantity">Lowest stock</option>
            <option value="status">Attention first</option>
          </Select>
        </div>
        {(q || category || status) && (
          <div className="filter-summary">
            <span>
              {items.length} matching {items.length === 1 ? "item" : "items"}
            </span>
            <button
              className="text-button"
              onClick={() => setParams(view === "categories" ? { view } : {})}
            >
              Clear filters
              <X size={13} />
            </button>
          </div>
        )}
        {!items.length ? (
          <Empty
            title={
              q || category || status
                ? "No matching items"
                : "A fresh start for your care space"
            }
            body={
              q || category || status
                ? "Try another search or clear your filters."
                : "Add your first item or start with our home ICU essentials."
            }
          >
            <Link className="button primary" to="/builder">
              Build Inventory
              <ArrowUpRight size={16} />
            </Link>
          </Empty>
        ) : view === "all" ? (
          <>
            <div className="inventory-table-head">
              <span>ITEM</span>
              <span>CATEGORY</span>
              <span>STOCK</span>
              <span>MINIMUM</span>
              <span>STATUS</span>
              <span />
            </div>
            {items.map(row)}
          </>
        ) : (
          <div className="category-groups">
            {a.data.categories
              .filter((c) => items.some((i) => i.categoryId === c.id))
              .map((c) => (
                <section key={c.id}>
                  <button
                    className="category-group-heading"
                    onClick={() =>
                      setClosed((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                    aria-expanded={!closed.has(c.id)}
                  >
                    <FolderOpen size={19} />
                    <strong>{c.name}</strong>
                    <span>
                      {items.filter((i) => i.categoryId === c.id).length} items
                    </span>
                    <ChevronRight
                      className={!closed.has(c.id) ? "rotate" : ""}
                      size={17}
                    />
                  </button>
                  {!closed.has(c.id) &&
                    items.filter((i) => i.categoryId === c.id).map(row)}
                </section>
              ))}
          </div>
        )}
        <div className="panel-bottom">
          <span>{items.length} items shown</span>
          <span>
            <span className="status-dot good" />{" "}
            {a.online
              ? "Up to date with loaded inventory"
              : "Offline · last loaded inventory"}
          </span>
        </div>
      </section>
    </>
  );
}
