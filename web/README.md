# Gocelsys — site public, boutique et administration (React + Vite)

```bash
npm install
npm run dev        # http://localhost:5173 — /api est relayé vers http://127.0.0.1:8000
npm run build      # production : dist/ (VITE_API_URL=https://api.gocelsys.cd si l'API est sur un autre domaine)
```

Sous Windows, vous pouvez aussi lancer `demarrer.bat`.

## Partie publique (sans connexion)

| Route | Contenu |
|---|---|
| `/` | Vitrine 3D (three.js + GSAP) : quatre univers de produits qui défilent au scroll, produits du moment, étapes de commande, offre pro, agences |
| `/boutique`, `/boutique/:id` | Catalogue de l'agence choisie avec prix, stock et conditionnements |
| `/panier` | Panier conservé dans le navigateur ; connexion demandée au moment de commander |
| `/connexion`, `/inscription` | Connexion unique : client → `/mon-compte`, personnel → `/tableau-de-bord` |
| `/mon-compte` | Commandes en cours et historique, suivi, adresses, points fidélité |

Le code est dans `src/public/` (`showcase3d.js` contient les modèles 3D). Si WebGL est indisponible ou si l'utilisateur a demandé à réduire les animations, des illustrations fixes prennent le relais.

## Espace de gestion

- **Tableau de bord** :
  - chiffre d'affaires et tendance ;
  - commandes, livraisons, caisses ouvertes ;
  - encaissements par jour ;
  - ventes par agence ;
  - niveaux critiques et alertes.
- **Caisse** : POS web pour un ordinateur d'agence (scan, conditionnements, paiements, monnaie, ticket 72 mm). **Ventes POS** et **Sessions de caisse** : billetage, écart, validation.
- **Commandes** : tableau de préparation (Kanban) et historique. Le détail permet d'accepter, préparer, affecter un livreur, encaisser et remettre une commande contre code. La saisie de commandes reçues par téléphone ou WhatsApp est possible.
- **Stocks** :
  - matrice produits × agences avec jauges « niveau d'eau » ;
  - registre des mouvements ;
  - opérations : production, perte, casse, correction avec justificatif ;
  - **Transferts** et **Inventaires**.
- **Finances** :
  - trésorerie consolidée en CDF ;
  - dépenses avec validation par seuil ;
  - charges récurrentes et calendrier des échéances.
- **Catégories et unités** (`/catalogue`, direction et administrateur) : arborescence catégories › sous-catégories, couleurs, icônes, ordre, unités de vente.
- **Administration** :
  - agences, caisses (fonds habituel) et zones ;
  - utilisateurs (avec la caisse affectée à chaque caissier) et matrice des permissions par rôle ;
  - journal d'activité avec l'avant et l'après ;
  - paramètres (taux USD, seuils, affectation des commandes, moyens de paiement).
- **Rapports** : ventes, stock, finances, commandes et livraisons, avec filtres et export CSV.

Le menu s'adapte aux permissions de l'utilisateur. Le sélecteur d'agence, en haut, filtre tous les écrans.

## Design

Le système visuel s'appelle « Indigo », inspiré de Sellsy :
- **Couleurs** : nuit #14123A, violet #4B35E0 (actions), lavande #F4F2FF (fonds), corail #F25A3C (promotions, points), ciel #22C3E6, vert #16B36A.
- **Typographie** : Plus Jakarta Sans, incluse localement.
- **Jetons** : `src/styles/tokens.css`, partagés avec les apps mobiles (`src/lib/theme.js`).
