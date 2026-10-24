#!/usr/bin/env bash
# Construit la branche « deploy » à partir de « main » : backend/ + web/ + deploy/ uniquement (pas les apps mobiles).
# Ne touche ni au dossier de travail ni à la branche courante (plomberie Git, index temporaire).
#   bash scripts/sync-deploy-branch.sh [branche-source]
set -euo pipefail
SRC="${1:-main}"
DST="deploy"
cd "$(git rev-parse --show-toplevel)"
git rev-parse --verify -q "$SRC" >/dev/null || { echo "Branche « $SRC » introuvable." >&2; exit 1; }
if ! git diff --quiet HEAD -- backend web deploy 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard -- backend web deploy)" ]; then
  echo "Attention : des modifications de backend/, web/ ou deploy/ ne sont pas encore enregistrées (commit) : elles ne seront pas publiées."
fi

GIT_INDEX_FILE="$(git rev-parse --absolute-git-dir)/deploy-index"
export GIT_INDEX_FILE
rm -f "$GIT_INDEX_FILE"
git read-tree --empty
for d in backend web deploy; do git read-tree --prefix="$d/" "$SRC:$d"; done
for f in .gitignore .gitattributes; do
  git update-index --add --cacheinfo "100644,$(git rev-parse "$SRC:$f"),$f"
done
git update-index --add --cacheinfo "100644,$(git rev-parse "$SRC:deploy/README.md"),README.md"
TREE="$(git write-tree)"
rm -f "$GIT_INDEX_FILE"
unset GIT_INDEX_FILE

PARENT="$(git rev-parse -q --verify "refs/heads/$DST" || true)"
if [ -n "$PARENT" ] && [ "$(git show -s --format=%T "$PARENT")" = "$TREE" ]; then
  echo "Branche « $DST » déjà à jour."
  exit 0
fi
SHORT="$(git rev-parse --short "$SRC")"
[ "$SRC" = "HEAD" ] && SRC="$(git rev-parse --abbrev-ref HEAD | sed 's/^HEAD$/main/')"
COMMIT="$(git commit-tree "$TREE" ${PARENT:+-p "$PARENT"} -m "Déploiement : $SRC@$SHORT" -m "$(git log -1 --format=%s "$SRC")")"
git update-ref "refs/heads/$DST" "$COMMIT"
echo "Branche « $DST » mise à jour : $(git rev-parse --short "$COMMIT") (depuis $SRC@$SHORT)."
