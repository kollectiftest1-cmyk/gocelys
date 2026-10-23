# Gocelsys — backend (Django + DRF)

## Lancer

Sous Windows, double-cliquez sur `demarrer.bat`. Sinon :

```bash
python -m venv .venv && . .venv/bin/activate      # Windows : .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo          # données de démonstration (--reset pour recommencer)
python manage.py runserver 0.0.0.0:8000
```

Python 3.12 ou plus récent est requis (Django 6.1).

## Commandes utiles

| Commande | Rôle |
|---|---|
| `python manage.py test apps` | 36 tests des règles de gestion (stock, caisse, commandes, synchro, permissions) |
| `python manage.py run_alerts` | Alertes automatiques. À planifier toutes les 15 min (`alertes.bat`) |
| `python manage.py generate_dues` | Génère les échéances des charges récurrentes (aussi fait par `run_alerts`) |
| `python manage.py rebuild_stock` | Recalcule les soldes de stock depuis le registre des mouvements |
| `python manage.py seed_demo --reset` | Réinitialise la démonstration |

## Organisation

```
config/           réglages (SQLite en dev, PostgreSQL si GOCELSYS_DB_NAME), URLs
apps/core         socle : modèles de base, journal d'audit, séquences de références, paramètres, permissions DRF
apps/accounts     utilisateurs, rôles, catalogue des permissions (catalog.py), connexion JWT
apps/agencies     agences, points de vente, zones de livraison
apps/catalog      catégories, unités, produits, conditionnements, promotions
apps/inventory    registre de stock, soldes, transferts, inventaires  → services.py
apps/sales        sessions de caisse, ventes, paiements, synchronisation hors ligne  → services.py
apps/orders       clients, adresses, commandes, affectation d'agence, boutique client  → services.py
apps/delivery     livreurs, livraisons, preuves (OTP, photo, signature)  → services.py
apps/finance      moyens de paiement, transactions, dépenses, charges, échéances  → services.py
apps/notifications notifications, jetons push, file SMS/WhatsApp, alertes automatiques
apps/reports      tableau de bord direction, rapports avec export CSV
```

Toute la logique métier est dans les `services.py`. Les vues ne font que vérifier les droits et appeler les services. Les écritures sensibles passent par `transaction.atomic` et `select_for_update`.

## API (extraits)

Toutes les routes sont sous `/api/`. L'authentification se fait par `Authorization: Bearer <jeton>`.

| Domaine | Routes |
|---|---|
| Authentification | `auth/login/` (identifiant, e-mail ou téléphone), `auth/register/` (client), `auth/refresh/`, `auth/me/`, `auth/users/`, `auth/roles/`, `auth/roles/catalog/` |
| Stock | `stock/levels/`, `stock/operations/`, `stock/movements/`, `transfers/{id}/validate·ship·receive/`, `inventories/{id}/count·submit·validate/` |
| Caisse | `cash-sessions/open/` (caisse affectée au caissier, fonds par défaut de la caisse), `cash-sessions/current/`, `cash-sessions/{id}/close·validate/`, `sales/`, `sales/{id}/cancel·refund/` |
| Hors ligne | `sync/pull/?agency=` (référentiel), `sync/push/` (opérations idempotentes) |
| Commandes | `orders/board/`, `orders/{id}/transition·assign·paid·pickup/`, `customers/` |
| Site public | `public/home/` (sans connexion : univers de la vitrine, chiffres, produits du moment, agences) · `site/showcase/` (+ `reorder/`, `featured/`, multipart `upload`) — `site.manage` |
| Photos | `products/{id}/image/` : POST multipart `file`, DELETE pour retirer — `products.manage` |
| Catalogue | `categories/` (+ `reorder/`), `units/`, `products/` — écriture réservée à `categories.manage` / `products.manage` |
| Boutique client | `shop/bootstrap/`, `shop/catalog/?agency=`, `shop/orders/`, `shop/addresses/`, `shop/promo/`, `shop/profile/` |
| Livreur | `my/deliveries/`, `my/deliveries/{id}/status·confirm/`, `my/deliveries/availability/` |
| Finances | `finance/treasury/`, `finance/transactions/`, `expenses/{id}/approve·reject·pay/`, `charges/`, `dues/calendar/`, `dues/{id}/pay/` |
| Pilotage | `dashboard/?period=today\|7d\|30d\|month`, `reports/{sales\|stock\|finance\|orders\|deliveries}/?format_type=csv`, `audit/`, `settings/` |
