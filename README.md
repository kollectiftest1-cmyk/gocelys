# Gocelsys — système intégré de gestion commerciale

Site public et boutique en ligne, ventes, POS, caisses, stocks, transferts, commandes, livraisons, finances et pilotage multi-agences pour Gocelsys, entreprise de distribution de produits du quotidien : eau, papier (mouchoirs, papier hygiénique, serviettes), boissons, épicerie et entretien de la maison.
Construit d'après le *Cahier des charges fonctionnel et technique v1.0* (octobre 2026).

```
Joda/
├── backend/                 API Django + DRF : règles de gestion, RBAC, audit, synchronisation hors ligne
├── web/                     Site public + boutique + espace client + administration (React)
├── mobile/
│   ├── mobile-entreprise/   App Expo du personnel : caisse hors ligne, stock, livreur
│   └── mobile-exterieur/    App Expo des clients : catalogue, panier, commande, suivi
├── deploy/                  deploy.sh : installation et mises à jour sur le VPS (voir deploy/README.md)
├── scripts/                 sync-deploy-branch.sh, publier-vps.sh
├── publier-vps.bat          Publier une version (main → deploy → GitHub → serveur)
├── docs/captures/           Aperçus des écrans
└── demarrer-gocelsys.bat        Lance l'API et le web en un double-clic
```

## Démarrage rapide (Windows)

Prérequis : **Python 3.12+** et **Node.js 20+**.

1. Double-cliquez sur `demarrer-gocelsys.bat` à la racine. Au premier lancement, le script :
   - crée l'environnement Python ;
   - installe les dépendances ;
   - crée la base SQLite et charge 30 jours de données de démonstration.

   Comptez 2 à 3 minutes.
2. Le navigateur s'ouvre sur http://localhost:5173 : c'est le **site public** (présentation Gocelsys en 3D, catalogue, panier). Le bouton « Se connecter » sert à tout le monde :
   - un **client** arrive sur « Mon compte » (commandes, suivi, adresses, points fidélité) ;
   - un **membre du personnel** arrive sur le tableau de bord de gestion (`/tableau-de-bord`).
3. Pour les applications mobiles, lancez `mobile/mobile-entreprise/demarrer.bat` ou `mobile/mobile-exterieur/demarrer.bat`, puis scannez le QR code avec **Expo Go**. Sur l'écran de connexion, touchez « Serveur » et saisissez `http://IP-DE-VOTRE-PC:8000` (commande `ipconfig`, ligne « Adresse IPv4 »).

### Comptes de démonstration

Tous les comptes ont le mot de passe `gocelsys2026`. Le code PIN caisse est `1234`.

| Identifiant | Rôle | Où l'utiliser |
|---|---|---|
| `admin` | Administrateur général | Web |
| `direction` | Direction : pilotage, validations, catégories et unités | Web |
| `resp.matadi` | Responsable de l'agence Matadi Centre | Web et app entreprise |
| `caisse.matadi` | Caissier Matadi, affecté à « Caisse 1 » | App entreprise (caisse) ou web (/caisse) |
| `stock.depot` | Gestionnaire de stock du dépôt central | App entreprise (stock) |
| `livreur.matadi` | Livreur Matadi, tournée du jour en cours | App entreprise (livraisons) |
| `0820000101` | Cliente « Mme Lusamba Nkembo » | Site web ou app extérieure |

## Ce qui a changé en v1.1

- **Nom et identité** : l'application s'appelle **Gocelsys**. Palette « Indigo » inspirée de Sellsy (nuit #14123A, violet #4B35E0, lavande #F4F2FF, corail #F25A3C), police Plus Jakarta Sans, sur le web et les deux apps.
- **Entreprise multi-produits** : catalogue de démonstration de 19 articles répartis en 4 univers (Eau et boissons, Hygiène et papier, Alimentation, Entretien de la maison) avec sous-catégories.
- **Site public** (`/`) : vitrine 3D animée au défilement (bouteille d'eau, boîte de mouchoirs, canette, flacon de savon), produits du moment, étapes de commande, offre pro, agences. Puis `/boutique`, `/boutique/:id`, `/panier`, `/mon-compte`.
- **Catégories et unités** (web → Catalogue → « Catégories et unités », route `/catalogue`) : la direction et l'administrateur créent, renomment, réordonnent, désactivent ou suppriment catégories, sous-catégories et unités. Permission `categories.manage`. Une catégorie ou une unité utilisée par des produits ne peut pas être supprimée (désactivez-la).
- **Caissier affecté à sa caisse** : chaque caissier est rattaché à une caisse de son agence (web → Utilisateurs et rôles → « Caisse affectée »). À l'ouverture, il n'a plus rien à choisir. Seuls les responsables (permission `cash.validate`) peuvent ouvrir une autre caisse, pour un remplacement.
- **Fonds de caisse par défaut** : chaque caisse a un fonds habituel (web → Agences → fiche agence → Caisses), proposé à l'ouverture.

## Site public et photos des produits (v1.2)

**Vitrine 3D de l'accueil** — web → Logistique → **Site public** (permission `site.manage` : direction et administrateur).
- Chaque « univers » (Eau, Papier, Boissons, Maison…) se crée, se modifie, se réordonne, se masque ou se supprime. De 1 à 6 univers visibles.
- Pour chacun : mot géant, titre, texte d'accroche, couleur de fond, catégorie ouverte par le bouton « Voir ces produits », et l'objet 3D :
  bouteille, boîte, canette, flacon pompe (teintés à la couleur, avec le texte d'étiquette choisi) ou **la photo détourée d'un produit**.
- Onglet « Produits mis en avant » : 12 produits au plus dans « Les incontournables du moment ».

**Photo d'un produit** — web → Produits → fiche produit → « Photo du produit » (permission `products.manage`).
La photo remplace l'illustration partout : site, panier, caisse web, app client. « Retirer la photo » revient à l'illustration.

| | Photo produit | Photo de vitrine (objet « Ma photo ») |
|---|---|---|
| Format | PNG ou WebP détouré conseillé ; JPG accepté | PNG ou WebP **détouré obligatoire** |
| Cadrage | Carré, 1200 × 1200 px (600 px minimum) | Vertical, 1200 × 1600 px (900 px de haut minimum) |
| Contenu | Produit seul, centré, de face, ~80 % de la hauteur | Produit seul, net, sans ombre portée |
| Poids | 8 Mo maximum | 8 Mo maximum |

Le serveur redresse l'image, la recadre au ras du produit si elle est détourée, la réduit à 1200 px et la convertit en WebP.
Une photo détourée est posée sur la couleur du produit ; une photo à fond plein est affichée en plein cadre.
En production, servez `backend/media/` par Nginx (avec l'en-tête `Access-Control-Allow-Origin` si le site et l'API sont sur deux domaines : la vitrine 3D charge la photo comme texture).

## Fonds de caisse et calcul des écarts

**Le fonds de caisse** est la monnaie posée dans le tiroir avant la première vente, pour pouvoir rendre la monnaie (par exemple 50 000 FC en petites coupures). À l'ouverture, l'application propose le fonds habituel de la caisse ; le caissier compte réellement le tiroir et corrige le montant si besoin. Ce montant est enregistré dans le journal d'audit.

**À la clôture**, l'application calcule le **montant théorique en espèces** :

```
théorique = fonds de caisse
          + espèces encaissées (ventes, déjà nettes de la monnaie rendue ; apports)
          − espèces sorties (remboursements, dépenses payées en caisse, retraits)
```

Les paiements Mobile Money (M-Pesa, Orange, Airtel) et carte ne sont **pas** dans le tiroir : ils sont contrôlés séparément par leur référence.

Le caissier saisit ensuite ce qu'il **compte réellement**, billet par billet (billetage). L'**écart = compté − théorique** :
- écart = 0 : la caisse est juste ;
- écart > 0 : excédent (souvent une monnaie non rendue) ;
- écart < 0 : manquant.

Dès que l'écart n'est pas nul, une **justification est obligatoire**. Si l'écart dépasse le seuil d'alerte (5 000 FC par défaut, réglable dans Paramètres), les responsables reçoivent une alerte. Le responsable **valide** ensuite la session, et la clôture est tracée dans le journal d'audit.

Exemple : fonds 50 000 FC, ventes en espèces 412 000 FC, un remboursement de 2 500 FC → théorique 459 500 FC. Le caissier compte 458 500 FC → écart −1 000 FC, à justifier.

## Architecture

```
 App client (Expo) ─┐                         ┌─ Web admin (React + Vite)
                    ├──► API REST Django ◄────┤
 App entreprise ────┘    JWT · RBAC · audit   └─ Admin technique Django
   │ SQLite local           │
   │ file d'opérations      ▼
   └── /sync/push ──►  PostgreSQL (prod) / SQLite (dev)
```

### Choix structurants

**Le stock est un registre de mouvements (règle 2).** On ne modifie jamais une quantité directement. Chaque vente, réservation, transfert, perte ou correction crée un mouvement daté, signé et motivé, qui conserve l'avant, l'après et l'écart. Les soldes sont un cache recalculable avec `python manage.py rebuild_stock`. Six compartiments sont suivis par agence : disponible, réservé, en transfert, endommagé, perdu, retourné.

**Les conditionnements sont convertis en unité de base.** Un carton de 24 vend 24 bouteilles. Le stock est toujours tenu dans l'unité la plus petite, ce qui évite toute erreur de conversion (§7).

**La caisse fonctionne hors ligne (§32).** L'app entreprise enregistre toutes les opérations de caisse dans une file SQLite locale, en ligne comme hors ligne. Il n'y a donc qu'un seul chemin, testé en permanence :
- **Opérations concernées** : ouverture, ventes, clôture.
- **Identifiants** : chaque opération porte un `op_id` unique, et chaque vente un `client_uuid`.
- **Doublons** : le serveur applique chaque opération une seule fois, ce qui rend les renvois sans danger.
- **Ordre et références** : les opérations sont appliquées dans l'ordre et le serveur renvoie la référence définitive. Le ticket local HL-1019-0001 devient VTE-MAT-261019-0010.
- **Stock** : une vente hors ligne est acceptée même si le stock passe en négatif. Elle a réellement eu lieu, et une alerte est émise.
- **Refus** : une opération refusée s'affiche dans « Mon compte » pour correction.

**Permissions par agence (RBAC, §5).** Les droits sont 45 codes « module.action » regroupés en rôles. Un rôle s'attribue globalement ou pour une agence, et toutes les listes de l'API sont filtrées selon le périmètre de l'utilisateur. Les rôles se modifient depuis le web (Utilisateurs et rôles → Rôles et permissions).

**Journal d'audit en écriture seule (§30.1).** Il enregistre qui a fait quoi, quand, sur quelle agence et sur quel élément, avec l'ancienne et la nouvelle valeur. Le modèle refuse toute modification ou suppression.

**Finances séparées du commercial (règle 10).** Le chiffre d'affaires vient des ventes et des commandes. Les entrées et sorties d'argent sont dans un registre distinct, qui consolide les montants en CDF au taux du jour. Les montants en USD (loyers, abonnements) sont gérés.

## Couverture du cahier des charges

| § | Module | Où |
|---|---|---|
| 5 | Rôles et permissions RBAC | `accounts` · web Utilisateurs et rôles |
| 6 | Agences, POS, zones | `agencies` · web Agences |
| 7 | Produits, unités, conversions, promotions | `catalog` · web Produits |
| 8–10 | Stock, mouvements, inventaires, transferts | `inventory` · web Stocks/Transferts/Inventaires · app Stock |
| 11–12 | POS, ventes, sessions de caisse, écarts | `sales` · web Caisse et Sessions · app Caisse |
| 13–17 | Commandes, affectation d'agence, réservation, livraison, retrait | `orders`, `delivery` · web Commandes/Livraisons · apps |
| 18 | Clients et fidélité | `orders.Customer` · web Clients · app client |
| 19–25 | Entrées, dépenses, charges récurrentes, échéances, calendrier, trésorerie | `finance` · web Finances |
| 26–27 | Rapports (export CSV) et tableau de bord direction | `reports` · web |
| 28 | Alertes : stock, caisses, livraisons, transferts, échéances | `notifications` · `alertes.bat` |
| 29 | Promotions, codes, points de fidélité | `catalog.Promotion`, fidélité client |
| 30–31 | Sécurité, journal, validations par seuil | `core.AuditLog`, seuils dans Paramètres |
| 32 | Hors connexion et synchronisation | `sales.sync_push` · app entreprise |
| 36 | Les 10 règles de gestion | services métier + 36 tests automatiques |

## Points à valider avec Gocelsys

- **Paiements** : quels opérateurs Mobile Money retenir, et faut-il une intégration API pour confirmer automatiquement. Aujourd'hui, la référence de transaction est saisie et vérifiable.
- **Notifications** :
  - Les push Expo sont branchés.
  - Les SMS et WhatsApp sont mis en file : il faut choisir le fournisseur et le brancher dans `notifications/services.py → dispatch_outbound`.
- **Devise** : le CDF est la devise de référence, l'USD est accepté pour les charges, avec un taux paramétrable.
- **Matériel** : choisir l'imprimante de tickets (impression navigateur 72 mm prête) et le lecteur de codes-barres (la caméra est déjà gérée).
- **Approvisionnement fournisseurs** : hors périmètre v1 comme prévu. Le registre de mouvements accepte déjà un type « réception ».

## Branches Git et mise en ligne sur le VPS

| Branche | Contenu | Usage |
|---|---|---|
| `main` | tout le projet : backend, web, mobile-entreprise, mobile-exterieur, docs | travail quotidien |
| `deploy` | `backend/`, `web/`, `deploy/` seulement | ce que le VPS récupère ; **générée** depuis `main`, ne pas modifier à la main |

**Publier** : double-cliquez sur `publier-vps.bat`. Il fait quatre choses :
1. commit sur `main` ;
2. reconstruction de `deploy` ;
3. envoi sur GitHub ;
4. mise à jour du serveur si vous le confirmez.

Depuis Git Bash, la commande équivalente est `bash scripts/publier-vps.sh "message"`.

**Serveur** : voir [`deploy/README.md`](deploy/README.md). La première installation se fait en une commande. Ensuite, `sudo gocelsys-deploy` suffit.

## Mise en production

- **Backend et web** : entièrement automatisé par `deploy/deploy.sh`, qui configure Nginx, HTTPS, PostgreSQL, gunicorn, les alertes et les sauvegardes. Voir `deploy/README.md`.
- **Mobile** : `npx eas-cli build -p android` pour chaque app, avec `https://gocelsys.com` dans `app.json → extra.apiUrl`.

Le détail de chaque partie est dans `backend/README.md`, `web/README.md` et `mobile/README.md`.

## Après une mise à jour

Les modèles ont changé (catégories, caisses, affectation des caissiers). Double-cliquez sur `backend/reinitialiser-demo.bat` : il applique les migrations et recharge la démonstration Gocelsys.
