// Détection d'entreprise par identifiant SIREN/SIRET uniquement (décision D4 : la recherche par nom est retirée).
// API appelée : https://recherche-entreprises.api.gouv.fr/search (documentation OpenAPI consultée le 04/11/2026) :
//  - un `q` de 9 chiffres (SIREN) ou 14 chiffres (SIRET) ignore tous les autres filtres ;
//  - `per_page` ≤ 25, `limite_matching_etablissements` 1 à 100 ;
//  - champs : siren, nom_complet, nom_raison_sociale, nature_juridique (code), etat_administratif (A/C), date_fermeture,
//    activite_principale, siege{siret,adresse,code_postal,libelle_commune,etat_administratif,est_siege},
//    matching_etablissements[{siret,adresse,code_postal,libelle_commune,etat_administratif,est_siege,date_fermeture}] ;
//  - limite : 7 requêtes/s par adresse IP, HTTP 429 + Retry-After en cas de dépassement.
import { isValidLuhn } from './validation.js';

export type RegistryCompany = {
  siren: string;
  siret: string;
  legalName: string;
  address: string;
  postalCode: string;
  city: string;
  source: string;
  legalForm?: string;
  legalFormCode?: string;
  website?: string;
  logoUrl?: string;
  activity?: string;
  legalActivityCode?: string;
  vatNumber?: string;
  isHeadOffice?: boolean;
  closed?: boolean;
  establishmentClosed?: boolean;
  closedOn?: string;
};

const normalize = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const LA_POSTE_SIREN = '356000000';

/** Contrôle d'un SIRET : Luhn, sauf exception documentée de La Poste (somme des chiffres multiple de 5). */
export function isValidSiretChecksum(siret: string): boolean {
  if (!/^\d{14}$/.test(siret)) return false;
  if (isValidLuhn(siret)) return true;
  // Exception officielle (INSEE) : les établissements de La Poste (SIREN 356000000) suivent une clé « somme des chiffres multiple de 5 ».
  return siret.startsWith(LA_POSTE_SIREN) && siret.split('').reduce((t, d) => t + Number(d), 0) % 5 === 0;
}
export function isValidSirenChecksum(siren: string): boolean { return /^\d{9}$/.test(siren) && isValidLuhn(siren); }

export function normalizeSiret(value: unknown) {
  const s = String(value ?? '').replace(/[\s.]/g, '');
  if (!/^\d{14}$/.test(s) || !isValidSiretChecksum(s)) throw new Error('SIRET invalide.');
  return s;
}

export function normalizeSiren(value: unknown) {
  const s = String(value ?? '').replace(/[\s.]/g, '');
  if (!isValidSirenChecksum(s)) throw new Error('SIREN invalide.');
  return s;
}

/** Numéro de TVA intracommunautaire français calculé depuis le SIREN (clé = (12 + 3 × (SIREN mod 97)) mod 97). */
export function frenchVatNumber(siren: string): string {
  if (!/^\d{9}$/.test(siren)) return '';
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, '0')}${siren}`;
}

// Libellés des catégories juridiques les plus courantes (nomenclature INSEE, niveau 4). Les autres codes restent affichés tels quels.
const LEGAL_FORM_LABELS: Record<string, string> = {
  '1000': 'Entreprise individuelle', '5410': 'SARL', '5498': 'EURL', '5499': 'SARL', '5710': 'SAS', '5720': 'SASU',
  '5599': 'SA', '5505': 'SA', '5202': 'SNC', '5306': 'SCS', '5308': 'SCA', '5385': 'SELAS', '5485': 'SELARL', '5785': 'SELAS',
  '6540': 'SCI', '6541': 'SCI', '6585': 'Autre société civile', '6589': 'SCM', '6521': 'SCP', '6220': 'GIE', '6598': 'EARL', '6533': 'GAEC', '9220': 'Association loi 1901',
};

export class RegistryError extends Error { constructor(public code: string, message: string) { super(message); } }

export async function lookupFrenchCompany(identifier: string, fetcher: typeof fetch = fetch): Promise<RegistryCompany | null> {
  const raw = String(identifier ?? '').replace(/[\s.]/g, '');
  if (!raw) throw new RegistryError('REGISTRY_INVALID_IDENTIFIER', 'Saisissez un SIRET (14 chiffres) ou un SIREN (9 chiffres).');
  if (!/^\d+$/.test(raw) || ![9, 14].includes(raw.length)) throw new RegistryError('REGISTRY_INVALID_IDENTIFIER', 'Un SIREN comporte 9 chiffres et un SIRET 14 chiffres.');
  if (raw.length === 9 ? !isValidSirenChecksum(raw) : !isValidSiretChecksum(raw)) throw new RegistryError('REGISTRY_INVALID_IDENTIFIER', raw.length === 9 ? 'Ce SIREN n’est pas valide (clé de contrôle).' : 'Ce SIRET n’est pas valide (clé de contrôle).');
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(raw)}&per_page=5&limite_matching_etablissements=10`;
  let response: Response;
  try { response = await fetcher(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }); }
  catch { throw new RegistryError('REGISTRY_UNAVAILABLE', 'Le registre public ne répond pas.'); }
  if (response.status === 429) throw new RegistryError('REGISTRY_RATE_LIMITED', 'Le registre public limite temporairement les requêtes.');
  if (!response.ok) throw new RegistryError('REGISTRY_UNAVAILABLE', `Le registre public a répondu ${response.status}.`);
  const data: any = await response.json().catch(() => ({}));
  const siren = raw.slice(0, 9);
  const hit = (data.results || []).find((x: any) => normalize(x?.siren || x?.siege?.siren) === siren);
  if (!hit) return null;
  const siege = hit.siege || {};
  // SIRET d'un établissement secondaire : on retient l'établissement demandé ; SIREN seul : le siège.
  const etab = raw.length === 14
    ? [siege, ...(Array.isArray(hit.matching_etablissements) ? hit.matching_etablissements : [])].find((e: any) => normalize(e?.siret) === raw)
    : siege;
  if (raw.length === 14 && !etab) return null;
  const place = etab || siege;
  const code = normalize(hit.nature_juridique);
  return {
    siren,
    siret: normalize(place.siret || (raw.length === 14 ? raw : '')),
    legalName: normalize(hit.nom_complet || hit.nom_raison_sociale || hit.denomination) || normalize(hit.nom),
    address: [place.adresse, place.complement_adresse].filter(Boolean).map(normalize).join('\n'),
    postalCode: normalize(place.code_postal),
    city: normalize(place.libelle_commune || place.commune),
    source: 'recherche-entreprises.api.gouv.fr',
    legalForm: LEGAL_FORM_LABELS[code] || '',
    legalFormCode: code,
    activity: normalize(hit.activite_principale_libelle || ''),
    legalActivityCode: normalize(hit.activite_principale || place.activite_principale),
    vatNumber: frenchVatNumber(siren),
    isHeadOffice: place === siege || place?.est_siege === true,
    closed: normalize(hit.etat_administratif) === 'C',
    establishmentClosed: normalize(place.etat_administratif) === 'F' || normalize(place.etat_administratif) === 'C',
    closedOn: normalize(place.date_fermeture || hit.date_fermeture) || undefined,
  };
}

/** Les logos d'entreprises ne sont pas téléchargés depuis un tiers : l'utilisateur téléverse son propre logo. */
export function companyLogoUrl(_website: string | null | undefined) { return null; }
