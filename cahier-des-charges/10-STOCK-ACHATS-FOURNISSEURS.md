# PROMPT 10 — Stock, achats, fournisseurs et réapprovisionnement

Audite les tables, écrans, flux fournisseurs, références de pièces et coûts existants. Définis une source de vérité unique pour chaque article, son unité, sa référence, son coût, son fournisseur privilégié, ses seuils et son stock par emplacement.

Distinguer stock physique, disponible, réservé, commandé, en transit, consommé, retourné, endommagé et ajusté. Tout changement passe par un mouvement traçable (quantité, origine, destination, motif, acteur, date, lien opérationnel). La quantité ne doit pas être modifiée uniquement par écriture libre non auditée.

Relier interventions et devis aux réservations de pièces. La réservation diminue le disponible, pas le physique. La consommation réelle crée un mouvement au moment confirmé. Annulation ou modification libère les réservations correspondantes. Éviter surréservation et commandes redondantes.

Achats : demande, proposition, commande, réception partielle/complète, facture fournisseur, retour/avoir. Les achats alimentent le stock seulement à réception confirmée ; les coûts réels sont transmis aux calculs et à la comptabilité sans double comptabilisation. Les fournisseurs et leurs documents utilisent le système documentaire central.

Les seuils créent alertes/propositions, pas commandes fermes sans validation. Tester multi-emplacements, réception partielle, doublons, unité, stock négatif, réservation concurrente, annulation, retour, hors ligne et rapprochement facture/commande.
