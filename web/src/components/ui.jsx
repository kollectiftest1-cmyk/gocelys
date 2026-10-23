import { ChevronLeft, ChevronRight, Droplets, X } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import { initials } from "../lib/format";

export function Logo({ size = 34, dark = false }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill={dark ? "#1F1C55" : "#4B35E0"} />
      <path d="M43.5 22.4A15 15 0 1 0 47 32H33" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="47.5" cy="17.5" r="4.5" fill="#F25A3C" />
    </svg>
  );
}

export function Pill({ tone = "", children, plain = false, title }) {
  return (
    <span className={`pill ${tone ? `pill-${tone}` : ""} ${plain ? "plain" : ""}`} title={title}>
      {children}
    </span>
  );
}

export function StatusPill({ map, value, fallback }) {
  const [label, tone] = map[value] || [fallback || value, ""];
  return <Pill tone={tone}>{label}</Pill>;
}

export function Avatar({ name, color }) {
  return (
    <span className="avatar" style={color ? { background: color + "22", color } : undefined}>
      {initials(name) || "?"}
    </span>
  );
}

export function AgencyDot({ color }) {
  return <span className="agency-dot" style={{ background: color || "var(--sky-500)" }} />;
}

export function PageHead({ title, lead, crumb, actions }) {
  return (
    <header className="page-head">
      <div>
        {crumb && (
          <div className="crumb">
            {crumb.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6 }}>
                {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
                {i < crumb.length - 1 && <ChevronRight size={13} />}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Panel({ title, sub, actions, children, flush, className = "", style }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={flush ? "panel-flush" : "panel-body"}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Empty({ icon: Icon = Droplets, title, children, action }) {
  return (
    <div className="empty">
      <Icon />
      {title && <h3>{title}</h3>}
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 14, w = "100%", style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function LoadingRows({ rows = 6, cols = 5 }) {
  return (
    <table className="table">
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            {Array.from({ length: cols }).map((__, j) => (
              <td key={j}>
                <Skeleton w={j === 0 ? "70%" : "50%"} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useEscape(onClose) {
  useEffect(() => {
    const fn = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
}

export function Drawer({ open, onClose, title, sub, children, footer, wide }) {
  useEscape(open ? onClose : null);
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className={`drawer ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
        <div className="drawer-head">
          <div className="grow">
            <h2 style={{ fontSize: "var(--fs-xl)" }}>{title}</h2>
            {sub && <div className="muted small" style={{ marginTop: 4 }}>{sub}</div>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            <X />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

export function Modal({ open, onClose, title, children, footer }) {
  useEscape(open ? onClose : null);
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2 style={{ fontSize: "var(--fs-lg)" }}>{title}</h2>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? "active" : ""}`}
          onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, count, pageSize = 25, onPage }) {
  const pages = Math.max(1, Math.ceil((count || 0) / pageSize));
  if (!count) return null;
  return (
    <div className="pager">
      <span>
        {Math.min(count, (page - 1) * pageSize + 1)}–{Math.min(count, page * pageSize)} sur {count}
      </span>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-sm btn-icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente">
          <ChevronLeft />
        </button>
        <span className="small">
          {page} / {pages}
        </span>
        <button className="btn btn-sm btn-icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante">
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
