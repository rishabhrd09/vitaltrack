import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  X,
  Package,
  AlertCircle,
  LoaderCircle,
  ArrowUpRight,
  Star,
  ChevronDown,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  isCriticalEquipment,
  stockStatus,
  statusLabel,
  orderLabels,
  type Item,
} from "../domain";
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const el = ref.current;
    const prior = document.activeElement as HTMLElement;
    el?.showModal();
    return () => {
      el?.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""} ${className}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  );
}
export function Empty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Package size={28} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
  focus = false,
}: {
  message: string;
  retry?: () => void;
  focus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus) return;
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "center" });
  }, [focus, message]);
  return (
    <div
      ref={ref}
      className="error-box"
      role="alert"
      tabIndex={focus ? -1 : undefined}
    >
      <AlertCircle size={18} />
      <div>
        {message}
        {retry && (
          <button className="text-button" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div
      className="loading-layout"
      aria-label="Loading inventory"
      role="status"
    >
      <div className="skeleton skeleton-title" />
      <div className="stat-grid">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="skeleton skeleton-main" />
    </div>
  );
}
export function Spinner() {
  return <LoaderCircle size={17} className="spin" />;
}
export function StockBadge({ item }: { item: Item }) {
  return (
    <span className={`badge ${stockStatus(item)}`}>
      <span className="status-dot" />
      {statusLabel(item)}
    </span>
  );
}
export function Critical({ item }: { item: Item }) {
  return isCriticalEquipment(item) ? (
    <span className="critical" title="Critical equipment">
      <Star size={12} fill="currentColor" />
      <span className="sr-only">Critical equipment</span>
    </span>
  ) : null;
}
export function OrderBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    pending: "low",
    ordered: "blue",
    partially_received: "low",
    received: "good",
    stock_updated: "good",
    completed: "good",
    declined: "out",
    cancelled: "neutral",
  };
  return (
    <span className={`badge ${tone[status] || "neutral"}`}>
      <span className="status-dot" />
      {orderLabels[status] || status}
    </span>
  );
}
export function SectionTitle({
  title,
  subtitle,
  to,
  label = "View all",
}: {
  title: string;
  subtitle?: string;
  to?: string;
  label?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {to && (
        <Link className="text-link" to={to}>
          {label}
          <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
  required = false,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
  // Required when buttons precede the input: an unassociated label activates
  // its first control, so a caption click would press that button.
  htmlFor?: string;
}) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span>
        {label}
        {required && <span className="required"> *</span>}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-wrap">
      <select {...props}>{children}</select>
      <ChevronDown size={15} />
    </span>
  );
}
