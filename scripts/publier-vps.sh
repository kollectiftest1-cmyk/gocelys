#!/usr/bin/env bash
# Enregistre le travail sur « main », reconstruit « deploy », pousse les deux branches,
# puis (option) lance la mise à jour sur le VPS.
#   bash scripts/publier-vps.sh "message du commit"
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
VPS="${VPS:-root@72.60.212.142}"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "Placez-vous sur la branche main (git checkout main)." >&2; exit 1; }
git remote get-url origin >/dev/null 2>&1 || { echo "Aucun dépôt distant : git remote add origin git@github.com:COMPTE/gocelsys.git" >&2; exit 1; }
git add -A
git diff --cached --quiet || git commit -q -m "${1:-Mise à jour}"
bash scripts/sync-deploy-branch.sh main
git push -q origin main deploy
echo "Publié sur origin : main et deploy."
read -rp "Mettre à jour le serveur ${VPS} maintenant ? [o/N] " go
[[ "$go" =~ ^[oOyY]$ ]] && ssh -t "$VPS" "sudo gocelsys-deploy"
