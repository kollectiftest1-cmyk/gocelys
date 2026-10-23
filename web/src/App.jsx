import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { Skeleton } from "./components/ui";
import AppShell, { NAV } from "./layout/AppShell";
import { useAuth } from "./lib/auth";
import Login, { Register } from "./pages/Login";
import PublicShell from "./public/PublicShell";

const Landing = lazy(() => import("./public/Landing"));
const PublicShop = lazy(() => import("./public/Shop").then((m) => ({ default: m.Shop })));
const ProductPage = lazy(() => import("./public/Shop").then((m) => ({ default: m.ProductPage })));
const Cart = lazy(() => import("./public/Cart"));
const Account = lazy(() => import("./public/Account").then((m) => ({ default: m.Account })));
const OrderTracking = lazy(() => import("./public/Account").then((m) => ({ default: m.OrderTracking })));

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Sales = lazy(() => import("./pages/Sales"));
const Pos = lazy(() => import("./pages/Pos"));
const CashSessions = lazy(() => import("./pages/CashSessions"));
const CashSessionDetail = lazy(() => import("./pages/CashSessionDetail"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Customers = lazy(() => import("./pages/Customers"));
const Stocks = lazy(() => import("./pages/Stocks"));
const Transfers = lazy(() => import("./pages/Transfers"));
const Inventories = lazy(() => import("./pages/Inventories"));
const InventoryDetail = lazy(() => import("./pages/InventoryDetail"));
const Deliveries = lazy(() => import("./pages/Deliveries"));
const Products = lazy(() => import("./pages/Products"));
const Treasury = lazy(() => import("./pages/Treasury"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Dues = lazy(() => import("./pages/Dues"));
const Agencies = lazy(() => import("./pages/Agencies"));
const AgencyDetail = lazy(() => import("./pages/AgencyDetail"));
const Users = lazy(() => import("./pages/Users"));
const Audit = lazy(() => import("./pages/Audit"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const CatalogSettings = lazy(() => import("./pages/CatalogSettings"));
const SitePublic = lazy(() => import("./pages/SitePublic"));

/** Espace de gestion : réservé au personnel. */
function Guard({ children }) {
  const { isAuthenticated, loading, isStaff } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ padding: 40 }}><Skeleton h={40} w={240} /></div>;
  if (!isAuthenticated) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  if (!isStaff) return <Navigate to="/mon-compte" replace />;
  return children;
}

/** Espace client : réservé aux comptes clients. */
function CustomerGuard({ children }) {
  const { isAuthenticated, loading, isStaff } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  if (isStaff) return <Navigate to="/tableau-de-bord" replace />;
  return children;
}

function Lazy({ children }) {
  return <Suspense fallback={<div className="pub-page"><Loading /></div>}>{children}</Suspense>;
}

function Home() {
  const { can } = useAuth();
  if (can("dashboard.view")) return <Dashboard />;
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.to !== "/tableau-de-bord" && can(...item.perm)) return <Navigate to={item.to} replace />;
    }
  }
  return (
    <div className="empty">
      <h3>Aucun module accessible</h3>
      <p className="small">Votre rôle ne donne accès à aucun écran web. Utilisez l'application mobile Gocelsys Entreprise.</p>
    </div>
  );
}

function Loading() {
  return (
    <div className="stack">
      <Skeleton h={34} w={280} />
      <Skeleton h={420} style={{ borderRadius: 16 }} />
    </div>
  );
}

export default function App() {
  const { isAuthenticated, isStaff } = useAuth();
  const home = isStaff ? "/tableau-de-bord" : "/mon-compte";
  return (
    <Routes>
      <Route path="/connexion" element={isAuthenticated ? <Navigate to={home} replace /> : <Login />} />
      <Route path="/inscription" element={isAuthenticated ? <Navigate to={home} replace /> : <Register />} />
      <Route element={<PublicShell />}>
        <Route path="/" element={<Lazy><Landing /></Lazy>} />
        <Route path="/boutique" element={<Lazy><PublicShop /></Lazy>} />
        <Route path="/boutique/:id" element={<Lazy><ProductPage /></Lazy>} />
        <Route path="/panier" element={<Lazy><Cart /></Lazy>} />
        <Route path="/mon-compte" element={<CustomerGuard><Lazy><Account /></Lazy></CustomerGuard>} />
        <Route path="/mon-compte/commandes/:id" element={<CustomerGuard><Lazy><OrderTracking /></Lazy></CustomerGuard>} />
      </Route>
      <Route element={<Guard><AppShell /></Guard>}>
        {[
          ["/tableau-de-bord", <Home key="h" />],
          ["/caisse", <Pos key="pos" />],
          ["/ventes", <Sales key="s" />],
          ["/caisses", <CashSessions key="cs" />],
          ["/caisses/:id", <CashSessionDetail key="csd" />],
          ["/commandes", <Orders key="o" />],
          ["/commandes/:id", <OrderDetail key="od" />],
          ["/clients", <Customers key="c" />],
          ["/stocks", <Stocks key="st" />],
          ["/transferts", <Transfers key="t" />],
          ["/transferts/:id", <Transfers key="td" />],
          ["/inventaires", <Inventories key="i" />],
          ["/inventaires/:id", <InventoryDetail key="id" />],
          ["/livraisons", <Deliveries key="d" />],
          ["/produits", <Products key="p" />],
          ["/finances", <Treasury key="f" />],
          ["/finances/depenses", <Expenses key="e" />],
          ["/finances/echeances", <Dues key="du" />],
          ["/agences", <Agencies key="a" />],
          ["/agences/:id", <AgencyDetail key="ad" />],
          ["/utilisateurs", <Users key="u" />],
          ["/journal", <Audit key="j" />],
          ["/rapports", <Reports key="r" />],
          ["/parametres", <Settings key="pa" />],
          ["/catalogue", <CatalogSettings key="cat" />],
          ["/site-public", <SitePublic key="site" />],
        ].map(([path, el]) => (
          <Route key={path} path={path} element={<Suspense fallback={<Loading />}>{el}</Suspense>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
