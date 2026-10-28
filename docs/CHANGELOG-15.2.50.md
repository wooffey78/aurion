# Aurion 15.2.50 — palette bleutée, catalogue repliable et retrait de la vérification e-mail

## Changements ciblés
- Adoucit le fond avec un blanc légèrement bleuté et fonce les textes vers un bleu profond pour améliorer la lisibilité.
- Corrige le repli initial du Catalogue métier : les contenus portant l’attribut HTML `hidden` sont explicitement masqués malgré les règles `display:grid/flex`; Déployer/Rétracter contrôle leur état réel.
- Annule la vérification d’adresse e-mail et rétablit l’inscription/connexion précédentes.
- Conserve la migration 061 intacte et ajoute la migration 062 pour supprimer de manière additive les objets temporaires liés à la vérification e-mail.
- Met à jour les marqueurs de version et de cache vers 15.2.50.

## Contrôles
- Tests contractuels de retrait de la vérification e-mail.
- Tests du catalogue : repli initial et règle CSS du contenu masqué.
- Build TypeScript Render et contrôle de santé après migrations.
