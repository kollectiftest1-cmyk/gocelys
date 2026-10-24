#!/usr/bin/env bash
# =============================================================================
#  Gocelsys — installateur à coller dans le terminal du serveur (première fois uniquement)
#
#  Pour un serveur accessible seulement par un terminal web (pas de scp) :
#   1. crée l'utilisateur gocelsys et sa clé SSH de déploiement ;
#   2. affiche la clé à ajouter dans GitHub (Deploy keys, lecture seule) et attend ;
#   3. clone la branche « deploy » dans /srv/gocelsys/repo ;
#   4. lance deploy/deploy.sh (installation complète).
#  Ensuite, les mises à jour se font avec :  sudo gocelsys-deploy
# =============================================================================
set -euo pipefail
APP_DIR=/srv/gocelsys
BRANCH="${BRANCH:-deploy}"
KEY="$APP_DIR/.ssh/id_ed25519"

[[ $EUID -eq 0 ]] || { echo "Lancez en root (sudo -i, puis recollez)."; exit 1; }
B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; Z=$'\e[0m'

REPO="${REPO:-}"
EMAIL="${EMAIL:-}"
[[ -n "$REPO" ]] || read -rp "URL SSH du dépôt GitHub (ex. git@github.com:compte/gocelsys.git) : " REPO </dev/tty
[[ -n "$EMAIL" ]] || read -rp "E-mail pour le certificat HTTPS (Let's Encrypt) : " EMAIL </dev/tty
[[ -n "$REPO" ]] || { echo "URL du dépôt obligatoire."; exit 1; }

need=()
command -v git >/dev/null 2>&1 || need+=(git)
command -v ssh-keygen >/dev/null 2>&1 || need+=(openssh-client)
if (( ${#need[@]} )); then
  echo "Installation : ${need[*]}…"
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need[@]}" >/dev/null
fi

id gocelsys >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin --user-group gocelsys
install -d -m 0755 -o gocelsys -g gocelsys "$APP_DIR"
install -d -m 0700 -o gocelsys -g gocelsys "$APP_DIR/.ssh"

as_app() { runuser -u gocelsys -- env -C "$APP_DIR" HOME="$APP_DIR" PATH=/usr/local/bin:/usr/bin:/bin \
  GIT_SSH_COMMAND="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" "$@"; }

if [[ "$REPO" =~ ^(git@|ssh://) ]]; then
  [[ -f "$KEY" ]] || as_app ssh-keygen -q -t ed25519 -N "" -C "gocelsys-vps@$(hostname)" -f "$KEY"
  until as_app git ls-remote --heads "$REPO" "$BRANCH" 2>/dev/null | grep -q "refs/heads/$BRANCH"; do
    if as_app git ls-remote "$REPO" >/dev/null 2>&1; then
      echo "${Y}Le dépôt est accessible mais la branche « $BRANCH » n'existe pas encore sur GitHub.${Z}"
      echo "Sur votre PC, lancez publier-vps.bat (il crée et envoie la branche deploy)."
    else
      echo
      echo "${B}1. Copiez cette clé (toute la ligne) :${Z}"
      echo
      echo "   $(cat "$KEY.pub")"
      echo
      echo "${B}2. GitHub → votre dépôt → Settings → Deploy keys → Add deploy key${Z}"
      echo "   Titre : VPS Gocelsys — collez la clé — NE PAS cocher « Allow write access » → Add key"
    fi
    echo
    read -rp "Appuyez sur Entrée quand c'est fait (Ctrl+C pour abandonner)… " _ </dev/tty
  done
  echo "${G}✔ Accès au dépôt confirmé.${Z}"
fi

if [[ -d "$APP_DIR/repo/.git" ]]; then
  as_app git -C "$APP_DIR/repo" fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
  as_app git -C "$APP_DIR/repo" reset -q --hard "origin/$BRANCH"
else
  install -d -m 0750 -o gocelsys -g gocelsys "$APP_DIR/repo"
  as_app git clone -q --branch "$BRANCH" --single-branch "$REPO" "$APP_DIR/repo"
fi
echo "${G}✔ Code récupéré : $(as_app git -C "$APP_DIR/repo" log -1 --format='%h — %s')${Z}"

# Le script de déploiement est copié avant d'être lancé : il met lui-même le dépôt à jour pendant qu'il tourne.
tmp="$(mktemp /tmp/gocelsys-deploy.XXXXXX.sh)"
cp "$APP_DIR/repo/deploy/deploy.sh" "$tmp"
exec bash "$tmp" --repo "$REPO" --branch "$BRANCH" ${EMAIL:+--email "$EMAIL"} "$@"
