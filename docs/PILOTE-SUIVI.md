# Suivi du pilote 10 clients — mesures hebdomadaires et critères de décision (PROMPT F3/F5)

**Règle de mesure** : toute métrique provient de l'application (console admin, compteurs) ou d'une déclaration datée du client (verbatim). **Aucune valeur estimée ni inventée** : une donnée absente reste vide. Les critères de go/no-go sont écrits AVANT le début du pilote (ci-dessous, section F5) et ne sont pas réajustés en cours de route.

## F3 — Tableau hebdomadaire (une ligne par client, mise à jour chaque semaine)

| Client | Profil | Onboardé le | 1ʳᵉ facture émise (délai) | Actif S48 | Docs émis / semaine | Portail utilisé | Tickets (gravité) | Verbatim de la semaine | NPS M1/M2/M3 |
|---|---|---|---|---|---|---|---|---|---|
| Pilot-01 | | | | | | | | | |
| Pilot-02 | | | | | | | | | |
| Pilot-03 | | | | | | | | | |
| Pilot-04 | | | | | | | | | |
| Pilot-05 | | | | | | | | | |
| Pilot-06 | | | | | | | | | |
| Pilot-07 | | | | | | | | | |
| Pilot-08 | | | | | | | | | |
| Pilot-09 | | | | | | | | | |
| Pilot-10 | | | | | | | | | |

Définitions :
- **Actif à la semaine** : ≥ 1 document émis dans la semaine (émission = facture créée via « Facturer »).
- **Portail utilisé** : ≥ 1 devis partagé ET ≥ 1 accès ouvert sur le portail.
- **Verbatim** : la phrase du client la plus signifiante de la semaine, mot pour mot.
- **NPS** : e-mail simple le dernier vendredi du mois (« Recommanderiez-vous Aurion à un collègue ? 0-10 »).

## F4 — Journal des retours et triage

| Date | Client | Retour | Triage (BUG / ÉVOLUTION / ÉDUCATIF) | Action | Version livrée |
|---|---|---|---|---|---|

Règles : une question posée **≥ 2 fois** rejoint docs/GUIDE-DEMARRAGE-CLIENT.md ; un bug vu **≥ 2 fois** déclenche un test de non-régression dédié ; tout correctif passe par la chaîne complète (tests, typecheck, livraison versionnée) — jamais de correctif direct en base.

## F5 — Critères de go/no-go (mesurés à la semaine 12, écrits dès la semaine 1)

Le pilote est **réussi** si TOUS les critères sont atteints :

1. **≥ 7 clients sur 10** actifs à la semaine sur les 4 dernières semaines consécutives ;
2. **≥ 5 clients** déclarent vouloir souscrire à 39 €/mois (déclaration datée, colonne verbatim + case dédiée ci-dessous) ;
3. **Zéro incident de données** (aucune perte, aucune fuite inter-entreprises, aucune restauration d'urgence) ;
4. **Zéro bug P1 ouvert depuis plus de 7 jours** ;
5. **Temps médian jusqu'à la première facture émise ≤ 48 h** après l'onboarding ;
6. **Recette de restauration rejouée avec succès pendant le pilote** (au moins une fois) ;
7. **SLA 48 h respecté sur ≥ 90 % des tickets**.

| Critère | Résultat mesuré | Atteint ? |
|---|---|---|
| 1. Actifs consécutifs | | |
| 2. Intentions de souscription | | |
| 3. Incidents de données | | |
| 4. Bugs P1 anciens | | |
| 5. Médiane 1ʳᵉ facture | | |
| 6. Restauration rejouée | | |
| 7. SLA tickets | | |

**Décision** : GO → Stripe production, tarifs finaux confirmés ou ajustés (décision consignée), bascule OVH définitive si non déjà faite, onboarding self-service (le guide devient le parcours autonome). **NO-GO** → critères manqués, causes, plan de remédiation, prolongation d'un cycle de 4 semaines maximum avant nouvelle mesure. La décision est consignée dans docs/GO-LIVE-15.4.51.md (section finale).

## Recrutement (F1) — suivi des candidats

| Candidat | Profil | Taille (factures/mois) | Statut (candidat / démo faite / retenu / réserve / refusé) | Motif |
|---|---|---|---|---|

Cible : 15 candidats qualifiés → 10 retenus + 2 de réserve. Canaux à la discrétion de l'éditeur (réseau, recommandations, syndicats professionnels, groupes métiers).
