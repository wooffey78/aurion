// 15.4.52 — Enrichissement automatique du catalogue métier depuis les données RÉELLES.
// Deux sources DÉTERMINISTES, aucune invention :
//   1. les prestations / articles / garanties suggérés par le profil métier confirmé ;
//   2. les libellés réellement employés dans les devis et factures émis (détection automatique
//      des données : le catalogue apprend du terrain, jamais d'une liste fantaisiste).
// Chaque insertion est dédoublonnée (insensible à la casse et aux accents) et TOUTES les
// contributions sont comptées : ajoutées, déjà présentes, totaux après enrichissement.
// L'interface et le journal de bord affichent les MÊMES chiffres — plus d'écart entre la
// notification reçue et le compteur du catalogue (correction 15.4.52).
import { query } from '../db.js';
import { emitOrgEvent } from './events.js';

export interface CatalogProfileInput {
  code: string;
  title: string;
  itemLabel?: string;
  suggestedServices: string[];
  suggestedParts: string[];
  warranty: string[];
  serviceMinutes: Record<string, number>;
}

export interface SeedOutcome {
  added: { services: number; parts: number; warranties: number; detectedFromHistory: number };
  alreadyPresent: { services: number; parts: number; warranties: number };
  totals: { services: number; parts: number; warranties: number };
  detectedLabels?: string[];
}

/** Clé de comparaison : casse et accents neutres (é/E, à/A...), blancs ramenés à un seul espace. */
export function normalizeLabel(x: unknown): string {
  return String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 180);
}

/**
 * Répartit les libellés suggérés entre « à ajouter » et « déjà présents ». FONCTION PURE —
 * testée sans base : c'est elle qui garantit que les compteurs annoncés correspondent
 * exactement à ce qui sera écrit.
 */
export function splitSuggested(suggested: string[], existingKeys: Set<string>): { toAdd: string[]; alreadyPresent: string[] } {
  const seen = new Set<string>();
  const toAdd: string[] = [];
  const alreadyPresent: string[] = [];
  for (const raw of suggested || []) {
    const label = String(raw ?? '').trim();
    if (!label) continue;
    const key = normalizeLabel(label);
    if (seen.has(key)) continue;
    seen.add(key);
    if (existingKeys.has(key)) alreadyPresent.push(label);
    else toAdd.push(label);
  }
  return { toAdd, alreadyPresent };
}

/** Clés existantes d'une table catalogue pour l'activité (jeu de comparaison en mémoire). */
async function existingKeys(table: 'interventions' | 'parts' | 'warranty_policies', activityId: string): Promise<Set<string>> {
  const rows = (await query(`select name from ${table} where activity_id=$1`, [activityId])).rows;
  return new Set(rows.map((r: any) => normalizeLabel(r.name)));
}

/** Total d'éléments après enrichissement (affichage honnête du catalogue). */
async function countRows(table: 'interventions' | 'parts' | 'warranty_policies', activityId: string): Promise<number> {
  return Number((await query(`select count(*)::int as n from ${table} where activity_id=$1`, [activityId])).rows[0]?.n || 0);
}

/**
 * Enrichit le catalogue de l'activité : suggestions du profil + détection automatique dans
 * l'historique des documents émis. Idempotent : un second appel ne réécrit rien et annonce
 * tout en « déjà présent ».
 */
export async function seedCatalogFromProfile(organizationId: string, activityId: string, profile: CatalogProfileInput, options?: { detectFromHistory?: boolean; historyLimit?: number }): Promise<SeedOutcome> {
  const detect = options?.detectFromHistory !== false;
  const limit = Math.max(1, Math.min(50, Number(options?.historyLimit) || 25));

  // 1) Suggestions du profil — dédouillonnées et comptées.
  const serviceKeys = await existingKeys('interventions', activityId);
  const partKeys = await existingKeys('parts', activityId);
  const policyKeys = await existingKeys('warranty_policies', activityId);
  const services = splitSuggested(profile.suggestedServices || [], serviceKeys);
  const parts = splitSuggested(profile.suggestedParts || [], partKeys);
  const warranties = splitSuggested(profile.warranty?.length ? profile.warranty : ['Garantie standard'], policyKeys);

  for (const label of services.toAdd) {
    await query(
      `insert into interventions(organization_id,activity_id,name,description,default_duration_minutes)
       values($1,$2,$3,$4,$5)`,
      [organizationId, activityId, label.slice(0, 180), `${profile.title} · prestation`, profile.serviceMinutes?.[label] || 60],
    );
  }
  for (const label of parts.toAdd) {
    await query(
      `insert into parts(organization_id,activity_id,name,category,selling_price)
       values($1,$2,$3,$4,0)`,
      [organizationId, activityId, label.slice(0, 180), profile.itemLabel || null],
    );
  }
  for (const raw of warranties.toAdd) {
    const label = String(raw).slice(0, 180);
    const m = /(\d+)\s*(mois|an)/.exec(label);
    const months = m ? (m[2] === 'an' ? 12 * Number(m[1]) : Number(m[1])) : 12;
    await query(
      `insert into warranty_policies(organization_id,activity_id,name,duration_months)
       values($1,$2,$3,$4)`,
      [organizationId, activityId, label, months],
    );
  }

  // 2) Détection automatique : libellés réellement facturés/devisés mais absents du catalogue.
  let detectedFromHistory = 0;
  let detectedLabels: string[] = [];
  if (detect) {
    const rows = (await query(
      `select btrim(qi.label) as label, count(*)::int as n
         from quote_items qi
         join quotes q on q.id=qi.quote_id and q.organization_id=$1
        where q.activity_id=$2 and qi.label is not null and length(btrim(qi.label))>=3
        group by btrim(qi.label)
        order by n desc, label asc`,
      [organizationId, activityId],
    )).rows;
    const known = await existingKeys('interventions', activityId);
    detectedLabels = rows
      .map((r: any) => String(r.label).trim())
      .filter(l => l.length >= 3 && l.length <= 160 && !known.has(normalizeLabel(l)))
      .filter((l, i, arr) => arr.findIndex(x => normalizeLabel(x) === normalizeLabel(l)) === i)
      .slice(0, limit);
    for (const label of detectedLabels) {
      await query(
        `insert into interventions(organization_id,activity_id,name,description,default_duration_minutes)
         values($1,$2,$3,$4,$5)`,
        [organizationId, activityId, label, 'Détecté automatiquement dans vos devis et factures émis (durée et prix à confirmer).', 60],
      );
      known.add(normalizeLabel(label));
      detectedFromHistory += 1;
    }
  }

  return {
    added: {
      services: services.toAdd.length,
      parts: parts.toAdd.length,
      warranties: warranties.toAdd.length,
      detectedFromHistory,
    },
    alreadyPresent: {
      services: services.alreadyPresent.length,
      parts: parts.alreadyPresent.length,
      warranties: warranties.alreadyPresent.length,
    },
    totals: {
      services: await countRows('interventions', activityId),
      parts: await countRows('parts', activityId),
      warranties: await countRows('warranty_policies', activityId),
    },
    detectedLabels,
  };
}

/** Événement de journal aligné sur le résultat réel (les mêmes chiffres que la notification). */
export async function emitCatalogEnrichedEvent(organizationId: string, activityId: string, activityName: string, outcome: SeedOutcome, profileCode: string): Promise<void> {
  const totalAdded = outcome.added.services + outcome.added.parts + outcome.added.warranties + outcome.added.detectedFromHistory;
  const totalPresent = outcome.alreadyPresent.services + outcome.alreadyPresent.parts + outcome.alreadyPresent.warranties;
  if (totalAdded === 0 && totalPresent === 0) return;
  await emitOrgEvent(organizationId, {
    type: 'catalog_enriched',
    title: totalAdded > 0 ? `Catalogue métier enrichi : ${totalAdded} élément(s) ajouté(s)` : 'Catalogue métier déjà à jour',
    description: totalAdded > 0
      ? `Catalogue de « ${activityName} » (profil ${profileCode}) : ${outcome.added.services} prestation(s), ${outcome.added.parts} article(s), ${outcome.added.warranties} garantie(s)${outcome.added.detectedFromHistory ? `, ${outcome.added.detectedFromHistory} élément(s) détecté(s) dans vos documents émis` : ''}. Déjà présents : ${totalPresent}. Catalogue désormais : ${outcome.totals.services} prestation(s), ${outcome.totals.parts} article(s), ${outcome.totals.warranties} garantie(s).`
      : `Rien à ajouter pour « ${activityName} » (profil ${profileCode}) : ${totalPresent} élément(s) du profil métier déjà dans le catalogue (${outcome.totals.services} prestation(s), ${outcome.totals.parts} article(s), ${outcome.totals.warranties} garantie(s) au total).`,
    severity: totalAdded > 0 ? 'success' : 'info',
    source: 'catalog',
    internalPath: '/catalog',
    dedupeKey: `catalog-seed:${activityId}:${profileCode}:${totalAdded}`,
  });
}
