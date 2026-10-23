/** Libellés et tonalités des statuts métier. */
export const ORDER_STATUS = {
  draft: ["Brouillon", ""],
  confirmed: ["Nouvelle", "coral"],
  accepted: ["Acceptée", "brand"],
  preparing: ["En préparation", "sky"],
  ready: ["Prête", "leaf"],
  driver_assigned: ["Livreur affecté", "brand"],
  in_delivery: ["En livraison", "sky"],
  delivered: ["Livrée", "leaf"],
  completed: ["Terminée", "leaf"],
  cancelled: ["Annulée", ""],
  refused: ["Refusée", "clay"],
  failed: ["Échouée", "clay"],
  refunded: ["Remboursée", "amber"],
};

export const ORDER_ACTIONS = {
  accepted: "Accepter",
  preparing: "Lancer la préparation",
  ready: "Marquer prête",
  driver_assigned: "Affecter un livreur",
  completed: "Clôturer",
  refused: "Refuser",
  cancelled: "Annuler",
  in_delivery: "Départ en livraison",
};

export const DELIVERY_STATUS = {
  assigned: ["Affectée", "brand"],
  accepted: ["Acceptée", "sky"],
  picked_up: ["Colis récupéré", "sky"],
  en_route: ["En route", "sky"],
  delivered: ["Livrée", "leaf"],
  failed: ["Échouée", "clay"],
  cancelled: ["Annulée", ""],
};

export const TRANSFER_STATUS = {
  requested: ["Demandé", "coral"],
  validated: ["Validé", "brand"],
  preparing: ["En préparation", "sky"],
  shipped: ["En route", "sky"],
  received: ["Réceptionné", "leaf"],
  closed: ["Clôturé", "leaf"],
  cancelled: ["Annulé", ""],
  rejected: ["Refusé", "clay"],
};

export const SALE_STATUS = {
  completed: ["Encaissée", "leaf"],
  cancelled: ["Annulée", "clay"],
  refunded: ["Remboursée", "amber"],
  partial_refund: ["Remb. partiel", "amber"],
};

export const SESSION_STATUS = {
  open: ["Ouverte", "sky"],
  closed: ["Clôturée", "amber"],
  validated: ["Validée", "leaf"],
};

export const EXPENSE_STATUS = {
  draft: ["Brouillon", ""],
  pending: ["À valider", "coral"],
  approved: ["Validée", "brand"],
  paid: ["Payée", "leaf"],
  rejected: ["Refusée", "clay"],
};

export const DUE_STATUS = {
  upcoming: ["À venir", "brand"],
  due_soon: ["Échéance proche", "amber"],
  overdue: ["En retard", "clay"],
  paid: ["Payée", "leaf"],
  cancelled: ["Annulée", ""],
};

export const AGENCY_STATUS = {
  active: ["Active", "leaf"],
  suspended: ["Suspendue", "amber"],
  closed_temp: ["Fermée temporairement", "amber"],
  closed: ["Fermée", ""],
};

export const INVENTORY_STATUS = {
  draft: ["Comptage en cours", "sky"],
  submitted: ["À valider", "coral"],
  validated: ["Validé", "leaf"],
  cancelled: ["Annulé", ""],
};

export const MOVEMENT_TONE = {
  sale: "brand",
  order_out: "brand",
  production: "leaf",
  initial: "leaf",
  transfer_in: "leaf",
  transfer_out: "sky",
  reservation: "amber",
  release: "amber",
  loss: "clay",
  damage: "clay",
  inventory: "coral",
  correction: "coral",
  sale_cancel: "",
  return: "",
  transfer_gap: "clay",
};
