import { LayoutDashboard, LogOut, Menu, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { Logo } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useShop } from "./boutique-store";
import "./public.css";

export default function PublicShell() {
  const { user, isAuthenticated, logout } = useAuth();
  const shop = useShop();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const onHome = location.pathname === "/";

  useEffect(() => setOpen(false), [location.pathname, location.hash]);
  useEffect(() => {
    // sur l'accueil, l'en-tête reste transparent tant que la vitrine 3D occupe l'écran
    const fn = () => {
      const show = document.querySelector(".showcase");
      const limit = show ? show.offsetHeight - 80 : 24;
      setScrolled(window.scrollY > limit);
    };
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, [location.pathname]);
  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 60);
    } else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  const staff = isAuthenticated && user?.kind === "staff";
  const customer = isAuthenticated && user?.kind === "customer";

  return (
    <div className={`pub ${onHome ? "pub-home" : ""}`}>
      <header className={`pub-header ${scrolled || !onHome ? "solid" : ""} ${open ? "open" : ""}`}>
        <Link to="/" className="pub-brand" aria-label="Gocelsys, accueil">
          <Logo size={34} />
          <span>gocelsys</span>
        </Link>
        <nav className="pub-nav" aria-label="Navigation du site">
          <NavLink to="/boutique">Produits</NavLink>
          <Link to="/#commander">Comment commander</Link>
          <Link to="/#agences">Agences</Link>
          <Link to="/#pros">Professionnels</Link>
        </nav>
        <div className="pub-actions">
          {staff && (
            <Link to="/tableau-de-bord" className="pub-btn ghost"><LayoutDashboard size={17} /> Espace de gestion</Link>
          )}
          {customer && (
            <Link to="/mon-compte" className="pub-btn ghost"><UserRound size={17} /> <span className="pub-cart-label">Mon compte</span></Link>
          )}
          {!isAuthenticated && <Link to="/connexion" className="pub-btn ghost">Se connecter</Link>}
          <Link to="/panier" className="pub-btn cart" aria-label={`Panier, ${shop.count} article(s)`}>
            <ShoppingBag size={18} />
            <span className="pub-cart-label">Panier</span>
            {shop.count > 0 && <b>{shop.count}</b>}
          </Link>
          <button className="pub-burger" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {open && (
        <div className="pub-mobile-nav">
          <Link to="/boutique">Produits</Link>
          <Link to="/#commander">Comment commander</Link>
          <Link to="/#agences">Agences</Link>
          <Link to="/#pros">Professionnels</Link>
          {staff && <Link to="/tableau-de-bord">Espace de gestion</Link>}
          {customer && <Link to="/mon-compte">Mon compte</Link>}
          {!isAuthenticated ? <Link to="/connexion">Se connecter</Link> : (
            <button onClick={async () => { await logout(); navigate("/"); }}><LogOut size={16} /> Se déconnecter</button>
          )}
        </div>
      )}

      <main className="pub-main">
        <Outlet />
      </main>

      <footer className="pub-footer">
        <div className="pub-footer-top">
          <div className="pub-footer-brand">
            <Link to="/" className="pub-brand"><Logo size={36} dark /><span>gocelsys</span></Link>
            <p>Eau, papier, boissons et produits de la maison, distribués par nos agences du Kongo Central et de Kinshasa.</p>
          </div>
          <div>
            <h4>Acheter</h4>
            <Link to="/boutique">Tous les produits</Link>
            <Link to="/panier">Mon panier</Link>
            <Link to={customer ? "/mon-compte" : "/connexion"}>Suivre une commande</Link>
          </div>
          <div>
            <h4>Gocelsys</h4>
            <Link to="/#agences">Nos agences</Link>
            <Link to="/#pros">Offre professionnels</Link>
            <Link to="/connexion">Espace du personnel</Link>
          </div>
          <div>
            <h4>Nous joindre</h4>
            <a href="tel:+243810000010">+243 81 000 0010</a>
            <a href="mailto:contact@gocelsys.cd">contact@gocelsys.cd</a>
            <span>Lun–sam 7 h–19 h, dim 8 h–13 h</span>
          </div>
        </div>
        <div className="pub-footer-bottom">
          <span>© {new Date().getFullYear()} Gocelsys</span>
          <span>Prix en francs congolais, TVA comprise.</span>
        </div>
      </footer>
    </div>
  );
}
