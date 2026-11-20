import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  SlidersHorizontal,
  Search,
  Plus,
  Download,
  Moon,
  Sun,
  CircleHelp,
  ArrowUpRight,
  LogOut,
  X,
  Menu,
  ShieldCheck,
  FileJson,
  FileText,
  Check,
  RefreshCw,
} from "lucide-react";
import { useApp } from "../context";
import { DEMO } from "../services/api";
import { initials, shortDate } from "../domain";
import { Dialog, ErrorBox, StockBadge } from "./ui";
import { downloadJson, printInventory } from "../services/export";
import { Coach } from "./Coach";
import { CoachMark } from "./CoachMark";
import { useSupplyReviewAvailability } from "./SupplyReviewEntry";
import { BRAND } from "../brand";
export function Shell() {
  const a = useApp(),
    location = useLocation(),
    navigate = useNavigate();
  const [search, setSearch] = useState(false),
    [q, setQ] = useState(""),
    [exportOpen, setExport] = useState(false),
    [photos, setPhotos] = useState(false),
    [menu, setMenu] = useState(false),
    [exportError, setExportError] = useState("");
  const supplyAvailable = useSupplyReviewAvailability(a.user?.id, a.online);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const nav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/inventory", label: "Inventory", icon: Package },
    { to: "/orders", label: "Orders", icon: ShoppingCart },
  ];
  const find = q.trim().toLowerCase();
  const items = (a.data?.items || []).filter(
    (i) =>
      i.isActive &&
      find &&
      (i.name.toLowerCase().includes(find) ||
        i.brand?.toLowerCase().includes(find)),
  );
  const cats = (a.data?.categories || []).filter(
    (c) => find && c.name.toLowerCase().includes(find),
  );
  const exportAction = (fn: () => void) => {
    try {
      fn();
      setExportError("");
    } catch (e) {
      setExportError((e as Error).message);
    }
  };
  return (
    <div className="application">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menu && (
        <button
          aria-label="Close navigation"
          className="nav-scrim"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${menu ? "open" : ""}`}
      >
        <Link to="/" className="brand" aria-label={BRAND.fullName}>
          <span className="brand-mark">
            <img src={`/brand/mark-${a.theme}.png`} alt="" />
          </span>
          <span>
            <strong>
              CareKosh<span className="brand-dot">.</span>
            </strong>
            <small>{BRAND.descriptor}</small>
          </span>
        </Link>
        <div className="workspace-switch">
          <div className="workspace-icon">
            <ShieldCheck size={18} />
          </div>
          <div>
            <strong>My care space</strong>
            <small>Home inventory</small>
          </div>
          <span className="status-dot good" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <Icon size={19} />
              <span>{label}</span>
              {label === "Orders" && !!a.draft?.rows.length && (
                <span className="nav-count">1</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="nav-divider" />
        <nav className="primary-nav" aria-label="Tools">
          <NavLink to="/builder">
            <SlidersHorizontal size={19} />
            <span>Build Inventory</span>
          </NavLink>
          {supplyAvailable && (
            <NavLink to="/supply-review">
              <ShieldCheck size={19} />
              <span>Supply review</span>
            </NavLink>
          )}
          <button
            className={a.coachOpen ? "selected" : ""}
            onClick={() => a.setCoachOpen(true)}
          >
            <CoachMark className="coach-mark-small" />
            <span>Ask CareKosh</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <nav className="primary-nav">
            <NavLink to="/help">
              <CircleHelp size={19} />
              <span>Help & support</span>
            </NavLink>
            <button onClick={a.toggleTheme}>
              {a.theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
              <span>
                {a.theme === "dark" ? "Light appearance" : "Dark appearance"}
              </span>
            </button>
          </nav>
          <Link to="/profile" className="user-block">
            <span className="avatar">{initials(a.user?.name)}</span>
            <span>
              <strong>{a.user?.name || "Caregiver"}</strong>
              <small>Personal account</small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </aside>
      <div className="app-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={menuButton}
              className="icon-button menu-toggle"
              aria-label="Open navigation"
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              My care space<span>/</span>
              <strong>
                {location.pathname.startsWith("/orders")
                  ? "Orders"
                  : location.pathname.startsWith("/inventory") ||
                      location.pathname.startsWith("/item")
                    ? "Inventory"
                    : location.pathname.startsWith("/builder")
                      ? "Build Inventory"
                      : location.pathname.startsWith("/profile")
                        ? "Account"
                        : location.pathname.startsWith("/help")
                          ? "Support"
                          : location.pathname.startsWith("/activity")
                            ? "Activity"
                            : location.pathname === "/"
                              ? "Overview"
                              : "Workspace"}
              </strong>
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              aria-label="Search anything"
              onClick={() => setSearch(true)}
            >
              <Search size={17} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button theme-mobile"
              aria-label="Toggle appearance"
              onClick={a.toggleTheme}
            >
              {a.theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="topbar-rule" />
            <button
              className="button secondary export-button"
              onClick={() => setExport(true)}
              disabled={!a.data}
            >
              <Download size={16} />
              <span>Export</span>
            </button>
            <Link
              className="button primary add-button"
              aria-label="Add item"
              to="/item/new"
            >
              <Plus size={17} />
              <span>Add item</span>
            </Link>
            <Link
              to="/profile"
              className="avatar avatar-small"
              aria-label="Open your profile"
            >
              {initials(a.user?.name)}
            </Link>
          </div>
        </header>
        <main
          id="main-content"
          className={
            /^\/(inventory|item|orders|builder|profile|help|activity)(?:\/|$)/.test(
              location.pathname,
            )
              ? "workspace-page"
              : undefined
          }
        >
          {(DEMO || !a.online) && (
            <div className="environment-row">
              <span className="environment-label">
                <span className={`status-dot ${DEMO ? "blue" : "low"}`} />
                {DEMO ? "Demo workspace · Sample data" : "Offline · showing last loaded data"}
              </span>
              <span className="today">{shortDate(new Date().toISOString())}</span>
            </div>
          )}
          {a.error && a.data && (
            <ErrorBox
              message={`Showing last loaded data. ${a.error}`}
              retry={() => void a.refresh().catch((e) => a.notify(e.message))}
            />
          )}
          <Outlet />
        </main>
      </div>
      <nav className="mobile-tabs" aria-label="Mobile navigation">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}>
            <Icon size={21} />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          aria-label="Ask CareKosh"
          aria-haspopup="dialog"
          onClick={() => a.setCoachOpen(true)}
        >
          <CoachMark className="coach-mark-small" />
          <span className="mobile-coach-label">Ask CareKosh</span>
        </button>
      </nav>
      {!a.coachOpen && (
        <button
          className="coach-launcher"
          aria-label="Ask CareKosh"
          onClick={() => a.setCoachOpen(true)}
        >
          <CoachMark />
          <span className="coach-launcher-label">
            <strong>Ask CareKosh</strong>
          </span>
          <span className="coach-key">↗</span>
        </button>
      )}
      {a.coachOpen && <Coach supplyAvailable={supplyAvailable} />}
      {search && (
        <Dialog
          wide
          title="Search your care space"
          onClose={() => {
            setSearch(false);
            setQ("");
          }}
        >
          <div className="search-input large">
            <Search size={20} />
            <input
              autoFocus
              aria-label="Search your care space"
              placeholder="Search items, brands, or categories…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => setQ("")}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="search-results">
            {!find ? (
              <p className="muted search-hint">
                Find a supply, check its stock, or jump to a category.
              </p>
            ) : !items.length && !cats.length ? (
              <p className="muted search-hint">
                No results for “{q}”. Try a shorter name.
              </p>
            ) : (
              <>
                {cats.map((c) => (
                  <button
                    key={c.id}
                    className="search-result"
                    onClick={() => {
                      navigate(`/inventory?category=${c.id}`);
                      setSearch(false);
                      setQ("");
                    }}
                  >
                    <span className="item-symbol">
                      <SlidersHorizontal size={17} />
                    </span>
                    <div>
                      <strong>{c.name}</strong>
                      <small>Category</small>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
                {items.map((i) => (
                  <button
                    key={i.id}
                    className="search-result"
                    onClick={() => {
                      navigate(`/item/${i.id}`);
                      setSearch(false);
                      setQ("");
                    }}
                  >
                    <span className="item-symbol">
                      <Package size={17} />
                    </span>
                    <div>
                      <strong>{i.name}</strong>
                      <small>
                        {i.quantity} {i.unit}
                      </small>
                    </div>
                    <StockBadge item={i} />
                  </button>
                ))}
              </>
            )}
          </div>
        </Dialog>
      )}
      {exportOpen && (
        <Dialog title="Export your inventory" onClose={() => setExport(false)}>
          <p className="dialog-copy">
            Keep a copy, share a supply list, or print it for your next order.
          </p>
          {exportError && <ErrorBox message={exportError} />}
          <button
            className="export-option"
            onClick={() =>
              exportAction(() =>
                printInventory(
                  a.data!.items.filter((i) => i.isActive),
                  a.data!.categories,
                  photos,
                ),
              )
            }
          >
            <span className="option-icon blue">
              <FileText size={23} />
            </span>
            <div>
              <strong>Print / Save as PDF</strong>
              <p>A clean, organized inventory report</p>
            </div>
            <ArrowUpRight size={18} />
          </button>
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={photos}
              onChange={(e) => setPhotos(e.target.checked)}
            />{" "}
            Include available item photos
          </label>
          <button
            className="export-option"
            onClick={() =>
              exportAction(() => {
                downloadJson({
                  version: "2.0.0",
                  exportDate: new Date().toISOString(),
                  categories: a.data!.categories,
                  items: a.data!.items,
                });
                a.notify("Inventory JSON downloaded.");
              })
            }
          >
            <span className="option-icon good">
              <FileJson size={23} />
            </span>
            <div>
              <strong>Download JSON</strong>
              <p>Inventory items and categories</p>
            </div>
            <Download size={18} />
          </button>
          <p className="small-note">
            <Check size={14} /> Exports use the inventory currently loaded in
            this workspace.
          </p>
        </Dialog>
      )}
    </div>
  );
}
export function Help() {
  const a = useApp();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">HERE TO HELP</p>
          <h1>A little guidance.</h1>
          <p className="page-description">
            Get more comfortable with your care space.
          </p>
        </div>
      </div>
      <div className="help-grid">
        {[
          {
            title: "Know what needs attention",
            body: "Out of stock means none are left. Low stock means a positive quantity below the recorded minimum. Explicitly marked critical equipment with one unit appears separately under backup attention.",
          },
          {
            title: "Orders are a two-step process",
            body: "Mark an order received when your supplies arrive. Then choose Apply to stock to add the quantities to your inventory. Creating or printing an order never buys supplies.",
          },
          {
            title: "Ask CareKosh",
            body: "Ask about supplies in your inventory. CareKosh can prepare an unsaved order draft. You always review and confirm before it is saved.",
          },
          {
            title: "Your data stays with your account",
            body: DEMO
              ? "This is a local demo. Changes are stored in this browser and never reach a real CareKosh account."
              : "Inventory is saved on the server. If you lose your connection, reconnect before making changes.",
          },
        ].map((x) => (
          <article className="panel help-card" key={x.title}>
            <ShieldCheck size={22} />
            <h2>{x.title}</h2>
            <p>{x.body}</p>
          </article>
        ))}
      </div>
      <div className="panel support-card">
        <div>
          <h2>Need a hand?</h2>
          <p>Contact the CareKosh team, or reload the latest account data.</p>
        </div>
        <a className="button secondary" href="mailto:support@carekosh.com">
          Contact support
          <ArrowUpRight size={16} />
        </a>
        <button
          className="button secondary"
          onClick={() =>
            void a
              .refresh()
              .then(() => a.notify("Latest server data loaded."))
              .catch((e) => a.notify(e.message))
          }
        >
          <RefreshCw size={16} />
          Refresh data
        </button>
      </div>
      <div className="about-line">
        {BRAND.fullName} · Web 1.0.0{" "}
        <button
          className="text-button"
          onClick={async () => {
            if (
              await a.confirm({
                title: "Sign out?",
                body: "You can sign in again to access your inventory.",
                label: "Sign out",
              })
            )
              await a.signOut();
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </>
  );
}
