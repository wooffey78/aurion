// Bloc 8 — Référentiel daté des taux micro-entrepreneur par catégorie d'activité.
//
// Sources officielles (vérifiées le 14 novembre 2026) :
//  - entreprendre.service-public.gouv.fr/vosdroits/F36232 (cotisations sociales micro) :
//    vente de marchandises BIC 12,30 % · prestations de services BIC 21,20 % ·
//    autres prestations de services BNC 25,60 % · professions libérales réglementées
//    (CIPAV) 23,20 % — avec versement libératoire : 13,30 / 22,90 / 27,80 / 25,40 %.
//  - impots.gouv.fr (« le versement libératoire ») : VL 1 % (vente), 1,7 % (services),
//    2,2 % (BNC libérales et CIPAV).
//  - Contribution à la formation professionnelle : 0,10 % (commerçants), 0,30 %
//    (artisans / BIC), 0,20 % (professions libérales) — URSSAF.
//
// Règles du bloc 8 : chaque version du référentiel est datée (date d'effet, date de fin),
// sourcée et vérifiée ; les anciennes règles sont CONSERVÉES (aucune réécriture) pour
// reproduire les calculs historiques ; les cotisations (micro-social + CFP) restent
// distinctes de l'impôt (versement libératoire) — jamais confondus, jamais doublés.
import { query } from '../db.js';

export type MicroCategoryCode = 'vente_bic' | 'services_bic' | 'services_bnc' | 'services_bnc_cipav' | 'specific';
type SplitCategory = MicroCategoryCode | 'unassigned';

export interface MicroRate {
  category: MicroCategoryCode;
  label: string;
  socialRate: number;
  cfpRate: number;
  /** Taux du versement libératoire (impôt sur le revenu forfaitaire) — distinct des cotisations. */
  taxRate: number;
  basis: string;
}

export interface MicroReferentialVersion {
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
  verifiedOn: string;
  rates: MicroRate[];
}

export const MICRO_CATEGORIES: Record<MicroCategoryCode, string> = {
  vente_bic: 'Vente de marchandises, de biens et fourniture de logement (BIC)',
  services_bic: 'Prestations de services commerciales ou artisanales (BIC)',
  services_bnc: 'Autres prestations de services et professions libérales non réglementées (BNC)',
  services_bnc_cipav: 'Professions libérales réglementées affiliées CIPAV (BNC)',
  specific: 'Activité à règles spécifiques (rattachement à confirmer auprès de l’URSSAF)',
};

export const MICRO_CATEGORY_CODES = Object.keys(MICRO_CATEGORIES) as MicroCategoryCode[];

/** Référentiel intégré 2026 (identique à la migration 078) — secours déterministe si la base est indisponible. */
export const BUILTIN_REFERENTIAL_2026: MicroReferentialVersion = {
  version: '2026',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  source: 'entreprendre.service-public.gouv.fr/vosdroits/F36232 · impots.gouv.fr (versement libératoire)',
  verifiedOn: '2026-11-14',
  rates: [
    { category: 'vente_bic', label: MICRO_CATEGORIES.vente_bic, socialRate: 12.3, cfpRate: 0.1, taxRate: 1.0, basis: 'chiffre d’affaires HT' },
    { category: 'services_bic', label: MICRO_CATEGORIES.services_bic, socialRate: 21.2, cfpRate: 0.3, taxRate: 1.7, basis: 'chiffre d’affaires HT' },
    { category: 'services_bnc', label: MICRO_CATEGORIES.services_bnc, socialRate: 25.6, cfpRate: 0.2, taxRate: 2.2, basis: 'chiffre d’affaires HT' },
    { category: 'services_bnc_cipav', label: MICRO_CATEGORIES.services_bnc_cipav, socialRate: 23.2, cfpRate: 0.2, taxRate: 2.2, basis: 'chiffre d’affaires HT' },
    { category: 'specific', label: MICRO_CATEGORIES.specific, socialRate: 21.2, cfpRate: 0.3, taxRate: 1.7, basis: 'chiffre d’affaires HT · taux indicatif, à confirmer' },
  ],
};

const BUILTIN_VERSIONS: MicroReferentialVersion[] = [BUILTIN_REFERENTIAL_2026];

const num = (v: unknown) => Number(v ?? 0);
/** 'unassigned' reste une catégorie à part entière (CA signalé, jamais affecté silencieusement). */
const CATEGORY_OF = (c: string): SplitCategory => {
  const s = String(c || '').trim().toLowerCase();
  if (s === 'unassigned') return 'unassigned';
  return MICRO_CATEGORY_CODES.includes(s as MicroCategoryCode) ? s as MicroCategoryCode : 'specific';
};

/** Charge le référentiel depuis la base (tables en lecture seule pour le rôle applicatif) ; repli intégré déterministe. */
export async function loadReferentialVersions(client?: { query: (sql: string, params?: unknown[]) => Promise<any> }): Promise<MicroReferentialVersion[]> {
  try {
    const ex = client ?? { query };
    const versions = (await ex.query('select id,version,effective_from,effective_to,source,verified_on from micro_referential_versions order by effective_from asc')).rows;
    if (!versions.length) return BUILTIN_VERSIONS;
    const rates = (await ex.query('select version_id,category,label,social_rate,cfp_rate,tax_rate,basis from micro_rates order by category')).rows;
    const byVersion = new Map<string, any[]>();
    for (const r of rates) { const k = String(r.version_id); if (!byVersion.has(k)) byVersion.set(k, []); byVersion.get(k)!.push(r); }
const iso = (d: unknown) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10);
    return versions.map((v: any) => ({
      version: String(v.version),
      effectiveFrom: iso(v.effective_from),
      effectiveTo: v.effective_to ? iso(v.effective_to) : null,
      source: String(v.source),
      verifiedOn: iso(v.verified_on),
      rates: (byVersion.get(String(v.id)) || []).map((r: any) => ({
        category: CATEGORY_OF(String(r.category)),
        label: String(r.label),
        socialRate: num(r.social_rate),
        cfpRate: num(r.cfp_rate),
        taxRate: r.tax_rate === null || r.tax_rate === undefined ? 0 : num(r.tax_rate),
        basis: String(r.basis),
      })),
    }));
  } catch {
    return BUILTIN_VERSIONS;
  }
}

/** Version en vigueur à une date donnée (date d'effet incluse, date de fin exclue). */
export function referentialForDate(versions: MicroReferentialVersion[], dateISO: string): MicroReferentialVersion | null {
  const d = String(dateISO || '').slice(0, 10);
  const inRange = versions.filter(v => v.effectiveFrom <= d && (!v.effectiveTo || d <= v.effectiveTo));
  return inRange.length ? inRange[inRange.length - 1] : null;
}

export function rateFor(version: MicroReferentialVersion, category: string): MicroRate {
  const wanted = CATEGORY_OF(category);
  return version.rates.find(r => r.category === wanted) || version.rates.find(r => r.category === 'specific')
    || { category: 'specific', label: MICRO_CATEGORIES.specific, socialRate: 0, cfpRate: 0, taxRate: 0, basis: 'à confirmer' };
}

/** Valide une catégorie saisie (jamais de valeur inventée : vide = non renseigné, inconnu = refus explicite). */
export function normalizeCategoryInput(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (!MICRO_CATEGORY_CODES.includes(s as MicroCategoryCode)) {
    throw new Error(`Catégorie d'activité inconnue : « ${s} ». Catégories acceptées : ${MICRO_CATEGORY_CODES.join(', ')}.`);
  }
  return s;
}

export interface SplitLine { amountHt: number; category: string | null | undefined }

export interface CategorySplitRow {
  category: SplitCategory;
  label: string;
  caHt: number;
  socialRate: number;
  cfpRate: number;
  socialAmount: number;
  cfpAmount: number;
  contributionsTotal: number;
  taxRate: number;
  /** Versement libératoire (impôt) — JAMAIS inclus dans contributionsTotal ni dans les cotisations. */
  taxAmount: number;
}

export interface CategorySplitResult {
  version: string | null;
  effectiveFrom: string | null;
  source: string | null;
  rows: CategorySplitRow[];
  caHt: number;
  socialTotal: number;
  cfpTotal: number;
  contributionsTotal: number;
  taxTotal: number;
  unassignedHt: number;
}

/**
 * Ventilation du chiffre d'affaires par catégorie d'activité (bloc 8 : activité mixte).
 * Chaque ligne est comptée UNE SEULE FOIS : catégorie de la ligne, sinon catégorie du
 * document (fallback explicite), sinon « unassigned » (signalé, jamais silencieusement
 * affecté). Le versement libératoire est calculé séparément (impôt ≠ cotisation).
 */
export function splitByCategory(lines: SplitLine[], docCategory: string | null | undefined, versions: MicroReferentialVersion[], dateISO: string): CategorySplitResult {
  const version = referentialForDate(versions, dateISO);
  const rows = new Map<string, CategorySplitRow>();
  const emptyRow = (category: MicroCategoryCode | 'unassigned'): CategorySplitRow => ({
    category,
    label: category === 'unassigned' ? 'Non renseigné (à affecter)' : (MICRO_CATEGORIES[category] || category),
    caHt: 0, socialRate: 0, cfpRate: 0, socialAmount: 0, cfpAmount: 0, contributionsTotal: 0, taxRate: 0, taxAmount: 0,
  });
  let caHt = 0, unassignedHt = 0;
  for (const line of Array.isArray(lines) ? lines : []) {
    const amount = Math.max(0, num(line.amountHt));
    const cat = CATEGORY_OF(String(line.category || docCategory || 'unassigned'));
    caHt += amount;
    if (cat === 'unassigned') { unassignedHt += amount; }
    if (!rows.has(cat)) rows.set(cat, emptyRow(cat));
    rows.get(cat)!.caHt += amount;
  }
  for (const row of rows.values()) {
    if (version && row.category !== 'unassigned') {
      const r = rateFor(version, row.category);
      row.socialRate = r.socialRate; row.cfpRate = r.cfpRate; row.taxRate = r.taxRate;
      row.socialAmount = Math.round(row.caHt * r.socialRate) / 100;
      row.cfpAmount = Math.round(row.caHt * r.cfpRate) / 100;
      row.contributionsTotal = Math.round((row.socialAmount + row.cfpAmount) * 100) / 100;
      row.taxAmount = Math.round(row.caHt * r.taxRate) / 100;
    }
  }
  const socialTotal = rows.size ? [...rows.values()].reduce((t, r) => t + r.socialAmount, 0) : 0;
  const cfpTotal = rows.size ? [...rows.values()].reduce((t, r) => t + r.cfpAmount, 0) : 0;
  const taxTotal = rows.size ? [...rows.values()].reduce((t, r) => t + r.taxAmount, 0) : 0;
  return {
    version: version?.version || null,
    effectiveFrom: version?.effectiveFrom || null,
    source: version?.source || null,
    rows: [...rows.values()].map(r => ({ ...r, socialAmount: Math.round(r.socialAmount * 100) / 100, cfpAmount: Math.round(r.cfpAmount * 100) / 100, contributionsTotal: Math.round(r.contributionsTotal * 100) / 100, taxAmount: Math.round(r.taxAmount * 100) / 100, caHt: Math.round(r.caHt * 100) / 100 })),
    caHt: Math.round(caHt * 100) / 100,
    socialTotal: Math.round(socialTotal * 100) / 100,
    cfpTotal: Math.round(cfpTotal * 100) / 100,
    contributionsTotal: Math.round((socialTotal + cfpTotal) * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    unassignedHt: Math.round(unassignedHt * 100) / 100,
  };
}

/**
 * Comptabilité par catégorie sur une année (factures émises de l'organisation/activité) :
 * CA HT par catégorie (ligne, sinon document), cotisations et versement libératoire
 * estimés avec la version du référentiel en vigueur À LA DATE de chaque facture.
 * Utilisé par /accounting/summary (tableaux de bord) — sans double comptage : une ligne
 * avec catégorie ne remonte jamais aussi dans la catégorie du document.
 */
export async function categoryAccounting(orgId: string, activityId: string | null, year: number, client?: { query: (sql: string, params?: unknown[]) => Promise<any> }) {
  const ex = client ?? { query };
  const versions = await loadReferentialVersions(ex);
  const rows = (await ex.query(
    `select q.id invoice_id,q.created_at::date invoice_date,q.activity_category doc_category,
            coalesce((select json_agg(json_build_object('amountHt',i.quantity*i.unit_price,'category',i.activity_category) order by i.position) from quote_items i where i.quote_id=q.id),'[]'::json) items
     from quotes q
     where q.organization_id=$1 and q.document_type='invoice'
       and ($2::uuid is null or q.activity_id=$2::uuid)
       and date_trunc('year',q.created_at)=make_date($3,1,1)`,
    [orgId, activityId, year],
  )).rows;
  const merges = new Map<string, SplitLine[]>();
  const dates: string[] = [];
  for (const r of rows) {
    const date = String(r.invoice_date || '').slice(0, 10);
    const lines: SplitLine[] = Array.isArray(r.items) && r.items.length
      ? r.items.map((i: any) => ({ amountHt: Math.max(0, num(i.amountHt)), category: i.category ?? null }))
      : [];
    if (!lines.length) lines.push({ amountHt: 0, category: r.doc_category || null });
    // Fallback document appliqué PAR FACTURE (bloc 8) : une ligne sans catégorie hérite de la
    // catégorie du document — jamais d'une affectation silencieuse vers une autre catégorie.
    for (const l of lines) if (!l.category && r.doc_category) l.category = String(r.doc_category);
    const key = r.invoice_id;
    merges.set(key, lines);
    dates.push(date);
  }
  // Une ventilation par version de référentiel (par date de facture) : les factures antérieures
  // à la première version gardent le CA par catégorie sans estimation de cotisations datée.
  const perDate = new Map<string, SplitLine[]>();
  for (const [id, lines] of merges) {
    const idx = [...merges.keys()].indexOf(id);
    const date = dates[idx];
    if (!perDate.has(date)) perDate.set(date, []);
    perDate.get(date)!.push(...lines);
  }
  const parts: CategorySplitResult[] = [];
  for (const [date, lines] of perDate) {
    parts.push(splitByCategory(lines, null, versions, date));
  }
  const total: CategorySplitResult = {
    version: parts[0]?.version || null,
    effectiveFrom: parts[0]?.effectiveFrom || null,
    source: parts[0]?.source || null,
    rows: [],
    caHt: 0, socialTotal: 0, cfpTotal: 0, contributionsTotal: 0, taxTotal: 0, unassignedHt: 0,
  };
  const byCat = new Map<string, CategorySplitRow>();
  for (const p of parts) {
    total.caHt = Math.round((total.caHt + p.caHt) * 100) / 100;
    total.socialTotal = Math.round((total.socialTotal + p.socialTotal) * 100) / 100;
    total.cfpTotal = Math.round((total.cfpTotal + p.cfpTotal) * 100) / 100;
    total.contributionsTotal = Math.round((total.contributionsTotal + p.contributionsTotal) * 100) / 100;
    total.taxTotal = Math.round((total.taxTotal + p.taxTotal) * 100) / 100;
    total.unassignedHt = Math.round((total.unassignedHt + p.unassignedHt) * 100) / 100;
    for (const r of p.rows) {
      // Initialisation à ZÉRO puis addition : sinon la première ligne est comptée deux fois.
      if (!byCat.has(r.category)) byCat.set(r.category, { ...r, caHt: 0, socialAmount: 0, cfpAmount: 0, contributionsTotal: 0, taxAmount: 0 });
      const cur = byCat.get(r.category)!;
      cur.caHt = Math.round((cur.caHt + r.caHt) * 100) / 100;
      cur.socialAmount = Math.round((cur.socialAmount + r.socialAmount) * 100) / 100;
      cur.cfpAmount = Math.round((cur.cfpAmount + r.cfpAmount) * 100) / 100;
      cur.contributionsTotal = Math.round((cur.contributionsTotal + r.contributionsTotal) * 100) / 100;
      cur.taxAmount = Math.round((cur.taxAmount + r.taxAmount) * 100) / 100;
    }
  }
  total.rows = [...byCat.values()];
  total.version = total.unassignedHt >= 0 && parts.length ? parts[parts.length - 1].version : total.version;
  return total;
}
