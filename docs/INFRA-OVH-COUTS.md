# Infrastructure OVHcloud — étude des coûts actuels (Bloc 1, 14 novembre 2026)

> Étude demandée par le prompt maître : « Auditer les capacités et coûts actuels d'OVH et distinguer VPS, PostgreSQL managé et Object Storage. Proposer la configuration minimale fiable sans achat ni provisionnement réel. » **Aucun achat, aucun provisionnement** n'est effectué ni décidé ici : le choix final de l'offre et du dimensionnement appartient à l'éditeur.

## 1. Tarifs relevés le 14 novembre 2026

Sources consultées directement (pages OVHcloud, site « World » affiché en dollars ; la grille en euros du site européen `ovhcloud.com/fr/` diffère légèrement — **à revérifier sur la version EUR au moment du provisionnement**, aucun montant euro n'est inventé ici) :

**PostgreSQL managé (Public Cloud Databases, Gen 3)** — [ovhcloud.com/en/public-cloud/postgresql/](https://www.ovhcloud.com/en/public-cloud/postgresql/) :
| Plan | Prix affiché | Contenu |
|---|---|---|
| Discovery | from **64,24 $/mois/nœud** | 1 nœud, sauvegarde 48 h, sans SLA — « prototypes et tests » |
| Production | from **81,76 $/mois/nœud** | 2 nœuds multi-AZ avec failover, sauvegarde 14 jours, SLA 99,95 % |
| Advanced | from **83,07 $/mois/nœud** | 3 nœuds, réplique de lecture, 2 failover, SLA 99,99 % |

**VPS 2027** — [ovhcloud.com/en/vps/](https://www.ovhcloud.com/en/vps/) :
| Plan | vCores / RAM / stockage | Prix affiché |
|---|---|---|
| VPS-1 | 2 / 4 Go / 40 Go NVMe, 500 Mbps | from **4,54 $/mois** |
| VPS-2 | 4 / 8 Go / 75 Go NVMe, 1 Gbps | from **8,50 $/mois** |
| VPS-3 | 6 / 12 Go / 100 Go NVMe, 2 Gbps | from **12,32 $/mois** |
| VPS-4 | 8 / 24 Go / 200 Go NVMe, 3 Gbps | from **23,37 $/mois** |

**Object Storage (Multi-Zone, classe Standard)** — [ovhcloud.com/en/public-cloud/prices/](https://www.ovhcloud.com/en/public-cloud/prices/) :
- **≈ 0,00002152 $/Go/heure ≈ 0,0157 $/Go/mois** (premier palier 50 TiB) ; trafic interne/externe et requêtes API affichés « Free ». Pour un ordre de grandeur : 50 Go ≈ 0,79 $/mois ; 200 Go ≈ 3,14 $/mois.

## 2. Options de configuration pour Aurion (aucune décidée)

| Option | Composition | Coût fixe estimé (grille $ ci-dessus) | Atouts | Limites |
|---|---|---|---|---|
| **A — minimale (bêta privée)** | VPS-2 + PostgreSQL 16 auto-hébergé + Object Storage Standard | ≈ **8,50 $ + stockage** | coût le plus faible ; outils de sauvegarde/restauration déjà livrés (`npm run db:backup`, `db:restore:drill`) | exploitation à la charge de l'éditeur (mises à jour, supervision) ; aucune SLA |
| **B — managée intermédiaire** | PostgreSQL managé **Discovery** + VPS-2 + Object Storage | ≈ **64,24 $ + 8,50 $ + stockage** | sauvegardes automatisées, exploitation allégée | sans SLA ; dimensionnement exact à vérifier (vCore/RAM non affichés sur la page) |
| **C — production avec SLA** | PostgreSQL managé **Production** (2 nœuds) + VPS-2 + Object Storage | ≈ **81,76 $ × 2 nœuds + 8,50 $ + stockage** | SLA 99,95 %, failover multi-AZ, sauvegarde 14 jours — le seul plan affiché conforme à une exigence de production avec SLA | coût fixe le plus élevé |

## 3. Recommandation présentée (sans application)

Trajectoire proposée : **option A ou B pendant la bêta privée** (volonté affichée de limiter les coûts fixes), passage à l'**option C** avant l'ouverture commerciale si l'exigence de SLA est confirmée. Le stockage privé documentaire reste sur Object Storage région `de` dans toutes les options (déjà codé : `AURION_S3_ENDPOINT=https://s3.de.io.cloud.ovh.net`, région `de`, imposé en production par `backend/src/config.ts:73`). Le domaine et les adresses e-mail dédiées restent **non achetés** (blocage assumé, cf. checklist pré-production).

Chiffre de traçabilité : la page de prix mondiale cite aussi une instance Public Cloud « Discovery » d2-2 (2 Go, 1 vCore) à 6,74 $/mois — alternative d'hébergement applicatif comparable au VPS-1.

## 4. Ce qui reste à l'éditeur (aucune décision prise ici)

1. Choisir l'option et le dimensionnement sur la grille **en euros** du site européen.
2. Souscrire et provisionner (avec autorisation distincte, cf. règles du prompt maître).
3. Acheter le domaine Aurion et créer les adresses e-mail dédiées (prérequis Brevo/SPF/DKIM/DMARC).
4. Enregistrer la décision dans `docs/CHECKLIST-PRE-PRODUCTION.md` (cases infrastructure déjà présentes).
