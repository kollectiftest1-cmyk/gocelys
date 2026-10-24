# Gocelsys — déploiement sur le VPS

Cette branche (`deploy`) ne contient que ce qui tourne sur le serveur :

```
backend/   API Django (gunicorn + PostgreSQL)
web/       site public, boutique et espace de gestion (React, compilé sur le serveur)
deploy/    deploy.sh (installation et mises à jour) + config.env (domaines, IP, e-mail)
```

Elle est **reconstruite automatiquement par GitHub** à chaque `git push` sur `main` (action « Branche deploy »).
Ne la modifiez pas : travaillez sur `main`.

## Les 3 gestes

**Sur votre PC** — comme d'habitude :
```bash
git add -A && git commit -m "…" && git push
```

**Sur le serveur, la première fois** (terminal du navigateur, en root) :
```bash
git clone -b deploy https://github.com/COMPTE/gocelsys.git /opt/gocelsys
bash /opt/gocelsys/deploy/deploy.sh
```

**Sur le serveur, ensuite** :
```bash
gocelsys-deploy
```

`gocelsys-deploy` fait `git pull`, puis met en ligne la nouvelle version.

## Dépôt privé : identifiants GitHub sur le serveur

Au `git clone`, GitHub demande un nom d'utilisateur et un mot de passe. Le mot de passe est un **jeton** :
1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token ;
2. Repository access : seulement `gocelsys` ;
3. Permissions → Contents : **Read-only**.

Pour que les `git pull` suivants ne redemandent rien, tapez une fois, avant le clone :
```bash
git config --global credential.helper store
```

## Domaines

Ils sont réglés dans `deploy/config.env` :

| | Domaines |
|---|---|
| Principal | `gocelsys.com` |
| Redirigés vers le principal | `gocelsys.fr`, `gocelsys.online` (avec et sans `www`) |

Chez chaque registraire, créez deux enregistrements **A** vers `72.60.212.142` : `@` et `www`.

Le certificat HTTPS couvre tous les noms qui pointent déjà vers le serveur. Un domaine configuré plus tard est ajouté automatiquement au lancement suivant de `gocelsys-deploy`.

## Commandes

```bash
gocelsys-deploy               # git pull + mise à jour (reconstruit seulement si le code a changé)
gocelsys-deploy --status      # version en ligne, services, certificat, sauvegardes
gocelsys-deploy --rollback    # revenir à la version précédente
gocelsys-deploy --force       # reconstruire même sans changement
gocelsys-deploy --no-pull     # déployer le code déjà présent, sans git pull
```

Chaque mise à jour :
1. sauvegarde la base ;
2. construit la nouvelle version à côté de celle en ligne ;
3. applique les migrations ;
4. bascule, puis vérifie que l'API répond.

Si l'API ne répond pas, le script revient seul à la version précédente.

## Ce que le script installe — et ce qu'il ne touche pas

| Élément | Gocelsys | Autres applications du serveur |
|---|---|---|
| Code en ligne | `/srv/gocelsys/releases/<date>-<commit>`, lien `current` | — |
| Photos, fichiers statiques | `/srv/gocelsys/shared/{media,static}` (conservés entre versions) | — |
| Python 3.13, Node 22 | privés : `/srv/gocelsys/tools` | versions du système inchangées |
| API | service `gocelsys-api` (gunicorn), socket Unix `/run/gocelsys/gunicorn.sock` | aucun port réservé |
| Tâches | `gocelsys-alerts.timer` (15 min), `gocelsys-backup.timer` (02:30) | — |
| Nginx | **un seul fichier** `gocelsys.conf`, testé (`nginx -t`) avant `reload`, restauré si erreur | autres sites jamais modifiés, Nginx jamais redémarré |
| PostgreSQL | rôle et base `gocelsys` | autres bases et `pg_hba.conf` inchangés |
| HTTPS | certificat Let's Encrypt `gocelsys.com` (+ alias), renouvelé par certbot | autres certificats inchangés |
| Pare-feu | jamais activé ; s'il l'est déjà, ouvre 80/443 | règles existantes conservées |
| Paquets | installe seulement ceux qui manquent | jamais d'`apt upgrade` |

Le script s'arrête sans rien changer dans ces cas :
- le port 80/443 est tenu par autre chose que Nginx ;
- un de nos domaines est déjà déclaré dans un autre site Nginx ;
- le port 5432 est pris par un PostgreSQL en conteneur.

## Fichiers utiles sur le serveur

| Fichier | Rôle |
|---|---|
| `/etc/gocelsys/gocelsys.env` | secrets et réglages (conservés à chaque mise à jour) |
| `/etc/gocelsys/admin-initial.txt` | mot de passe `admin` créé à l'installation (à changer, puis supprimer ce fichier) |
| `/srv/gocelsys/backups/` | sauvegardes de la base (avant chaque mise à jour + quotidienne) |
| `/var/log/gocelsys/deploy-*.log` | journaux des déploiements |
| `journalctl -u gocelsys-api -f` | journal de l'API en direct |

Restaurer une sauvegarde :

```bash
sudo -u postgres pg_restore --clean --if-exists -d gocelsys /srv/gocelsys/backups/<fichier>.dump
systemctl restart gocelsys-api
```

## Applications mobiles

Dans chaque app, l'adresse du serveur est `https://gocelsys.com`. Réglez-la dans `app.json → expo.extra.apiUrl` avant de construire l'APK.
