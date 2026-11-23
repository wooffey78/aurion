# PROMPT 03 — Moteur économique, tarification, coûts et rentabilité

Audite le moteur de calcul existant, notamment les calculs en centimes/BigInt, les coûts de pièces, frais, expédition, main-d'œuvre, déplacement, TVA, cotisations, marges, prix minimum et avertissements de vente à perte. Réutilise le moteur de référence au lieu de recopier des formules dans les écrans.

Centraliser les règles et fonctions de calcul avec entrées/sorties typées, unités documentées, arrondis déterministes et version de paramètres. Distinguer systématiquement coût prévisionnel/réel, montant HT/TTC, montant facturé/encaissé, marge brute/résultat estimé et cotisation provisionnée/payée. Chaque résultat important doit pouvoir être expliqué par ses composantes.

Couvrir prix conseillé, prix plancher, coût de revient, marge, taux de marge, taux de marque, frais fixes/variables, déplacement, temps passé, consommables, coûts d'achat, réductions et taxes. Le moteur doit pouvoir être appelé par devis, factures, interventions, stock, achats, comptabilité et dashboard.

Un document commercial émis conserve son instantané historique des paramètres et du résultat calculé. Une mise à jour réglementaire ne réécrit pas les anciens documents. Les calculs prévisionnels peuvent être recalculés, avec indication de la date et des hypothèses.

Fournir des jeux de référence, tests aux limites (zéro, négatifs interdits, gros montants, centimes, arrondis, TVA multiple, remise, paiement partiel), tests différentiels contre la version actuelle et documentation des formules. Aucun chiffre affiché ne doit être estimé sans l'indiquer. Pas d'IA.
