export const ORDER = {
  confirmed: ["Reçue", "coral"],
  accepted: ["Acceptée", "brand"],
  preparing: ["En préparation", "sky"],
  ready: ["Prête", "leaf"],
  driver_assigned: ["Livreur en chemin", "sky"],
  in_delivery: ["En livraison", "sky"],
  delivered: ["Livrée", "leaf"],
  completed: ["Terminée", "leaf"],
  cancelled: ["Annulée", "neutral"],
  refused: ["Refusée", "clay"],
  failed: ["Livraison échouée", "clay"],
  refunded: ["Remboursée", "amber"],
};

export const DELIVERY_STEPS = [
  ["confirmed", "Commande reçue", "L'agence a bien reçu votre commande."],
  ["accepted", "Acceptée", "Vos produits sont réservés."],
  ["preparing", "Préparation", "L'équipe prépare votre commande."],
  ["in_delivery", "En route", "Le livreur arrive chez vous."],
  ["completed", "Livrée", "Bonne dégustation !"],
];

export const PICKUP_STEPS = [
  ["confirmed", "Commande reçue", "L'agence a bien reçu votre commande."],
  ["accepted", "Acceptée", "Vos produits sont réservés."],
  ["preparing", "Préparation", "L'équipe prépare votre commande."],
  ["ready", "Prête à retirer", "Présentez votre code de retrait au comptoir."],
  ["completed", "Retirée", "Merci et à bientôt !"],
];

export const STEP_INDEX = { confirmed: 0, accepted: 1, preparing: 2, ready: 3, driver_assigned: 3, in_delivery: 3, delivered: 4, completed: 4 };
