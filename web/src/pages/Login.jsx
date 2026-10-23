import { ArrowLeft, Eye, EyeOff, Lock, Phone, User } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { errorMessage } from "../api/client";
import { Logo } from "../components/ui";
import ProductArt from "../public/ProductArt";
import { useAuth } from "../lib/auth";
import "./login.css";

const DEMO = [
  ["admin", "Administrateur"],
  ["direction", "Direction"],
  ["resp.matadi", "Resp. Matadi"],
  ["caisse.matadi", "Caissier"],
  ["0820000101", "Client"],
];

const FLOAT = [
  ["bottle", "#22C3E6", "8%", "18%", 1.1],
  ["box", "#A99DFF", "58%", "10%", 0.9],
  ["can", "#F25A3C", "70%", "52%", 1],
  ["roll", "#C9C2FF", "14%", "58%", 0.85],
  ["jar", "#16B36A", "40%", "36%", 0.75],
];

function Art() {
  return (
    <section className="login-art" aria-hidden="true">
      <Link to="/" className="login-brand"><Logo size={40} dark /><span>gocelsys</span></Link>
      <div className="login-float">
        {FLOAT.map(([v, c, x, y, s], i) => (
          <span key={v} style={{ left: x, top: y, "--s": s, "--d": `${i * 0.7}s` }}>
            <ProductArt visual={v} accent={c} size={110} bg={false} />
          </span>
        ))}
      </div>
      <div className="login-copy">
        <h1>Une seule connexion, que vous achetiez ou que vous vendiez.</h1>
        <p>Clients : vos commandes et votre suivi de livraison. Personnel : caisse, stock, commandes et pilotage des agences.</p>
      </div>
    </section>
  );
}

function redirectFor(user, from) {
  if (from && from !== "/connexion" && from !== "/inscription") {
    const staffArea = !["/", "/boutique", "/panier", "/mon-compte"].some((p) => from === p || from.startsWith(`${p}/`));
    if (user.kind === "staff" || !staffArea) return from;
  }
  return user.kind === "staff" ? "/tableau-de-bord" : "/mon-compte";
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!identifier || !password) return setError("Saisissez votre identifiant ou téléphone et votre mot de passe.");
    setBusy(true);
    try {
      const user = await login(identifier.trim(), password);
      navigate(redirectFor(user, location.state?.from), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <Art />
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit} noValidate>
          <Link to="/" className="login-back"><ArrowLeft size={16} /> Retour au site</Link>
          <div className="login-mobile-brand"><Logo size={36} /><strong>gocelsys</strong></div>
          <h2>Connexion</h2>
          <p className="muted">Avec votre numéro de téléphone (clients) ou votre identifiant (personnel).</p>
          <label className="field">
            <span className="field-label">Téléphone ou identifiant</span>
            <span className="input-group">
              <User />
              <input className="input" autoComplete="username" autoFocus value={identifier} placeholder="082 000 0000 ou caisse.matadi"
                onChange={(e) => setIdentifier(e.target.value)} />
            </span>
          </label>
          <label className="field">
            <span className="field-label">Mot de passe</span>
            <span className="input-group">
              <Lock />
              <input className="input" type={show ? "text" : "password"} autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 42 }} />
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setShow((s) => !s)}
                aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} style={{ position: "absolute", right: 5, top: 5 }}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </span>
          </label>
          {error && <div className="callout danger" role="alert">{error}</div>}
          <button className="btn btn-action login-submit" disabled={busy}>{busy ? <span className="spinner" /> : "Se connecter"}</button>
          <p className="small muted login-switch">Pas encore client ? <Link to="/inscription" state={location.state}>Créer un compte</Link></p>
          {import.meta.env.DEV && (
            <div className="login-demo">
              <span className="xs faint">Comptes de démonstration (mot de passe gocelsys2026)</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {DEMO.map(([u, label]) => (
                  <button type="button" key={u} className="btn btn-sm" onClick={() => { setIdentifier(u); setPassword("gocelsys2026"); }}>{label}</button>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [f, setF] = useState({ name: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!f.name.trim() || !f.phone.trim() || f.password.length < 6) return setError("Nom, téléphone et mot de passe (6 caractères minimum) sont requis.");
    setBusy(true);
    try {
      const user = await register({ name: f.name.trim(), phone: f.phone.trim(), password: f.password });
      navigate(redirectFor(user, location.state?.from), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <Art />
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit} noValidate>
          <Link to="/" className="login-back"><ArrowLeft size={16} /> Retour au site</Link>
          <div className="login-mobile-brand"><Logo size={36} /><strong>gocelsys</strong></div>
          <h2>Créer un compte client</h2>
          <p className="muted">Pour commander en ligne, suivre vos livraisons et cumuler des points fidélité.</p>
          <label className="field">
            <span className="field-label">Nom complet ou nom de l'entreprise</span>
            <span className="input-group"><User /><input className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Arlette Tamba" /></span>
          </label>
          <label className="field">
            <span className="field-label">Numéro de téléphone</span>
            <span className="input-group"><Phone /><input className="input" autoComplete="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="082 000 0000" /></span>
          </label>
          <label className="field">
            <span className="field-label">Mot de passe</span>
            <span className="input-group"><Lock /><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="6 caractères minimum" /></span>
          </label>
          {error && <div className="callout danger" role="alert">{error}</div>}
          <button className="btn btn-action login-submit" disabled={busy}>{busy ? <span className="spinner" /> : "Créer mon compte"}</button>
          <p className="small muted login-switch">Déjà client ? <Link to="/connexion" state={location.state}>Se connecter</Link></p>
          <div className="callout"><span>−10 % sur votre première commande avec le code <strong>BIENVENUE</strong>.</span></div>
        </form>
      </section>
    </div>
  );
}
