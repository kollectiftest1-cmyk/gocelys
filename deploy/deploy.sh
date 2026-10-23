#!/usr/bin/env bash
# =============================================================================
#  Gocelsys — déploiement et mise à jour sur VPS (backend Django + site web React)
#
#  1er lancement  : installation complète (paquets manquants, base, services, Nginx, HTTPS).
#  Lancements suivants : mise à jour (nouvelle version, migrations, rechargement sans casser).
#
#  Conçu pour un serveur qui héberge DÉJÀ d'autres applications :
#   - n'installe que les paquets manquants, ne fait jamais « apt upgrade » ;
#   - n'édite aucun autre site Nginx : un seul fichier, testé avant rechargement, restauré si erreur ;
#   - Nginx est rechargé (reload), jamais redémarré ; aucune autre application n'est coupée ;
#   - Python 3.13 et Node sont privés à Gocelsys (/srv/gocelsys/tools) : les versions du système
#     et celles des autres applications ne changent pas ;
#   - API sur une socket Unix (aucun port réseau à réserver), upstream et zones Nginx préfixés « gocelsys_ » ;
#   - PostgreSQL : un rôle et une base dédiés, rien d'autre n'est modifié ;
#   - le pare-feu n'est jamais activé ; s'il l'est déjà, seuls 80/443 sont ouverts.
#
#  Usage :   sudo bash deploy.sh [options]          (1re fois, depuis une copie du script)
#            sudo gocelsys-deploy [options]          (ensuite, installé par le 1er lancement)
#
#  Options : --repo URL       dépôt Git (sinon celui enregistré dans /etc/gocelsys/deploy.conf)
#            --branch NOM     branche à déployer (défaut : deploy)
#            --email ADRESSE  e-mail Let's Encrypt (défaut : admin@DOMAINE)
#            --demo           1re installation : charger les données de démonstration
#            --force          reconstruire même si la version n'a pas changé
#            --no-ssl         ne pas demander de certificat HTTPS
#            --status         afficher l'état et quitter
#            --rollback       revenir à la version précédente (code et site ; la base n'est pas restaurée)
#            -h, --help
# =============================================================================
set -Eeuo pipefail
umask 022

# ----------------------------------------------------------------------------- réglages
APP="gocelsys"
DOMAIN="${DOMAIN:-gocelsys.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.${DOMAIN}}"
SERVER_IP="${SERVER_IP:-72.60.212.142}"
APP_DIR="${APP_DIR:-/srv/gocelsys}"
ETC_DIR="/etc/gocelsys"
CONF_FILE="${ETC_DIR}/deploy.conf"
ENV_FILE="${ETC_DIR}/gocelsys.env"
LOG_DIR="/var/log/gocelsys"
RUN_DIR="/run/gocelsys"
SOCKET="${RUN_DIR}/gunicorn.sock"
ACME_ROOT="/var/www/gocelsys-acme"
PY_VERSION="${PY_VERSION:-3.13}"
NODE_MAJOR="${NODE_MAJOR:-22}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-deploy}"
LE_EMAIL="${LE_EMAIL:-}"
WORKERS="${WORKERS:-}"
DB_NAME="${DB_NAME:-gocelsys}"
DB_USER="${DB_USER:-gocelsys}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

OPT_DEMO=0 OPT_FORCE=0 OPT_NOSSL=0 OPT_STATUS=0 OPT_ROLLBACK=0

# ----------------------------------------------------------------------------- affichage
if [[ -t 1 ]]; then C_B=$'\e[1m' C_G=$'\e[32m' C_Y=$'\e[33m' C_R=$'\e[31m' C_C=$'\e[36m' C_0=$'\e[0m'; else C_B="" C_G="" C_Y="" C_R="" C_C="" C_0=""; fi
STEP="démarrage"
step() { STEP="$*"; printf '\n%s==> %s%s\n' "$C_B$C_C" "$*" "$C_0"; }
ok()   { printf '  %s✔%s %s\n' "$C_G" "$C_0" "$*"; }
info() { printf '  · %s\n' "$*"; }
warn() { printf '  %s!%s %s\n' "$C_Y" "$C_0" "$*"; }
die()  { printf '\n%s✘ %s%s\n' "$C_R$C_B" "$*" "$C_0" >&2; exit 1; }
trap 'rc=$?; printf "\n%s✘ Échec pendant : %s (ligne %s, code %s)%s\n" "$C_R$C_B" "$STEP" "$LINENO" "$rc" "$C_0" >&2; printf "  Journal complet : %s\n" "${LOG_FILE:-}" >&2' ERR

usage() { sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_URL="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --email) LE_EMAIL="$2"; shift 2 ;;
    --demo) OPT_DEMO=1; shift ;;
    --force) OPT_FORCE=1; shift ;;
    --no-ssl) OPT_NOSSL=1; shift ;;
    --status) OPT_STATUS=1; shift ;;
    --rollback) OPT_ROLLBACK=1; shift ;;
    -h|--help) usage ;;
    *) die "Option inconnue : $1 (voir --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Lancez ce script en root : sudo bash $0"

# Réglages enregistrés lors du premier déploiement (les options de la ligne de commande priment)
if [[ -f "$CONF_FILE" ]]; then
  _repo="$REPO_URL" _branch="$BRANCH" _email="$LE_EMAIL"
  # shellcheck disable=SC1090
  source "$CONF_FILE"
  [[ -n "$_repo" ]] && REPO_URL="$_repo"
  [[ "$_branch" != "deploy" ]] && BRANCH="$_branch"
  [[ -n "$_email" ]] && LE_EMAIL="$_email"
fi
LE_EMAIL="${LE_EMAIL:-admin@${DOMAIN}}"

mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/deploy-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1
{ ls -1t "$LOG_DIR"/deploy-*.log 2>/dev/null || true; } | tail -n +21 | xargs -r rm -f

# Un seul déploiement à la fois
exec 9>/var/lock/gocelsys-deploy.lock
flock -n 9 || die "Un autre déploiement Gocelsys est déjà en cours."

FIRST_INSTALL=1
[[ -L "${APP_DIR}/current" ]] && FIRST_INSTALL=0

as_app() { runuser -u "$APP" -- env -C "$APP_DIR" HOME="$APP_DIR" UV_NO_CONFIG=1 PATH="${APP_DIR}/tools/node/bin:${APP_DIR}/tools/uv:/usr/local/bin:/usr/bin:/bin" \
  UV_CACHE_DIR="${APP_DIR}/.cache/uv" UV_PYTHON_INSTALL_DIR="${APP_DIR}/tools/python" npm_config_cache="${APP_DIR}/.cache/npm" \
  GIT_SSH_COMMAND="ssh -i ${APP_DIR}/.ssh/id_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" "$@"; }
# manage.py avec les variables de production
manage() { local dir="$1"; shift; as_app bash -c "set -a; . '$ENV_FILE'; set +a; cd '$dir/backend' && exec '${APP_DIR}/venv/bin/python' manage.py \"\$@\"" _ "$@"; }

# ----------------------------------------------------------------------------- état / retour arrière
release_sha() { cat "$1/.sha" 2>/dev/null || echo "?"; }

show_status() {
  step "État de Gocelsys"
  if [[ -L "${APP_DIR}/current" ]]; then
    local cur; cur="$(readlink -f "${APP_DIR}/current")"
    info "Version en ligne : $(basename "$cur") (commit $(release_sha "$cur"))"
  else info "Pas encore installé."; fi
  info "API : $(systemctl is-active gocelsys-api 2>/dev/null || true)   ·   alertes : $(systemctl is-active gocelsys-alerts.timer 2>/dev/null || true)   ·   Nginx : $(systemctl is-active nginx 2>/dev/null || true)"
  if [[ -S "$SOCKET" ]]; then
    info "Santé : $(curl -s --max-time 5 --unix-socket "$SOCKET" -H "Host: ${DOMAIN}" http://localhost/api/health/ || echo 'injoignable')"
  fi
  [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]] && info "Certificat HTTPS : $(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" | cut -d= -f2)"
  info "Versions disponibles (✔ = validée, retour arrière possible) :"
  for r in $(ls -1d "${APP_DIR}"/releases/*/ 2>/dev/null | sort -r || true); do
    r="${r%/}"; printf '      %s %s%s\n' "$([[ -f "$r/.ok" ]] && echo ✔ || echo ·)" "$(basename "$r")" "$([[ "$r" == "$(readlink -f "${APP_DIR}/current")" ]] && echo '   ← en ligne')"
  done
  info "Sauvegardes : $(ls -1 "${APP_DIR}/backups" 2>/dev/null | wc -l) dans ${APP_DIR}/backups"
}

wait_healthy() {
  local i
  for _ in $(seq 1 40); do
    # en ligne ET branché sur PostgreSQL ET hors mode debug (sinon la configuration n'a pas été lue)
    if curl -fsS --max-time 3 --unix-socket "$SOCKET" -H "Host: ${DOMAIN}" -H "X-Forwarded-Proto: https" http://localhost/api/health/ 2>/dev/null \
       | grep -q '"engine": "postgresql", "debug": false'; then return 0; fi
    sleep 1
  done
  return 1
}

if [[ $OPT_STATUS -eq 1 ]]; then show_status; exit 0; fi

if [[ $OPT_ROLLBACK -eq 1 ]]; then
  step "Retour à la version précédente"
  [[ -L "${APP_DIR}/current" ]] || die "Aucune installation."
  cur="$(readlink -f "${APP_DIR}/current")"
  # seulement une version qui a déjà fonctionné en ligne (marquée .ok)
  prev=""
  while read -r r; do
    r="${r%/}"; [[ "$r" == "$cur" ]] && continue
    [[ -f "$r/.ok" ]] && { prev="$r"; break; }
  done < <(ls -1d "${APP_DIR}"/releases/*/ 2>/dev/null | sort -r || true)
  [[ -n "$prev" ]] || die "Aucune version précédente validée n'est disponible."
  info "De $(basename "$cur") vers $(basename "$prev")"
  ln -sfn "$prev" "${APP_DIR}/current.tmp" && mv -Tf "${APP_DIR}/current.tmp" "${APP_DIR}/current"
  systemctl restart gocelsys-api
  if wait_healthy; then
    ok "Revenu à $(basename "$prev") (commit $(release_sha "$prev" | cut -c1-7))."
  else
    ln -sfn "$cur" "${APP_DIR}/current.tmp" && mv -Tf "${APP_DIR}/current.tmp" "${APP_DIR}/current"
    systemctl restart gocelsys-api; wait_healthy || true
    die "La version $(basename "$prev") ne démarre pas : retour à $(basename "$cur"). Journal : journalctl -u gocelsys-api -n 80"
  fi
  warn "La base de données n'a pas été restaurée. Si une migration a changé sa structure, restaurez la sauvegarde :"
  warn "  ls ${APP_DIR}/backups   puis   pg_restore --clean -d ${DB_NAME} <fichier>"
  exit 0
fi

# ============================================================================= 1. vérifications
step "Vérifications du serveur"
# shellcheck disable=SC1091
. /etc/os-release
[[ "${ID:-}" == "ubuntu" || "${ID:-}" == "debian" || "${ID_LIKE:-}" == *debian* ]] || die "Système non pris en charge (${PRETTY_NAME:-?}) : Ubuntu ou Debian requis."
ok "${PRETTY_NAME}"
ARCH="$(uname -m)"
case "$ARCH" in x86_64) NODE_ARCH="x64" ;; aarch64|arm64) NODE_ARCH="arm64" ;; *) die "Architecture non prise en charge : $ARCH" ;; esac

free_gb=$(df -BG --output=avail /srv 2>/dev/null | tail -1 | tr -dc '0-9'); free_gb=${free_gb:-0}
(( free_gb >= 2 )) || die "Espace disque insuffisant sur /srv (${free_gb} Go libres, 2 Go minimum)."
ok "Disque : ${free_gb} Go libres"
mem_mb=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
info "Mémoire disponible : ${mem_mb} Mo"
NODE_HEAP=1536; (( mem_mb < 1500 )) && NODE_HEAP=768 && warn "Mémoire faible : la compilation du site sera plus lente."

if [[ -z "$WORKERS" ]]; then
  # serveur partagé : on reste raisonnable (2 à 4 processus)
  WORKERS=$(( $(nproc) + 1 )); (( WORKERS > 4 )) && WORKERS=4; (( WORKERS < 2 )) && WORKERS=2
fi

command -v ss >/dev/null 2>&1 || { DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iproute2 >/dev/null; }
# Qui sert déjà le port 80 ? On ne cohabite qu'avec Nginx.
port_owner() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'users:(("[^"]*"' | head -1 | cut -d'"' -f2 || true; }
P80="$(port_owner 80)"; P443="$(port_owner 443)"
for p in "$P80" "$P443"; do
  if [[ -n "$p" && "$p" != "nginx" ]]; then
    die "Le port 80/443 est occupé par « $p », pas par Nginx.
   Ce script ne modifie pas un autre serveur web pour ne pas casser les applications existantes.
   Ajoutez plutôt un proxy de ${DOMAIN} vers la socket ${SOCKET} dans « $p »."
  fi
done
ok "Ports web : ${P80:-libre}/${P443:-libre}"

# Un autre site Nginx déclare-t-il déjà ce domaine ?
if [[ -d /etc/nginx ]]; then
  clash="$(grep -rlE "server_name[^;]*[[:space:]](www\.)?${DOMAIN//./\\.}[[:space:];]" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | xargs -r readlink -f | grep -vE '/gocelsys\.conf(\.bak)?$' || true)"
  [[ -z "$clash" ]] || die "Le domaine ${DOMAIN} est déjà déclaré dans : ${clash}
   Retirez-le de ce fichier (ou supprimez ce site) puis relancez."
fi

if [[ "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]]; then
  P5432="$(port_owner 5432)"
  if [[ -n "$P5432" && "$P5432" != postgres* ]]; then
    die "Le port 5432 est utilisé par « $P5432 » (PostgreSQL en conteneur ?).
   Indiquez une base existante : DB_HOST=… DB_PORT=… DB_USER=… et créez le rôle/la base vous-même,
   ou libérez le port. Rien n'a été modifié."
  fi
fi

if [[ -z "$REPO_URL" ]]; then
  if [[ -t 0 ]]; then read -rp "  URL du dépôt Git (ex. git@github.com:compte/gocelsys.git) : " REPO_URL; fi
  [[ -n "$REPO_URL" ]] || die "Dépôt Git inconnu : relancez avec --repo URL."
fi
ok "Dépôt : ${REPO_URL} (branche ${BRANCH})"
[[ $FIRST_INSTALL -eq 1 ]] && info "Mode : PREMIÈRE INSTALLATION" || info "Mode : MISE À JOUR"

# ============================================================================= 2. paquets
step "Paquets système (seulement ceux qui manquent)"
need=()
for pkg in git curl ca-certificates openssl xz-utils nginx; do
  dpkg -s "$pkg" >/dev/null 2>&1 || need+=("$pkg")
done
command -v certbot >/dev/null 2>&1 || need+=(certbot)
if [[ "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]]; then
  # un PostgreSQL déjà installé (quelle que soit sa version) est réutilisé tel quel
  dpkg -l 'postgresql-[0-9]*' 2>/dev/null | grep -q '^ii' || need+=(postgresql postgresql-contrib)
fi
if (( ${#need[@]} )); then
  info "Installation : ${need[*]}"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends "${need[@]}" >/dev/null
  ok "Installé : ${need[*]}"
else
  ok "Rien à installer"
fi
systemctl is-active --quiet nginx || { systemctl enable --now nginx >/dev/null 2>&1 && ok "Nginx démarré"; }

NGX_USER="$(awk '$1=="user"{gsub(";","",$2); print $2; exit}' /etc/nginx/nginx.conf 2>/dev/null)"; NGX_USER="${NGX_USER:-www-data}"
NGX_GROUP="$(id -gn "$NGX_USER" 2>/dev/null || echo "$NGX_USER")"
NGX_VER="$(nginx -v 2>&1 | grep -o '[0-9.]*' | head -1)"
ok "Nginx ${NGX_VER} (utilisateur ${NGX_USER})"

# ============================================================================= 3. utilisateur et dossiers
step "Utilisateur système et dossiers"
if ! id "$APP" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin --user-group "$APP"
  ok "Utilisateur « $APP » créé"
fi
install -d -m 0755 -o "$APP" -g "$APP" "$APP_DIR" "$APP_DIR"/{releases,tools,.cache,backups}
install -d -m 0750 -o "$APP" -g "$APP" "$APP_DIR"/repo
install -d -m 0755 -o "$APP" -g "$NGX_GROUP" "$APP_DIR"/shared "$APP_DIR"/shared/static
install -d -m 2775 -o "$APP" -g "$NGX_GROUP" "$APP_DIR"/shared/media
install -d -m 0700 -o "$APP" -g "$APP" "$APP_DIR"/.ssh
install -d -m 0750 -o root -g "$APP" "$ETC_DIR"
install -d -m 0755 "$ACME_ROOT"
chmod 0711 "$APP_DIR"/backups && chown postgres:"$APP" "$APP_DIR"/backups 2>/dev/null || true
ok "${APP_DIR}"

# Réglages persistants (relus par les mises à jour)
cat > "$CONF_FILE" <<EOF
# Réglages du déploiement Gocelsys (modifiables ; relus à chaque lancement)
REPO_URL="${REPO_URL}"
BRANCH="${BRANCH}"
LE_EMAIL="${LE_EMAIL}"
DOMAIN="${DOMAIN}"
WORKERS="${WORKERS}"
EOF
chmod 0640 "$CONF_FILE"; chown root:"$APP" "$CONF_FILE"

# ============================================================================= 4. variables d'environnement
step "Configuration de l'application (${ENV_FILE})"
rand() { local s; s="$(openssl rand -hex 64)"; printf '%s' "${s:0:$1}"; }
set_env() { # ajoute la clé si elle manque ; --force la remplace
  local key="$1" val="$2" force="${3:-}"
  if grep -q "^${key}=" "$ENV_FILE"; then
    if [[ "$force" == "--force" ]]; then sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"; fi
  else echo "${key}=${val}" >> "$ENV_FILE"; fi
  return 0
}
if [[ ! -f "$ENV_FILE" ]]; then
  echo "# Généré par deploy.sh le $(date '+%F %T'). Les secrets sont conservés d'une mise à jour à l'autre." > "$ENV_FILE"
  ok "Fichier créé (secrets générés)"
fi
chmod 0640 "$ENV_FILE"; chown root:"$APP" "$ENV_FILE"
set_env GOCELSYS_DEBUG false
set_env GOCELSYS_SECRET_KEY "$(rand 64)"
set_env GOCELSYS_ALLOWED_HOSTS "${DOMAIN},${WWW_DOMAIN},localhost"
set_env GOCELSYS_CSRF_TRUSTED_ORIGINS "https://${DOMAIN},https://${WWW_DOMAIN}"
set_env GOCELSYS_CORS_ORIGINS "https://${DOMAIN}"
set_env GOCELSYS_DB_NAME "$DB_NAME"
set_env GOCELSYS_DB_USER "$DB_USER"
set_env GOCELSYS_DB_PASSWORD "$(rand 32)"
set_env GOCELSYS_DB_HOST "$DB_HOST"
set_env GOCELSYS_DB_PORT "$DB_PORT"
set_env GOCELSYS_STATIC_ROOT "${APP_DIR}/shared/static"
set_env GOCELSYS_MEDIA_ROOT "${APP_DIR}/shared/media"
set_env GOCELSYS_HTTPS false
DB_PASSWORD="$(grep '^GOCELSYS_DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
ok "Variables à jour"

# ============================================================================= 5. PostgreSQL
step "Base de données PostgreSQL"
if [[ "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]]; then
  systemctl is-active --quiet postgresql || systemctl enable --now postgresql >/dev/null 2>&1
  for _ in $(seq 1 20); do runuser -u postgres -- psql -qAtc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qAt >/dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE "${DB_USER}" LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE "${DB_USER}" WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END \$\$;
SQL
  if ! runuser -u postgres -- psql -qAtc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    runuser -u postgres -- createdb -O "$DB_USER" -E UTF8 -T template0 "$DB_NAME"
    ok "Base « ${DB_NAME} » créée"
  else
    ok "Base « ${DB_NAME} » présente"
  fi
  runuser -u postgres -- psql -qAt -d "$DB_NAME" -c "ALTER SCHEMA public OWNER TO \"${DB_USER}\";" >/dev/null 2>&1 || true
  PGVER="$(runuser -u postgres -- psql -qAtc 'show server_version' | cut -d' ' -f1)"
  ok "PostgreSQL ${PGVER} — rôle « ${DB_USER} »"
else
  info "Base externe ${DB_HOST}:${DB_PORT} : rôle et base supposés existants."
fi

# ============================================================================= 6. outils privés (Python, Node)
step "Python ${PY_VERSION} et Node ${NODE_MAJOR} privés à Gocelsys"
if [[ ! -x "${APP_DIR}/tools/uv/uv" ]]; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="${APP_DIR}/tools/uv" UV_NO_MODIFY_PATH=1 sh >/dev/null
  chown -R "$APP":"$APP" "${APP_DIR}/tools/uv"
fi
ok "uv $(as_app "${APP_DIR}/tools/uv/uv" --version | cut -d' ' -f2)"
if [[ ! -x "${APP_DIR}/venv/bin/python" ]] || ! "${APP_DIR}/venv/bin/python" -c "import sys; assert sys.version.startswith('${PY_VERSION}')" 2>/dev/null; then
  rm -rf "${APP_DIR}/venv"
  as_app "${APP_DIR}/tools/uv/uv" venv --quiet --python "$PY_VERSION" "${APP_DIR}/venv"
fi
ok "$("${APP_DIR}/venv/bin/python" --version)"

node_ok() { local v; v="$("$1" -v 2>/dev/null | tr -d v | cut -d. -f1)"; [[ -n "$v" && "$v" -ge "$NODE_MAJOR" ]]; }
if [[ -x "${APP_DIR}/tools/node/bin/node" ]] && node_ok "${APP_DIR}/tools/node/bin/node"; then
  :
else
  base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  file="$(curl -fsSL "${base}/SHASUMS256.txt" | awk -v a="linux-${NODE_ARCH}.tar.xz" '$2 ~ a"$" {print $2; exit}')"
  sum="$(curl -fsSL "${base}/SHASUMS256.txt" | awk -v f="$file" '$2==f {print $1}')"
  [[ -n "$file" ]] || die "Impossible de trouver Node ${NODE_MAJOR} pour ${NODE_ARCH}."
  tmp="$(mktemp -d)"; curl -fsSL "${base}/${file}" -o "${tmp}/${file}"
  echo "${sum}  ${tmp}/${file}" | sha256sum -c --quiet - || die "Somme de contrôle Node invalide."
  rm -rf "${APP_DIR}/tools/node" && mkdir -p "${APP_DIR}/tools/node"
  tar -xJf "${tmp}/${file}" -C "${APP_DIR}/tools/node" --strip-components=1 && rm -rf "$tmp"
  chown -R "$APP":"$APP" "${APP_DIR}/tools/node"
fi
ok "Node $("${APP_DIR}/tools/node/bin/node" -v) (le Node du système n'est pas touché)"

# ============================================================================= 7. code source
step "Récupération du code (${BRANCH})"
if [[ "$REPO_URL" =~ ^(git@|ssh://) ]]; then
  if [[ ! -f "${APP_DIR}/.ssh/id_ed25519" ]]; then
    as_app ssh-keygen -q -t ed25519 -N "" -C "gocelsys-deploy@$(hostname)" -f "${APP_DIR}/.ssh/id_ed25519"
  fi
  if ! as_app git ls-remote --heads "$REPO_URL" "$BRANCH" >/dev/null 2>&1; then
    printf '\n%sLe serveur n'"'"'a pas encore accès au dépôt.%s\n' "$C_Y$C_B" "$C_0"
    echo "  Ajoutez cette clé dans GitHub → dépôt → Settings → Deploy keys → Add deploy key"
    echo "  (titre : VPS Gocelsys, NE PAS cocher « Allow write access ») :"
    echo; echo "  $(cat "${APP_DIR}/.ssh/id_ed25519.pub")"; echo
    echo "  Puis relancez : sudo bash $0 --repo ${REPO_URL}"
    trap - ERR; exit 3
  fi
fi
if [[ ! -d "${APP_DIR}/repo/.git" ]]; then
  as_app git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "${APP_DIR}/repo" \
    || die "Clonage impossible : vérifiez l'URL, la branche « ${BRANCH} » et l'accès au dépôt."
else
  as_app git -C "${APP_DIR}/repo" remote set-url origin "$REPO_URL"
  as_app git -C "${APP_DIR}/repo" fetch --quiet --prune origin "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}"
  as_app git -C "${APP_DIR}/repo" checkout --quiet -B "$BRANCH" "origin/${BRANCH}"
  as_app git -C "${APP_DIR}/repo" reset --quiet --hard "origin/${BRANCH}"
fi
SHA="$(as_app git -C "${APP_DIR}/repo" rev-parse HEAD)"
SHORT="${SHA:0:7}"
MSG="$(as_app git -C "${APP_DIR}/repo" log -1 --format='%s (%cr)')"
ok "Commit ${SHORT} — ${MSG}"
[[ -f "${APP_DIR}/repo/backend/manage.py" && -f "${APP_DIR}/repo/web/package.json" ]] || die "La branche ${BRANCH} ne contient pas backend/ et web/."

# Commande « gocelsys-deploy » : lance toujours la dernière version de ce script
cat > /usr/local/bin/gocelsys-deploy <<EOF
#!/usr/bin/env bash
# Gocelsys : met à jour depuis la branche « ${BRANCH} » avec la dernière version du script de déploiement.
set -euo pipefail
[[ \$EUID -eq 0 ]] || exec sudo "\$0" "\$@"
. ${CONF_FILE}
runuser -u ${APP} -- env GIT_SSH_COMMAND="ssh -i ${APP_DIR}/.ssh/id_ed25519 -o IdentitiesOnly=yes" \\
  git -C ${APP_DIR}/repo fetch --quiet origin "+refs/heads/\${BRANCH}:refs/remotes/origin/\${BRANCH}"
tmp="\$(mktemp /tmp/gocelsys-deploy.XXXXXX.sh)"
runuser -u ${APP} -- git -C ${APP_DIR}/repo show "origin/\${BRANCH}:deploy/deploy.sh" > "\$tmp"
exec bash "\$tmp" "\$@"
EOF
chmod 0755 /usr/local/bin/gocelsys-deploy

# ============================================================================= 8. construction de la version
CURRENT="$(readlink -f "${APP_DIR}/current" 2>/dev/null || true)"
REBUILD=1
if [[ -n "$CURRENT" && "$(release_sha "$CURRENT")" == "$SHA" && $OPT_FORCE -eq 0 ]]; then
  REBUILD=0
  RELEASE="$CURRENT"
  step "Version ${SHORT} déjà en ligne"
  info "Rien à reconstruire (utilisez --force pour forcer). Vérification de la configuration…"
else
  RELEASE="${APP_DIR}/releases/$(date +%Y%m%d-%H%M%S)-${SHORT}"
  step "Construction de la version ${SHORT}"
  install -d -o "$APP" -g "$NGX_GROUP" -m 0755 "$RELEASE"
  as_app bash -c "git -C '${APP_DIR}/repo' archive --format=tar '${SHA}' backend web deploy | tar -x -C '${RELEASE}'"
  echo "$SHA" > "${RELEASE}/.sha"
  ok "Code extrait dans $(basename "$RELEASE")"

  as_app "${APP_DIR}/tools/uv/uv" pip install --quiet --python "${APP_DIR}/venv/bin/python" -r "${RELEASE}/backend/requirements-prod.txt"
  ok "Dépendances Python installées"

  # Réutilise node_modules de la version précédente si package-lock.json n'a pas changé (beaucoup plus rapide)
  if [[ -n "$CURRENT" && -d "${CURRENT}/web/node_modules" ]] && cmp -s "${CURRENT}/web/package-lock.json" "${RELEASE}/web/package-lock.json"; then
    cp -a "${CURRENT}/web/node_modules" "${RELEASE}/web/node_modules"
    info "Dépendances web réutilisées"
  else
    as_app bash -c "cd '${RELEASE}/web' && npm ci --no-audit --no-fund --loglevel=error"
  fi
  build_log="$(mktemp)"; chmod 0666 "$build_log"
  if ! as_app bash -c "cd '${RELEASE}/web' && NODE_OPTIONS=--max-old-space-size=${NODE_HEAP} VITE_API_URL= npm run build" > "$build_log" 2>&1 \
     || [[ ! -f "${RELEASE}/web/dist/index.html" ]]; then
    tail -n 40 "$build_log" | sed 's/^/    /'; rm -f "$build_log"
    rm -rf "$RELEASE"
    die "La compilation du site web a échoué : la version en ligne n'a pas été touchée."
  fi
  rm -f "$build_log"
  chmod -R a+rX "${RELEASE}/web/dist"
  ok "Site web compilé ($(du -sh "${RELEASE}/web/dist" | cut -f1))"

  check_log="$(mktemp)"; chmod 0666 "$check_log"
  if ! manage "$RELEASE" check --deploy --fail-level ERROR > "$check_log" 2>&1; then
    sed 's/^/    /' "$check_log"; rm -f "$check_log"
    rm -rf "$RELEASE"
    die "Le backend de cette version est invalide : la version en ligne n'a pas été touchée."
  fi
  rm -f "$check_log"
  ok "Contrôles Django de production : OK"
fi

# ============================================================================= 9. sauvegarde + migrations
if [[ $FIRST_INSTALL -eq 0 && $REBUILD -eq 1 ]]; then
  step "Sauvegarde de la base avant mise à jour"
  BK="${APP_DIR}/backups/${DB_NAME}-$(date +%Y%m%d-%H%M%S)-avant-${SHORT}.dump"
  if [[ "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]]; then
    runuser -u postgres -- pg_dump -Fc -d "$DB_NAME" -f "$BK"
  else
    PGPASSWORD="$DB_PASSWORD" pg_dump -Fc -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$BK"
  fi
  chmod 0640 "$BK"
  { ls -1t "${APP_DIR}"/backups/*.dump 2>/dev/null || true; } | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
  ok "$(basename "$BK") ($(du -h "$BK" | cut -f1))"
fi

step "Migrations et référentiel"
ENV_SUM_BEFORE="$(md5sum "$ENV_FILE" | cut -d' ' -f1)"
mig_log="$(mktemp)"; chmod 0644 "$mig_log"
if ! manage "$RELEASE" migrate --noinput > "$mig_log" 2>&1; then
  sed 's/^/    /' "$mig_log"
  [[ -n "${BK:-}" ]] && warn "Sauvegarde prise juste avant : ${BK}"
  die "Les migrations ont échoué : la version en ligne n'a pas été remplacée."
fi
grep -E "Applying|No migrations" "$mig_log" | sed 's/^ */  · /' || true
rm -f "$mig_log"
if [[ $REBUILD -eq 1 ]]; then
  manage "$RELEASE" collectstatic --noinput --clear -v0
  ok "Fichiers statiques collectés"
fi
ADMIN_PW_FILE="${ETC_DIR}/admin-initial.txt"
if [[ $FIRST_INSTALL -eq 1 ]]; then
  if [[ $OPT_DEMO -eq 1 ]]; then
    manage "$RELEASE" seed_demo
    warn "Données de DÉMONSTRATION chargées. À ne pas garder en production réelle."
    printf 'Identifiant : admin\nMot de passe : gocelsys2026\nDonnées de démonstration : changez ce mot de passe.\n' > "$ADMIN_PW_FILE"
    chmod 0600 "$ADMIN_PW_FILE"
  fi
  if [[ ! -f "$ADMIN_PW_FILE" ]]; then
    ADMIN_PW="$(rand 20)"
    printf 'Identifiant : admin\nMot de passe : %s\nCréé le : %s\nChangez-le après la première connexion, puis supprimez ce fichier.\n' "$ADMIN_PW" "$(date '+%F %T')" > "$ADMIN_PW_FILE"
    chmod 0600 "$ADMIN_PW_FILE"
  fi
  ADMIN_PW="$(sed -n 's/^Mot de passe : //p' "$ADMIN_PW_FILE")"
  pwtmp="$(mktemp)"; printf '%s' "$ADMIN_PW" > "$pwtmp"; chown "$APP" "$pwtmp"; chmod 0600 "$pwtmp"
  manage "$RELEASE" bootstrap --admin admin --password-file "$pwtmp" --email "$LE_EMAIL"
  rm -f "$pwtmp"
else
  manage "$RELEASE" bootstrap
fi

# ============================================================================= 10. services systemd
step "Services systemd"
write_if_changed() { # $1 = destination ; contenu sur l'entrée standard ; retourne 0 si modifié
  local tmp; tmp="$(mktemp)"; cat > "$tmp"
  if [[ -f "$1" ]] && cmp -s "$tmp" "$1"; then rm -f "$tmp"; return 1; fi
  install -m 0644 "$tmp" "$1"; rm -f "$tmp"; return 0
}
UNITS_CHANGED=0
write_if_changed /etc/systemd/system/gocelsys-api.service <<EOF && UNITS_CHANGED=1 || true
# Géré par deploy.sh — réécrit à chaque déploiement
[Unit]
Description=Gocelsys API (Django + Gunicorn)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=${APP}
Group=${NGX_GROUP}
UMask=0007
RuntimeDirectory=gocelsys
RuntimeDirectoryMode=0750
WorkingDirectory=${APP_DIR}/current/backend
EnvironmentFile=${ENV_FILE}
ExecStart=${APP_DIR}/venv/bin/gunicorn config.wsgi:application \\
  --bind unix:${SOCKET} --workers ${WORKERS} --threads 2 \\
  --timeout 60 --graceful-timeout 30 --keep-alive 5 \\
  --max-requests 1200 --max-requests-jitter 200 \\
  --access-logfile - --error-logfile - --capture-output
ExecReload=/bin/kill -s HUP \$MAINPID
Restart=always
RestartSec=3
LimitNOFILE=65535
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
write_if_changed /etc/systemd/system/gocelsys-alerts.service <<EOF && UNITS_CHANGED=1 || true
# Géré par deploy.sh — alertes automatiques (stock, caisses, échéances…)
[Unit]
Description=Gocelsys — alertes automatiques
After=postgresql.service

[Service]
Type=oneshot
User=${APP}
Group=${NGX_GROUP}
WorkingDirectory=${APP_DIR}/current/backend
EnvironmentFile=${ENV_FILE}
ExecStart=${APP_DIR}/venv/bin/python manage.py run_alerts
EOF
write_if_changed /etc/systemd/system/gocelsys-alerts.timer <<EOF && UNITS_CHANGED=1 || true
# Géré par deploy.sh
[Unit]
Description=Gocelsys — alertes toutes les 15 minutes

[Timer]
OnCalendar=*:0/15
Persistent=true
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
EOF
write_if_changed /etc/systemd/system/gocelsys-backup.service <<EOF && UNITS_CHANGED=1 || true
# Géré par deploy.sh — sauvegarde quotidienne de la base (10 dernières conservées)
[Unit]
Description=Gocelsys — sauvegarde de la base
After=postgresql.service

[Service]
Type=oneshot
User=postgres
ExecStart=/bin/bash -c 'pg_dump -Fc -d ${DB_NAME} -f ${APP_DIR}/backups/${DB_NAME}-\$\$(date +%%Y%%m%%d-%%H%%M%%S)-quotidien.dump && ls -1t ${APP_DIR}/backups/*-quotidien.dump | tail -n +11 | xargs -r rm -f'
EOF
write_if_changed /etc/systemd/system/gocelsys-backup.timer <<EOF && UNITS_CHANGED=1 || true
# Géré par deploy.sh
[Unit]
Description=Gocelsys — sauvegarde quotidienne à 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
(( UNITS_CHANGED )) && systemctl daemon-reload
systemctl enable --quiet gocelsys-api gocelsys-alerts.timer
[[ "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]] && systemctl enable --quiet --now gocelsys-backup.timer
systemctl start gocelsys-alerts.timer
ok "gocelsys-api, gocelsys-alerts.timer, gocelsys-backup.timer"

# ============================================================================= 11. mise en ligne
step "Mise en ligne"
PREVIOUS="$CURRENT"
if [[ "$RELEASE" != "$CURRENT" ]]; then
  ln -sfn "$RELEASE" "${APP_DIR}/current.tmp" && mv -Tf "${APP_DIR}/current.tmp" "${APP_DIR}/current"
fi
if [[ $REBUILD -eq 1 || $UNITS_CHANGED -eq 1 || "$ENV_SUM_BEFORE" != "$(md5sum "$ENV_FILE" | cut -d' ' -f1)" ]] || ! systemctl is-active --quiet gocelsys-api; then
  systemctl restart gocelsys-api
else
  info "Aucun changement : l'API n'est pas redémarrée."
fi
if wait_healthy; then
  touch "${RELEASE}/.ok"
  ok "API en ligne : $(curl -s --unix-socket "$SOCKET" -H "Host: ${DOMAIN}" http://localhost/api/health/)"
else
  warn "L'API ne répond pas. Dernières lignes du journal :"
  journalctl -u gocelsys-api -n 30 --no-pager | sed 's/^/    /'
  if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$RELEASE" ]]; then
    ln -sfn "$PREVIOUS" "${APP_DIR}/current.tmp" && mv -Tf "${APP_DIR}/current.tmp" "${APP_DIR}/current"
    systemctl restart gocelsys-api
    wait_healthy && warn "Retour automatique à la version précédente ($(basename "$PREVIOUS")) : le site reste en ligne."
    rm -rf "$RELEASE"
    [[ -n "${BK:-}" ]] && warn "Sauvegarde de la base avant migration : ${BK}"
  fi
  die "La nouvelle version n'a pas démarré."
fi

# ============================================================================= 12. Nginx (+ HTTPS)
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
if [[ -d /etc/nginx/sites-available ]]; then
  NGX_CONF="/etc/nginx/sites-available/gocelsys.conf"; NGX_LINK="/etc/nginx/sites-enabled/gocelsys.conf"
else
  NGX_CONF="/etc/nginx/conf.d/gocelsys.conf"; NGX_LINK=""
fi
L6_80="" L6_443=""
if [[ -f /proc/net/if_inet6 ]]; then L6_80="    listen [::]:80;"; L6_443="    listen [::]:443 ssl"; fi
ver_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" == "$2" ]]; }

render_nginx() { # $1 = 1 avec HTTPS, 0 sans ; $2 = 1 si www est couvert
  local ssl="$1" www="$2" names="${DOMAIN}" h2_listen="" h2_line=""
  [[ "$www" == "1" ]] && names="${DOMAIN} ${WWW_DOMAIN}"
  if ver_ge "$NGX_VER" "1.25.1"; then h2_line="    http2 on;"; else h2_listen=" http2"; fi
  local app_block
  app_block="$(cat <<EOF
    root ${APP_DIR}/current/web/dist;
    index index.html;
    client_max_body_size 12m;
    charset utf-8;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;

    # API Django (socket Unix privée à Gocelsys)
    location /api/ {
        proxy_pass http://gocelsys_api;
        include ${ETC_DIR}/nginx-proxy.conf;
    }
    location = /api/auth/login/ {
        limit_req zone=gocelsys_auth burst=10 nodelay;
        limit_req_status 429;
        proxy_pass http://gocelsys_api;
        include ${ETC_DIR}/nginx-proxy.conf;
    }
    location /admin/ {
        proxy_pass http://gocelsys_api;
        include ${ETC_DIR}/nginx-proxy.conf;
    }
    location /static/ {
        alias ${APP_DIR}/shared/static/;
        expires 30d;
        access_log off;
    }
    # Photos produits et vitrine (chargées aussi comme textures 3D)
    location /media/ {
        alias ${APP_DIR}/shared/media/;
        expires 7d;
        add_header Access-Control-Allow-Origin "*" always;
        include ${ETC_DIR}/nginx-headers.conf;
        location ~* \.(php|py|sh|html?)\$ { deny all; }
    }
    # Fichiers du site compilés (noms avec empreinte : cache d'un an)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        include ${ETC_DIR}/nginx-headers.conf;
        access_log off;
        try_files \$uri =404;
    }
    location = /index.html {
        add_header Cache-Control "no-cache";
        include ${ETC_DIR}/nginx-headers.conf;
    }
    # Application monopage : toute autre adresse renvoie index.html
    location / {
        try_files \$uri \$uri/ /index.html;
        include ${ETC_DIR}/nginx-headers.conf;
    }
EOF
)"
  cat <<EOF
# =====================================================================
#  Gocelsys — ${DOMAIN}
#  Généré par deploy.sh : NE PAS MODIFIER À LA MAIN (réécrit à chaque déploiement).
#  Seul fichier Nginx de Gocelsys ; les autres sites du serveur ne sont pas touchés.
# =====================================================================
upstream gocelsys_api {
    server unix:${SOCKET} fail_timeout=0;
    keepalive 16;
}
limit_req_zone \$binary_remote_addr zone=gocelsys_auth:10m rate=12r/m;

server {
    listen 80;
${L6_80}
    server_name ${names};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type text/plain;
    }
EOF
  if [[ "$ssl" == "1" ]]; then
    cat <<EOF
    location / {
        return 301 https://${DOMAIN}\$request_uri;
    }
}
EOF
    if [[ "$www" == "1" ]]; then
      cat <<EOF

server {
    listen 443 ssl${h2_listen};
${L6_443:+${L6_443}${h2_listen};}
${h2_line}
    server_name ${WWW_DOMAIN};
    include ${ETC_DIR}/nginx-ssl.conf;
    return 301 https://${DOMAIN}\$request_uri;
}
EOF
    fi
    cat <<EOF

server {
    listen 443 ssl${h2_listen};
${L6_443:+${L6_443}${h2_listen};}
${h2_line}
    server_name ${DOMAIN};
    include ${ETC_DIR}/nginx-ssl.conf;
    include ${ETC_DIR}/nginx-headers.conf;

${app_block}
}
EOF
  else
    cat <<EOF

${app_block}
}
EOF
  fi
}

install_nginx() { # $1 ssl, $2 www — installe, teste, recharge ; restaure en cas d'erreur
  {
    echo "# Géré par deploy.sh — en-têtes de sécurité (inclus dans chaque location qui ajoute ses propres en-têtes)"
    echo "add_header X-Content-Type-Options nosniff always;"
    echo "add_header Referrer-Policy same-origin always;"
    echo "add_header X-Frame-Options DENY always;"
    [[ "$1" == "1" ]] && echo 'add_header Strict-Transport-Security "max-age=31536000" always;'
  } > "${ETC_DIR}/nginx-headers.conf"
  chmod 0644 "${ETC_DIR}/nginx-headers.conf"
  local new; new="$(mktemp)"
  render_nginx "$1" "$2" | awk 'NF || prev {print} {prev=NF}' > "$new"
  if [[ -f "$NGX_CONF" ]] && cmp -s "$new" "$NGX_CONF"; then rm -f "$new"; ok "Configuration Nginx inchangée"; return 0; fi
  local backup=""
  [[ -f "$NGX_CONF" ]] && backup="${NGX_CONF}.bak" && cp -a "$NGX_CONF" "$backup"
  install -m 0644 "$new" "$NGX_CONF"; rm -f "$new"
  [[ -n "$NGX_LINK" ]] && ln -sfn "$NGX_CONF" "$NGX_LINK"
  if nginx -t >/dev/null 2>&1; then
    rm -f "${NGX_CONF}.bak"
    systemctl reload nginx
    ok "Nginx rechargé ($( [[ $1 == 1 ]] && echo HTTPS || echo HTTP ))"
  else
    warn "La nouvelle configuration Nginx est invalide :"
    nginx -t 2>&1 | sed 's/^/    /'
    if [[ -n "$backup" ]]; then mv -f "$backup" "$NGX_CONF"; else rm -f "$NGX_CONF"; [[ -n "$NGX_LINK" ]] && rm -f "$NGX_LINK"; fi
    nginx -t >/dev/null 2>&1 && systemctl reload nginx
    die "Configuration Nginx restaurée : les autres sites continuent de fonctionner."
  fi
}

step "Nginx"
# Fragments partagés (inclus par gocelsys.conf)
write_if_changed "${ETC_DIR}/nginx-proxy.conf" <<'EOF' || true
# Géré par deploy.sh
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_redirect off;
proxy_read_timeout 90s;
proxy_buffering on;
EOF
write_if_changed "${ETC_DIR}/nginx-ssl.conf" <<EOF || true
# Géré par deploy.sh
ssl_certificate ${CERT_DIR}/fullchain.pem;
ssl_certificate_key ${CERT_DIR}/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:gocelsys_ssl:10m;
ssl_session_tickets off;
EOF
chmod 0644 "${ETC_DIR}"/nginx-*.conf

resolves_here() { { getent ahostsv4 "$1" 2>/dev/null || true; } | awk '{print $1}' | sort -u | grep -qx "$SERVER_IP"; }
cert_has() { openssl x509 -noout -ext subjectAltName -in "${CERT_DIR}/fullchain.pem" 2>/dev/null | grep -q "DNS:$1"; }

HAVE_CERT=0; WWW_OK=0
[[ -f "${CERT_DIR}/fullchain.pem" ]] && HAVE_CERT=1
resolves_here "$WWW_DOMAIN" && WWW_OK=1
WWW_IN_CERT=0; [[ $HAVE_CERT == 1 ]] && cert_has "$WWW_DOMAIN" && WWW_IN_CERT=1

if [[ $HAVE_CERT == 1 ]]; then install_nginx 1 "$WWW_IN_CERT"; else install_nginx 0 "$WWW_OK"; fi

if [[ $OPT_NOSSL -eq 0 ]]; then
  step "Certificat HTTPS (Let's Encrypt)"
  if ! resolves_here "$DOMAIN"; then
    warn "${DOMAIN} ne pointe pas encore vers ${SERVER_IP} (DNS actuel : $( { getent ahostsv4 "$DOMAIN" || true; } | awk '{print $1}' | sort -u | tr '\n' ' ' ))."
    warn "Créez un enregistrement A « @ » et « www » vers ${SERVER_IP}, puis relancez : le certificat sera demandé automatiquement."
  elif [[ $HAVE_CERT == 0 || ( $WWW_OK == 1 && $WWW_IN_CERT == 0 ) ]]; then
    domains=(-d "$DOMAIN"); [[ $WWW_OK == 1 ]] && domains+=(-d "$WWW_DOMAIN")
    if certbot certonly --webroot -w "$ACME_ROOT" --cert-name "$DOMAIN" "${domains[@]}" \
         --email "$LE_EMAIL" --agree-tos --no-eff-email --non-interactive --keep-until-expiring --expand \
         --deploy-hook "systemctl reload nginx" >/dev/null 2>&1; then
      ok "Certificat obtenu pour ${domains[*]//-d /}"
      HAVE_CERT=1; WWW_IN_CERT=$WWW_OK
      install_nginx 1 "$WWW_IN_CERT"
    else
      warn "Let's Encrypt a refusé la demande (détails : /var/log/letsencrypt/letsencrypt.log). Le site reste en HTTP."
    fi
  else
    ok "Certificat valide jusqu'au $(openssl x509 -enddate -noout -in "${CERT_DIR}/fullchain.pem" | cut -d= -f2)"
  fi
  if [[ $HAVE_CERT == 1 ]] && ! systemctl list-timers --all 2>/dev/null | grep -q certbot && ! [[ -f /etc/cron.d/certbot ]]; then
    warn "Aucun renouvellement automatique certbot détecté : ajoutez « certbot renew -q » à cron."
  fi
fi

# HTTPS actif → cookies sécurisés
if [[ $HAVE_CERT == 1 ]] && ! grep -q '^GOCELSYS_HTTPS=true' "$ENV_FILE"; then
  set_env GOCELSYS_HTTPS true --force
  systemctl restart gocelsys-api && wait_healthy
  ok "Mode HTTPS activé dans l'application"
fi

# Pare-feu : on ne l'active jamais ; s'il l'est déjà, on ouvre seulement 80/443
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ok "Pare-feu : ports 80 et 443 ouverts"
fi

# ============================================================================= 13. nettoyage + bilan
LIVE="$(readlink -f "${APP_DIR}/current")"
# versions jamais validées (compilation interrompue, échec) : supprimées
for r in "${APP_DIR}"/releases/*/; do r="${r%/}"; [[ -d "$r" && "$r" != "$LIVE" && ! -f "$r/.ok" ]] && rm -rf "$r"; done
# on garde les KEEP_RELEASES dernières versions validées
{ ls -1d "${APP_DIR}"/releases/*/ 2>/dev/null | sort -r || true; } | sed 's#/$##' | { grep -vx "$LIVE" || true; } \
  | tail -n +"$KEEP_RELEASES" | xargs -r rm -rf
# node_modules n'est utile qu'à la version en ligne (accélère la prochaine compilation)
for r in "${APP_DIR}"/releases/*/; do [[ "${r%/}" != "$(readlink -f "${APP_DIR}/current")" ]] && rm -rf "${r}web/node_modules"; done

step "Vérification publique"
SCHEME="http"; [[ $HAVE_CERT == 1 ]] && SCHEME="https"
# Nginx applique un « reload » en différé : on vérifie le CONTENU (pas seulement le code 200),
# sinon on pourrait lire la page d'un autre site du serveur pendant la transition.
probe() { curl -s --noproxy '*' --max-time 8 --resolve "${DOMAIN}:443:127.0.0.1" --resolve "${DOMAIN}:80:127.0.0.1" "$1" 2>/dev/null || true; }
SITE_OK=0 API_OK=0
for _ in $(seq 1 15); do
  [[ $SITE_OK == 0 ]] && probe "${SCHEME}://${DOMAIN}/" | grep -qi "gocelsys" && SITE_OK=1
  [[ $API_OK == 0 ]] && probe "${SCHEME}://${DOMAIN}/api/health/" | grep -q '"status": "ok"' && API_OK=1
  [[ $SITE_OK == 1 && $API_OK == 1 ]] && break
  sleep 1
done
[[ $SITE_OK == 1 ]] && ok "Site : ${SCHEME}://${DOMAIN}/ répond (page Gocelsys)" || warn "Site : ${SCHEME}://${DOMAIN}/ ne renvoie pas la page Gocelsys."
[[ $API_OK == 1 ]] && ok "API  : ${SCHEME}://${DOMAIN}/api/health/ → base de données OK" || warn "API : ${SCHEME}://${DOMAIN}/api/health/ ne répond pas correctement."

printf '\n%s══════════════════════════════════════════════════════════════════%s\n' "$C_G$C_B" "$C_0"
if [[ $FIRST_INSTALL -eq 1 ]]; then
  printf '%s  Gocelsys est installé.%s\n' "$C_G$C_B" "$C_0"
  echo "  Site et gestion : ${SCHEME}://${DOMAIN}"
  echo "  Connexion       : admin / $(sed -n 's/^Mot de passe : //p' "$ADMIN_PW_FILE")"
  echo "                    (gardé dans ${ADMIN_PW_FILE} — changez-le puis supprimez ce fichier)"
  echo "  Apps mobiles    : adresse du serveur = ${SCHEME}://${DOMAIN}"
else
  printf '%s  Gocelsys est à jour : version %s.%s\n' "$C_G$C_B" "$SHORT" "$C_0"
  echo "  ${SCHEME}://${DOMAIN}"
fi
echo "  Mettre à jour   : sudo gocelsys-deploy        État : sudo gocelsys-deploy --status"
echo "  Revenir arrière : sudo gocelsys-deploy --rollback"
echo "  Journaux        : journalctl -u gocelsys-api -f      (déploiement : ${LOG_FILE})"
printf '%s══════════════════════════════════════════════════════════════════%s\n' "$C_G$C_B" "$C_0"
