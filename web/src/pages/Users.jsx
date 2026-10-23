import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { del, get, patch, post } from "../api/client";
import { Avatar, Drawer, Empty, Field, LoadingRows, PageHead, Pager, Pill, Tabs } from "../components/ui";
import { useDebounced, useList } from "../hooks/useList";
import { useAgencies, useRoles } from "../hooks/useRef";
import { useAuth } from "../lib/auth";
import { ago } from "../lib/format";
import { useToast } from "../lib/toast";

function UserDrawer({ user, onClose }) {
  const roles = useRoles();
  const agencies = useAgencies();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(null);
  const { data: posData } = useQuery({ queryKey: ["pos-all"], queryFn: () => get("/pos/"), enabled: Boolean(user) });
  const posList = posData || [];
  useEffect(() => {
    if (user) setF({
      ...user, password: "", pin_code: "",
      roles: (user.assignments || []).map((a) => ({ role: a.role, agency: a.agency || "" })),
    });
  }, [user]);
  if (!user || !f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const cashierRole = roles.find((r) => r.code === "cashier");
  const isCashier = f.roles.some((r) => cashierRole && String(r.role) === String(cashierRole.id));
  const roleAgencies = [...new Set(f.roles.filter((r) => r.agency).map((r) => Number(r.agency)))];
  const setRole = (i, patch_) => setF({ ...f, roles: f.roles.map((r, j) => (j === i ? { ...r, ...patch_ } : r)) });
  const save = async () => {
    try {
      const body = { ...f, assigned_pos: f.assigned_pos ? Number(f.assigned_pos) : null,
        roles: f.roles.filter((r) => r.role).map((r) => ({ role: Number(r.role), agency: r.agency ? Number(r.agency) : null })) };
      if (!body.password) delete body.password;
      if (!body.pin_code) delete body.pin_code;
      delete body.assignments;
      if (f.id) await patch(`/auth/users/${f.id}/`, body);
      else await post("/auth/users/", body);
      toast.success(f.id ? "Utilisateur mis à jour." : "Utilisateur créé.");
      qc.invalidateQueries({ queryKey: ["/auth/users/"] });
      qc.invalidateQueries({ queryKey: ["pos-all"] });
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  const suspend = async () => {
    await del(`/auth/users/${f.id}/`);
    toast.success("Compte suspendu.");
    qc.invalidateQueries({ queryKey: ["/auth/users/"] });
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={f.id ? f.full_name : "Nouvel utilisateur"} sub={f.id ? `Dernière connexion ${f.last_login ? ago(f.last_login) : "jamais"}` : "Personnel Gocelsys"}
      footer={<>{f.id && f.is_active && <button className="btn btn-danger" onClick={suspend}>Suspendre</button>}<span className="grow" /><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-action" onClick={save}>Enregistrer</button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Prénom"><input className="input" value={f.first_name} onChange={set("first_name")} /></Field>
          <Field label="Nom"><input className="input" value={f.last_name} onChange={set("last_name")} /></Field>
          <Field label="Identifiant de connexion"><input className="input" value={f.username} onChange={set("username")} placeholder="caisse.boma" /></Field>
          <Field label="Téléphone"><input className="input" value={f.phone} onChange={set("phone")} placeholder="0810000000" /></Field>
          <Field label="E-mail" className="span-2"><input className="input" type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label={f.id ? "Nouveau mot de passe" : "Mot de passe initial"} hint={f.id ? "Laisser vide pour ne pas changer" : "6 caractères minimum"}>
            <input className="input" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
          </Field>
          <Field label="Code PIN caisse" hint="4 à 6 chiffres, pour déverrouiller le POS"><input className="input num" inputMode="numeric" maxLength={6} value={f.pin_code} onChange={set("pin_code")} /></Field>
          <Field label="Agence par défaut">
            <select className="select" value={f.default_agency || ""} onChange={set("default_agency")}>
              <option value="">—</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /> Compte actif</label>
        <div className="divider" />
        <div className="row-between">
          <div>
            <h3 style={{ fontSize: "var(--fs-md)" }}>Rôles</h3>
            <p className="xs faint">Un rôle d'agence ne donne accès qu'à l'agence choisie.</p>
          </div>
          <button className="btn btn-sm" onClick={() => setF({ ...f, roles: [...f.roles, { role: "", agency: "" }] })}><Plus /> Ajouter un rôle</button>
        </div>
        {f.roles.map((r, i) => {
          const role = roles.find((x) => String(x.id) === String(r.role));
          return (
            <div key={i} className="line-row" style={{ gridTemplateColumns: "1fr 1fr 30px" }}>
              <select className="select" value={r.role} onChange={(e) => setRole(i, { role: e.target.value })} aria-label="Rôle">
                <option value="">Rôle…</option>
                {roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              {role?.scope === "global" ? <span className="small muted" style={{ alignSelf: "center" }}>Toutes les agences</span> : (
                <select className="select" value={r.agency} onChange={(e) => setRole(i, { agency: e.target.value })} aria-label="Agence">
                  <option value="">Agence…</option>
                  {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setF({ ...f, roles: f.roles.filter((_, j) => j !== i) })} aria-label="Retirer"><Trash2 /></button>
            </div>
          );
        })}
        {roleAgencies.length > 0 && (
          <>
            <div className="divider" />
            <Field label="Caisse affectée" hint={isCashier ? "Obligatoire pour un caissier : il ouvrira directement cette caisse, sans choisir." : "Facultatif : utile si la personne tient aussi une caisse."}>
              <select className="select" value={f.assigned_pos || ""} onChange={(e) => setF({ ...f, assigned_pos: e.target.value || null })}>
                <option value="">Aucune caisse</option>
                {posList.filter((p) => roleAgencies.includes(p.agency)).map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.is_active}>
                    {p.agency_name} · {p.name}{p.cashiers.length && !p.cashiers.some((c) => c.id === f.id) ? ` (déjà : ${p.cashiers.map((c) => c.name).join(", ")})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            {isCashier && !f.assigned_pos && <div className="callout warn">Sans caisse affectée, ce caissier ne pourra pas ouvrir de session.</div>}
          </>
        )}
      </div>
    </Drawer>
  );
}

function UsersTab() {
  const { can } = useAuth();
  const roles = useRoles();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [open, setOpen] = useState(null);
  const q = useDebounced(search);
  const list = useList("/auth/users/", { search: q, role });
  return (
    <>
      <section className="panel">
        <div className="toolbar">
          <div className="input-group"><Search /><input className="input" placeholder="Nom, identifiant, téléphone" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Tous les rôles</option>
            {roles.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
          </select>
          <span className="grow" />
          {can("users.manage") && <button className="btn btn-action" onClick={() => setOpen({ first_name: "", last_name: "", username: "", phone: "", email: "", is_active: true, assignments: [] })}><Plus /> Nouvel utilisateur</button>}
        </div>
        {list.isLoading ? <LoadingRows /> : list.rows.length === 0 ? <Empty title="Aucun utilisateur" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Utilisateur</th><th>Rôles</th><th>Contact</th><th>Dernière connexion</th><th>État</th></tr></thead>
              <tbody>
                {list.rows.map((u) => (
                  <tr key={u.id} className="clickable" onClick={() => can("users.manage") && setOpen(u)}>
                    <td><div className="row"><Avatar name={u.full_name} /><div><div className="cell-main">{u.full_name}</div><div className="cell-sub">{u.username}</div></div></div></td>
                    <td><div className="row wrap" style={{ gap: 6 }}>{u.assignments.map((a) => <Pill key={a.id} tone={a.agency ? "brand" : "night"} plain>{a.role_name}{a.agency_name ? ` · ${a.agency_name}` : ""}</Pill>)}</div>
                      {u.assigned_pos_name && <div className="cell-sub">Caisse : {u.assigned_pos_name}</div>}</td>
                    <td className="small">{u.phone}<div className="cell-sub">{u.email}</div></td>
                    <td className="small">{u.last_login ? ago(u.last_login) : "Jamais"}</td>
                    <td>{u.is_active ? <Pill tone="leaf" plain>Actif</Pill> : <Pill tone="clay" plain>Suspendu</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} count={list.count} onPage={list.setPage} />
      </section>
      <UserDrawer user={open} onClose={() => setOpen(null)} />
    </>
  );
}

function RolesTab() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const roles = useRoles();
  const { data: catalog } = useQuery({ queryKey: ["perm-catalog"], queryFn: () => get("/auth/roles/catalog/") });
  const [selected, setSelected] = useState(null);
  const [perms, setPerms] = useState([]);
  const role = roles.find((r) => r.id === selected) || roles[0];
  useEffect(() => {
    if (role) {
      setSelected(role.id);
      setPerms(role.permissions);
    }
  }, [role?.id, roles.length]); // eslint-disable-line
  const editable = can("roles.manage") && role && role.code !== "admin";
  const toggle = (code) => setPerms((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));
  const save = async () => {
    try {
      await patch(`/auth/roles/${role.id}/`, { permissions: perms });
      toast.success(`Permissions du rôle « ${role.name} » enregistrées.`);
      qc.invalidateQueries({ queryKey: ["ref", "roles"] });
    } catch (e) {
      toast.error(e);
    }
  };
  if (!role || !catalog) return <LoadingRows />;
  return (
    <div className="roles-layout">
      <nav className="panel roles-list">
        {roles.map((r) => (
          <button key={r.id} className={r.id === role.id ? "active" : ""} onClick={() => { setSelected(r.id); setPerms(r.permissions); }}>
            <span className="strong small">{r.name}</span>
            <span className="xs faint">{r.scope === "global" ? "Toutes agences" : "Par agence"} · {r.users_count} pers. · {r.permissions.length} droits</span>
          </button>
        ))}
      </nav>
      <section className="panel">
        <div className="panel-head">
          <div><h3>{role.name}</h3><div className="sub">{role.code === "admin" ? "L'administrateur dispose de tous les droits." : "Cochez les actions autorisées pour ce rôle."}</div></div>
          {editable && <button className="btn btn-action" onClick={save}><ShieldCheck /> Enregistrer</button>}
        </div>
        <div className="perm-grid">
          {catalog.groups.map((g) => (
            <fieldset key={g.module} className="perm-group">
              <legend>{g.label}</legend>
              {g.permissions.map((p) => (
                <label key={p.code} className="check">
                  <input type="checkbox" checked={perms.includes(p.code)} disabled={!editable} onChange={() => toggle(p.code)} />
                  {p.label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function Users() {
  const [tab, setTab] = useState("users");
  return (
    <>
      <PageHead title="Utilisateurs et rôles" lead="Chaque personne n'accède qu'aux fonctions autorisées par son rôle, et seulement pour ses agences." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "users", label: "Utilisateurs" }, { value: "roles", label: "Rôles et permissions" }]} />
      {tab === "users" ? <UsersTab /> : <RolesTab />}
    </>
  );
}
