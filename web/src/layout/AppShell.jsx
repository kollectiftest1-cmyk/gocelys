import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight, Bell, BookOpenCheck, Boxes, Building2, CalendarClock, ClipboardList, FileBarChart2, History,
  Globe, Layers, LayoutDashboard, LogOut, Menu, Package, Receipt, Search, Settings, ShieldCheck, ShoppingBag, Store, Truck, Users,
  Wallet, WalletCards, MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { get, post } from "../api/client";
import { Avatar, Drawer, Empty, Logo } from "../components/ui";
import { useAuth } from "../lib/auth";
import { ago } from "../lib/format";
import { useWorkspace } from "../lib/workspace";

export const NAV = [
  {
    title: "Pilotage",
    items: [
      { to: "/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard, perm: ["dashboard.view"], end: true },
      { to: "/rapports", label: "Rapports", icon: FileBarChart2, perm: ["reports.view"] },
    ],
  },
  {
    title: "Ventes",
    items: [
      { to: "/caisse", label: "Caisse", icon: Store, perm: ["sales.create"] },
      { to: "/ventes", label: "Ventes POS", icon: Receipt, perm: ["sales.view"] },
      { to: "/caisses", label: "Sessions de caisse", icon: WalletCards, perm: ["cash.view"] },
      { to: "/commandes", label: "Commandes", icon: ShoppingBag, perm: ["orders.view"], badge: "orders" },
      { to: "/clients", label: "Clients", icon: Users, perm: ["customers.view"] },
    ],
  },
  {
    title: "Logistique",
    items: [
      { to: "/stocks", label: "Stocks", icon: Boxes, perm: ["stock.view"] },
      { to: "/transferts", label: "Transferts", icon: ArrowLeftRight, perm: ["stock.view", "transfers.request"] },
      { to: "/inventaires", label: "Inventaires", icon: ClipboardList, perm: ["inventory.manage", "inventory.validate"] },
      { to: "/livraisons", label: "Livraisons", icon: Truck, perm: ["deliveries.view"] },
      { to: "/produits", label: "Produits", icon: Package, perm: ["products.view"] },
      { to: "/catalogue", label: "Catégories et unités", icon: Layers, perm: ["categories.manage"] },
      { to: "/site-public", label: "Site public", icon: MonitorSmartphone, perm: ["site.manage"] },
    ],
  },
  {
    title: "Finances",
    items: [
      { to: "/finances", label: "Trésorerie", icon: Wallet, perm: ["finance.view"], end: true },
      { to: "/finances/depenses", label: "Dépenses", icon: BookOpenCheck, perm: ["finance.view", "expenses.create"] },
      { to: "/finances/echeances", label: "Charges et échéances", icon: CalendarClock, perm: ["finance.view", "charges.manage"] },
    ],
  },
  {
    title: "Administration",
    items: [
      { to: "/agences", label: "Agences", icon: Building2, perm: ["agencies.view"] },
      { to: "/utilisateurs", label: "Utilisateurs et rôles", icon: ShieldCheck, perm: ["users.view"] },
      { to: "/journal", label: "Journal d'activité", icon: History, perm: ["audit.view"] },
      { to: "/parametres", label: "Paramètres", icon: Settings, perm: ["settings.manage"] },
    ],
  },
];

const ROLE_LABEL = {
  admin: "Administrateur", direction: "Direction", agency_manager: "Responsable d'agence", cashier: "Caissier",
  stock_keeper: "Gestionnaire de stock", driver: "Livreur",
};

function Notifications({ open, onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => get("/notifications/", { page_size: 40 }), enabled: open });
  const items = data?.results || [];
  const readAll = async () => {
    await post("/notifications/read_all/");
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notif-count"] });
  };
  const openItem = async (n) => {
    if (!n.read_at) post(`/notifications/${n.id}/read/`).then(() => qc.invalidateQueries({ queryKey: ["notif-count"] }));
    if (n.link?.startsWith("/")) {
      navigate(n.link);
      onClose();
    }
  };
  const tone = { danger: "var(--clay-500)", warning: "var(--amber-500)", success: "var(--leaf-500)", info: "var(--sky-500)" };
  return (
    <Drawer open={open} onClose={onClose} title="Alertes et notifications" sub="Stock, caisses, commandes, échéances"
      footer={<button className="btn" onClick={readAll}>Tout marquer comme lu</button>}>
      {items.length === 0 ? (
        <Empty icon={Bell} title="Rien à signaler">Les alertes automatiques apparaîtront ici.</Empty>
      ) : (
        <div className="stack-sm">
          {items.map((n) => (
            <button key={n.id} onClick={() => openItem(n)} className="notif" style={{
              display: "flex", gap: 12, textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
              border: "1px solid var(--line)", background: n.read_at ? "var(--surface)" : "var(--sky-50)",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, flex: "none", background: tone[n.level] }} />
              <span className="grow">
                <span className="strong small" style={{ display: "block" }}>{n.title}</span>
                <span className="muted small" style={{ display: "block" }}>{n.body}</span>
                <span className="faint xs">{ago(n.created_at)}{n.agency_name ? ` · ${n.agency_name}` : ""}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Drawer>
  );
}

export default function AppShell() {
  const { user, logout, can, agencies, isGlobal } = useAuth();
  const { agency, setAgency } = useWorkspace();
  const [navOpen, setNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [q, setQ] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setNavOpen(false), [location.pathname]);

  const { data: count } = useQuery({ queryKey: ["notif-count"], queryFn: () => get("/notifications/count/"), refetchInterval: 60000 });
  const { data: openOrders } = useQuery({
    queryKey: ["orders-new-count", agency], enabled: can("orders.view"), refetchInterval: 60000,
    queryFn: () => get("/orders/", { status: "confirmed", page_size: 1, ...(agency ? { agency } : {}) }),
  });

  const search = (e) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    if (/^CMD/i.test(term)) navigate(`/commandes?search=${encodeURIComponent(term)}`);
    else if (/^VTE/i.test(term)) navigate(`/ventes?search=${encodeURIComponent(term)}`);
    else if (/^TRF/i.test(term)) navigate(`/transferts?search=${encodeURIComponent(term)}`);
    else navigate(`/produits?search=${encodeURIComponent(term)}`);
    setQ("");
  };

  const role = user?.roles?.[0];

  return (
    <div className={`shell ${navOpen ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-name">Gocelsys</div>
            <div className="brand-tag">Distribution · produits du quotidien</div>
          </div>
        </div>
        <nav className="nav" aria-label="Navigation principale">
          {NAV.map((group) => {
            const items = group.items.filter((i) => can(...i.perm));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group.title}>
                <div className="nav-group-title">{group.title}</div>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                    <item.icon />
                    <span>{item.label}</span>
                    {item.badge === "orders" && openOrders?.count > 0 && <span className="nav-badge">{openOrders.count}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <Avatar name={user?.full_name} />
          <div className="who">
            <strong className="truncate">{user?.full_name}</strong>
            <span>{ROLE_LABEL[role] || "Personnel"}</span>
          </div>
          <a href="/" className="btn btn-ghost btn-icon btn-sm" aria-label="Voir le site public" title="Voir le site public"><Globe /></a>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={logout} aria-label="Se déconnecter" title="Se déconnecter">
            <LogOut />
          </button>
        </div>
      </aside>
      {navOpen && <div className="overlay" style={{ zIndex: 55 }} onClick={() => setNavOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-toggle" onClick={() => setNavOpen(true)} aria-label="Ouvrir le menu">
            <Menu />
          </button>
          <form className="search input-group" onSubmit={search} role="search">
            <Search />
            <input className="input" placeholder="Rechercher un produit, CMD-…, VTE-…" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="spacer" />
          <select className="select agency-switch" value={agency} onChange={(e) => setAgency(e.target.value)} aria-label="Agence">
            {(isGlobal || agencies.length > 1) && <option value="">Toutes les agences</option>}
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.status !== "active" ? " (fermée)" : ""}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-icon bell" onClick={() => setNotifOpen(true)} aria-label="Notifications">
            <Bell />
            {count?.unread > 0 && <span className="dot">{count.unread > 99 ? "99+" : count.unread}</span>}
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <Notifications open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
}
