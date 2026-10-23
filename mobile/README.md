# Gocelsys — applications mobiles (Expo SDK 58, JavaScript, Expo Router)

| App | Pour qui | Contenu |
|---|---|---|
| `mobile-entreprise` | Caissiers, gestionnaires de stock, livreurs, responsables | Caisse **hors ligne** (SQLite + synchronisation ; le caissier ouvre directement la caisse qui lui est affectée, avec le fonds habituel proposé), scan code-barres, clôture avec billetage, stock (niveaux, pertes, inventaires, transferts), tournée du livreur (appel, itinéraire, preuve par code OTP ou photo) |
| `mobile-exterieur` | Clients | Inscription par téléphone, choix de l'agence, catalogue multi-produits (eau, papier, boissons, épicerie, maison) avec les mêmes illustrations que le site, formats (pack, carton), panier, livraison ou retrait, Mobile Money ou espèces, code promo, suivi en temps réel, code de livraison ou de retrait, fidélité, recommande |

## Lancer

```bash
cd mobile-entreprise     # ou mobile-exterieur
npm install
npx expo start           # QR code → Expo Go (Android) ou appareil photo (iPhone)
```

Sur l'écran de connexion, touchez **Serveur** et saisissez l'adresse du backend sur le réseau local, par exemple `http://192.168.1.10:8000`. L'adresse par défaut se règle dans `app.json → expo.extra.apiUrl`.

- Les modules utilisés (SQLite, caméra, localisation, stockage sécurisé, état du réseau) sont inclus dans Expo Go.
- Pour une version installable : `npx eas-cli@latest build -p android --profile preview`.
- `npx expo start --web` ouvre un aperçu navigateur. Sur le web, l'app entreprise utilise un stockage local à la place de SQLite (`src/lib/db.web.js`).

## App entreprise : fonctionnement hors ligne

1. Au démarrage et à chaque retour du réseau, `sync/pull` télécharge le catalogue, les prix, le stock de l'agence et les moyens de paiement.
2. Ouverture de caisse, ventes et clôture sont écrites dans la table `outbox` (`src/lib/db.js`) avec un `op_id` unique, puis envoyées dans l'ordre par `src/lib/sync.js` : immédiatement si le réseau est là, sinon dès son retour (NetInfo + toutes les 20 s).
3. Le badge en haut de la caisse indique en permanence l'état : *Synchronisé*, *Envoi · n*, *Hors ligne · n*, ou *n à vérifier* si le serveur a refusé une opération.
4. On ne peut pas se déconnecter tant qu'une caisse est ouverte ou que des opérations attendent d'être envoyées.

Les deux apps utilisent la charte « Indigo » de Gocelsys (`src/lib/theme.js`) et la police Plus Jakarta Sans.
