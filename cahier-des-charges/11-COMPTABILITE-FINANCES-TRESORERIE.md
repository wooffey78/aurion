# PROMPT 11 — Comptabilité, finances, trésorerie et prévisionnel

Audite les services et exports existants : journal, FEC, ventes/achats, cotisations, TVA, rapprochement bancaire CSV/OFX, prévisionnel et ventilation des paiements. Réutilise les fonctions actuelles et n'installe pas une seconde comptabilité parallèle.

Définir les sources de vérité et la provenance des montants : facture émise, encaissement réel, dépense, facture fournisseur, cotisation provisionnée/payée, opération bancaire importée, rapprochement suggéré/confirmé. Distinguer strictement prévisionnel, réel, engagé et rapproché. Un rapprochement suggéré n'est pas une écriture confirmée ; la validation reste révocable/auditée selon règles.

Les paiements multiples alimentent les encaissements sans duplication. Les factures émises, paiements et avoirs doivent rester cohérents avec le commerce. Les achats et dépenses se relient aux fournisseurs et documents. Le référentiel fiscal versionné fournit les paramètres et dates d'effet ; les anciennes périodes conservent les instantanés nécessaires.

Proposer tableaux mensuels/annuels, trésorerie, échéances, recettes, charges, cotisations, TVA, marge, prévisionnel et exports avec définition, période et source de chaque indicateur. Documenter les formats réellement supportés et les limites. Pas d'écriture comptable fictive ou export présenté comme officiellement validé sans test.

Tester multi-paiements, remboursements, rapprochement, dédoublonnage import, période clôturée, corrections, export FEC, arrondis, historique réglementaire et cohérence dashboard. L'accès comptable est gouverné par le module permissions.
