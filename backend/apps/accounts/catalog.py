"""
Catalogue des permissions Gocelsys (RBAC, cahier des charges §5).

Chaque permission est un code « module.action ». Les rôles regroupent des codes ;
une affectation (UserRole) lie un utilisateur à un rôle, globalement ou pour une agence.
"""

PERMISSIONS = {
    # Administration
    "agencies.view": "Consulter les agences",
    "agencies.manage": "Créer, modifier, suspendre les agences et POS",
    "users.view": "Consulter les utilisateurs",
    "users.manage": "Créer et suspendre des utilisateurs",
    "roles.manage": "Gérer les rôles et permissions",
    "settings.manage": "Modifier les paramètres",
    "audit.view": "Consulter le journal d'activité",
    # Produits
    "products.view": "Consulter les produits",
    "products.manage": "Créer et modifier les produits",
    "prices.manage": "Modifier les prix",
    "products.delete": "Archiver un produit",
    "categories.manage": "Gérer les catégories et les unités",
    "site.manage": "Gérer le site public (vitrine 3D, produits mis en avant)",
    # Stocks
    "stock.view": "Consulter le stock",
    "stock.adjust": "Corriger le stock manuellement",
    "stock.adjust_large": "Valider une correction importante",
    "stock.loss": "Enregistrer pertes et détériorations",
    "inventory.manage": "Réaliser des inventaires",
    "inventory.validate": "Valider un inventaire",
    "transfers.request": "Demander un transfert",
    "transfers.validate": "Valider un transfert",
    "transfers.ship": "Préparer et expédier un transfert",
    "transfers.receive": "Réceptionner un transfert",
    # POS / ventes / caisses
    "sales.view": "Consulter les ventes",
    "sales.create": "Vendre au POS",
    "sales.discount": "Accorder une remise",
    "sales.cancel": "Annuler une vente",
    "sales.refund": "Rembourser une vente",
    "cash.operate": "Ouvrir et clôturer sa caisse",
    "cash.view": "Consulter les caisses",
    "cash.validate": "Valider une clôture et ses écarts",
    # Commandes / clients
    "orders.view": "Consulter les commandes",
    "orders.manage": "Accepter, préparer et suivre les commandes",
    "orders.cancel": "Annuler ou refuser une commande",
    "customers.view": "Consulter les clients",
    "customers.manage": "Modifier les clients",
    # Livraisons
    "deliveries.view": "Consulter les livraisons",
    "deliveries.manage": "Affecter les livreurs, gérer zones et frais",
    "deliveries.drive": "Effectuer des livraisons (livreur)",
    # Finances
    "finance.view": "Consulter les finances et la trésorerie",
    "finance.manage": "Enregistrer entrées et sorties",
    "expenses.create": "Saisir une dépense",
    "expenses.approve": "Valider une dépense",
    "charges.manage": "Gérer les charges récurrentes et échéances",
    # Pilotage
    "dashboard.view": "Voir le tableau de bord",
    "reports.view": "Générer les rapports",
    "promotions.manage": "Gérer promotions et fidélité",
}

ALL = list(PERMISSIONS)

ROLE_PRESETS = {
    "admin": {
        "name": "Administrateur général",
        "scope": "global",
        "permissions": ALL,
    },
    "direction": {
        "name": "Direction",
        "scope": "global",
        "permissions": [
            "agencies.view", "products.view", "categories.manage", "site.manage", "stock.view", "sales.view", "cash.view",
            "orders.view", "customers.view", "deliveries.view", "finance.view",
            "dashboard.view", "reports.view", "audit.view", "expenses.approve",
            "transfers.validate", "inventory.validate", "stock.adjust_large", "cash.validate",
        ],
    },
    "agency_manager": {
        "name": "Responsable d'agence",
        "scope": "agency",
        "permissions": [
            "agencies.view", "users.view", "products.view", "stock.view", "stock.adjust",
            "stock.loss", "inventory.manage", "inventory.validate", "transfers.request",
            "transfers.validate", "transfers.ship", "transfers.receive", "sales.view",
            "sales.create", "sales.discount", "sales.cancel", "sales.refund", "cash.operate",
            "cash.view", "cash.validate", "orders.view", "orders.manage", "orders.cancel",
            "customers.view", "deliveries.view", "deliveries.manage", "finance.view",
            "expenses.create", "dashboard.view", "reports.view",
        ],
    },
    "cashier": {
        "name": "Caissier / Agent POS",
        "scope": "agency",
        "permissions": ["products.view", "stock.view", "sales.view", "sales.create", "cash.operate", "orders.view"],
    },
    "stock_keeper": {
        "name": "Gestionnaire de stock",
        "scope": "agency",
        "permissions": [
            "products.view", "stock.view", "stock.loss", "inventory.manage",
            "transfers.request", "transfers.ship", "transfers.receive", "orders.view",
        ],
    },
    "driver": {
        "name": "Livreur",
        "scope": "agency",
        "permissions": ["deliveries.drive"],
    },
}
