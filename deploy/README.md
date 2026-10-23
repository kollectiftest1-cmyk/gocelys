# Gocelsys — branche de déploiement (VPS)

Cette branche ne contient que ce qui tourne sur le serveur :

```
backend/   API Django (gunicorn + PostgreSQL)
web/       site public, boutique et espace de gestion (React, compilé sur le serveur)
deploy/    deploy.sh — installation et mises à jour
```

Elle est **générée automatiquement** depuis `main` par `publier-vps.bat` (Windows) ou `scripts/publier-vps.sh`.
Ne la modifiez pas à la main : travaillez sur `main`, puis publiez.

## Première installation (une seule fois)

Prérequis :
- le domaine `gocelsys.com` et `www` pointent vers `72.60.212.142` (enregistrements A) ;
- la branche `deploy` est sur GitHub (dépôt privé conseillé).

```bash
# depuis votre PC : copier le script sur le serveur
scp deploy/deploy.sh root@72.60.212.142:/root/gocelsys-deploy.sh

# sur le serveur
ssh root@72.60.212.142
sudo bash /root/gocelsys-deploy.sh --repo git@github.com:VOTRE-COMPTE/gocelsys.git --email vous@gocelsys.com
```

Si le dépôt est privé, le premier lancement affiche une **clé de déploiement** et s'arrête :
1. Ajoutez-la dans GitHub → dépôt → Settings → Deploy keys (lecture seule).
2. Relancez la même commande.

À la fin, le script affiche l'adresse du site et le mot de passe du compte `admin`. Ce mot de passe est aussi gardé dans `/etc/gocelsys/admin-initial.txt` : changez-le, puis supprimez ce fichier.

Option `--demo` : charge les données de démonstration (à éviter en production réelle).

## Mises à jour

```bash
sudo gocelsys-deploy             # récupère la dernière version de la branche deploy et la met en ligne
sudo gocelsys-deploy --status    # état, version en ligne, certificat, sauvegardes
sudo gocelsys-deploy --rollback  # revient à la version précédente
sudo gocelsys-deploy --force     # reconstruit même si la version n'a pas changé
```

Chaque mise à jour :
1. sauvegarde la base ;
2. construit la nouvelle version à côté de celle en ligne ;
3. applique les migrations ;
4. bascule, puis vérifie que l'API répond.

Si l'API ne répond pas, le script revient tout seul à la version précédente et le site reste en ligne.

## Ce que le script installe — et ce qu'il ne touche pas

| Élément | Gocelsys | Autres applications du serveur |
|---|---|---|
| Code | `/srv/gocelsys/releases/<date>-<commit>`, lien `current` | — |
| Photos, fichiers statiques | `/srv/gocelsys/shared/{media,static}` (conservés entre versions) | — |
| Python 3.13, Node 22 | privés : `/srv/gocelsys/tools` | versions du système inchangées |
| API | service `gocelsys-api` (gunicorn), socket Unix `/run/gocelsys/gunicorn.sock` | aucun port réservé |
| Tâches | `gocelsys-alerts.timer` (15 min), `gocelsys-backup.timer` (02:30) | — |
| Nginx | **un seul fichier** `gocelsys.conf`, testé (`nginx -t`) avant `reload`, restauré si erreur | autres sites jamais modifiés, Nginx jamais redémarré |
| PostgreSQL | rôle et base `gocelsys` | autres bases et `pg_hba.conf` inchangés |
| HTTPS | certificat Let's Encrypt `gocelsys.com` (+ `www`), renouvelé par certbot | autres certificats inchangés |
| Pare-feu | jamais activé ; s'il l'est déjà, ouvre 80/443 | règles existantes conservées |
| Paquets | installe seulement ceux qui manquent | jamais d'`apt upgrade` |

Le script s'arrête sans rien changer dans ces cas :
- le port 80/443 est tenu par autre chose que Nginx (Apache, Caddy, Traefik, conteneur) ;
- le domaine est déjà déclaré dans un autre site Nginx ;
- le port 5432 est pris par un PostgreSQL en conteneur.

## Fichiers utiles sur le serveur

| Fichier | Rôle |
|---|---|
| `/etc/gocelsys/gocelsys.env` | secrets et réglages (conservés à chaque mise à jour) |
| `/etc/gocelsys/deploy.conf` | dépôt, branche, e-mail Let's Encrypt |
| `/srv/gocelsys/backups/` | sauvegardes de la base (avant chaque mise à jour + quotidienne) |
| `/var/log/gocelsys/deploy-*.log` | journaux des déploiements |
| `journalctl -u gocelsys-api -f` | journal de l'API en direct |

Restaurer une sauvegarde :

```bash
sudo -u postgres pg_restore --clean --if-exists -d gocelsys /srv/gocelsys/backups/<fichier>.dump
sudo systemctl restart gocelsys-api
```

## Applications mobiles

Dans chaque app, l'adresse du serveur est `https://gocelsys.com`. Réglez-la dans `app.json → expo.extra.apiUrl` avant de construire l'APK.
