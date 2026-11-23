# RECHERCHES-15-17-18 — PA gratuites (API partenaire), tarification concurrentielle, médiateur (recherches du 14 novembre 2026)

Sources publiques consultées le 14/11/2026 (recherche web) ; **chaque conclusion à valider à l'exécution sur les pages officielles des prestataires avant toute souscription**. Aucune décision de prix ni aucun contrat — décisions éditeur.

## Bloc 15 — Plateformes agréées : éligibilité au critère « gratuité intégrale »

Rappel du critère du prompt maître : gratuite **à la fois** pour l'entrepreneur (aucun frais fixe/minimum/volume) **et** pour l'intégration Aurion (API/SDK/partenariat éditeur). Une offre gratuite entrepreneur avec API partenaire payante/inaccessible = **NON ÉLIGIBLE**.

**Constats (recherche web, sources publiques)** :
- Liste DGFiP : **~163-165 PA immatriculées** (observatoire du 22/09/2026) ; calendrier : réception obligatoire depuis septembre 2026, **émission dès 2027** (impots.gouv.fr ; entreprendre.service-public.gouv.fr).
- **9 PA affichent un plan 0 € couvrant le socle légal** (comparateurs publics) : Indy, Henrri, MyFacturation, Tiime, Abby, ECMA (jefacture.com), Flowie, Kolecto, +1.
- **Flowie** : PA agréée avec **API publique documentée** (REST, OpenAPI 3.1, webhooks) — mais offre « gratuite jusqu'à 24 documents/mois, puis au document dès 12 €/mois » → **NON ÉLIGIBLE au critère intégral** (frais au-delà d'un volume).
- **Henrri** : logiciel facturation **100 % gratuit** (entrepreneur) — **aucune API partenaire publique documentée trouvée** dans cette recherche → éligibilité indéterminée sans contact direct (l'absence d'API ne permet pas l'intégration Aurion).
- **Kolecto / ECMA / MyFacturation** : pas de documentation d'API partenaire gratuite trouvée dans cette recherche → indéterminées.
- **Indy / Tiime / Abby** : plans payants présents au-delà du socle → gratuité intégrale non établie pour l'entrepreneur (Indy Essentiel 0 € à vérifier en profondeur : limites du gratuit).

**Conclusion honnête** : à ce stade, **aucune PA n'est confirmée comme TOTALEMENT gratuite (entrepreneur + API partenaire gratuite)**. La cible la plus crédible pour une vérification approfondie : **Henrri** (gratuité entrepreneur totale prouvée) et **Flowie** (API ouverte documentée) — chacune pour une raison différente. Prochaine étape : contact/documentation directe des deux prestataires sur leurs conditions d'API partenaire écrites, puis décision éditeur. Si aucune ne satisfait le critère intégral, **le dire à l'éditeur et ne pas contourner** (le prompt maître l'exige).

## Bloc 17 — Étude tarifaire concurrentielle (France, micro-entrepreneurs)

**Tarifs relevés (pages officielles/comparatifs publics, 14/11/2026)** :
| Solution | Gratuit | Entrée de gamme | Milieu de gamme |
|---|---|---|---|
| **Abby** (abby.fr, page officielle) | Basique 0 €/mois HT | Start 8,10 € HT/mois (9 €) | Plus 13,50 € HT/mois (15 €) ; Premium 29,70 € HT (33 €) |
| **Tiime** | socle gratuit | Initial 9,99 € HT/mois (119,88 € HT/an) | plans dès 17,99 € HT/mois |
| **Indy** | Essentiel 0 €/mois | Plus 9 € HT/mois | — |
| **Henrri** | 100 % gratuit | — | — |

**Concurrent le plus comparable à Aurion** (facturation + comptabilité + trésorerie + SAV/garanties + hors connexion complet) : **Abby Plus (13,50 € HT/mois)** pour l'étendue, **Tiime Initial (9,99 € HT/mois)** pour le positionnement micro-entrepreneur.

**Proposition (jamais un prix adopté)** : positionner Aurion **entre 8 et 9,90 € HT/mois sans engagement** (sous Tiime Initial et Abby Plus), avec essai 60 jours. Coûts réels à intégrer au calcul de rentabilité : OVH (à confirmer), Stripe (frais par transaction), Brevo (emails), PA (0 € si trouvé, sinon renoncer), SMS d'alertes (à valider). **Décision finale = éditeur exclusivement**, après validation de la page tarifs et cohérence CGU/checkout (Bloc 18/20).

## Bloc 18 — Médiateur de la consommation

- **Cadre légal** : le recours au médiateur est **gratuit pour le consommateur** (art. L.612-1 C. conso) ; c'est le **professionnel** qui désigne/adhère à un dispositif ; liste des médiateurs référencés tenue par la **CECMC** (economie.gouv.fr).
- **Coûts relevés** : adhésion dès ~25 € HT pour 3 ans (micro-entreprise, source comparative 2024) **à revérifier** ; les honoraires de médiation sont à la charge du professionnel.
- **Application à Aurion** : les utilisateurs Aurion sont des **professionnels** (micro-entrepreneurs) — la médiation de la consommation ne leur est pas obligatoirement opposable ; les CGU actuelles (révision 4.0) citent le CM2C avec placeholders → deux options à trancher avec l'éditeur : (a) garder un médiateur de consommation référencé (CM2C) pour les litiges B2C éventuels + clause de médiation contractuelle B2B, ou (b) clause B2B de médiation institutionnelle (ex. CMAP/CFECGCM). **Toute adhésion = dépense → accord éditeur requis avant souscription.**

## Ce qui reste bloqué sur l'éditeur
1. PA : choix après vérification écrite des conditions d'API partenaire (Henrri/Flowie en priorité).
2. Tarif : adoption du prix et de la page tarifs.
3. Médiateur : choix du dispositif + budget d'adhésion.
4. Sauvegardes : exécution du drill avec `pg_dump`/`pg_restore` (machine éditeur ou OVH).
