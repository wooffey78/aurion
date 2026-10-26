# Aurion 15.2.26 — étape 2

## Frais kilométriques

- Ajout dans la création/modification d’un devis ou d’une facture de la distance en km et du tarif €/km.
- Calcul instantané `km × €/km` dans le calculateur Aurion.
- Intégration du montant dans le HT, la TVA, les cotisations et la marge nette, sans modifier le coût d’achat des pièces.
- Persistance de `mileage_km`, `mileage_rate` et `mileage_total` sur le document.
- Affichage des frais kilométriques dans les documents natifs PDF/DOCX/ODT.
- Ajout des champs `MILEAGE_KM`, `MILEAGE_RATE` et `MILEAGE_TOTAL` pour les modèles personnels.
- Report dans le détail comptable PDF/CSV et dans les sous-sections Devis & factures, Comptabilité et Trésorerie prévisionnelle.

## Non-régression

- Étape construite à partir de `Aurion-15.2.25-step1.zip`.
- Les fonctions de forme juridique/cotisations de l’étape 1 sont conservées strictement.
- Nouvelle migration additive : `028_quote_mileage.sql`.
