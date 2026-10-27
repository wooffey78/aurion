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
  website?: string;
  logoUrl?: string;
  activity?: string;
  legalActivityCode?: string;
};

const normalize = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function normalizeSiret(value: unknown) {
  const s = String(value ?? '').replace(/\D/g, '');
  if (s.length !== 14 || !isValidLuhn(s)) throw new Error('SIRET invalide.');
  return s;
}

export function normalizeSiren(value: unknown) {
  const s = String(value ?? '').replace(/\D/g, '');
  if (s.length !== 9 || !isValidLuhn(s)) throw new Error('SIREN invalide.');
  return s;
}

export async function lookupFrenchCompany(identifier: string): Promise<RegistryCompany | null> {
  const rawInput = String(identifier ?? '').trim();
  const raw = rawInput.replace(/\D/g, '');
  if (!rawInput) throw new Error('Identifiant entreprise requis.');
  if (![9, 14].includes(raw.length) || !isValidLuhn(raw)) throw new Error('SIRET/SIREN invalide.');
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(raw)}&per_page=5`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`REGISTRY_HTTP_${response.status}`);
    const data: any = await response.json();
    const hit = (data.results || []).find((x: any) => {
      const siret = normalize(x?.siege?.siret);
      const siren = normalize(x?.siren || x?.siege?.siren);
      return raw === siret || raw === siren;
    });
    if (!hit) return null;
    const siege = hit.siege || {};
    const legalName = normalize(hit.nom_complet || hit.nom_raison_sociale || hit.denomination) || normalize(hit.nom);
    const address = [siege.adresse, siege.complement_adresse].filter(Boolean).map(normalize).join('\n');
    return {
      siren: normalize(hit.siren || siege.siren),
      siret: normalize(siege.siret || (raw.length === 14 ? raw : '')),
      legalName,
      address,
      postalCode: normalize(siege.code_postal),
      city: normalize(siege.libelle_commune || siege.commune),
      source: 'recherche-entreprises.api.gouv.fr', legalForm: normalize(hit.nature_juridique||hit.nature_juridique_libelle), website: normalize(hit.site_internet||hit.website), activity: normalize(hit.activite_principale_libelle||hit.activite_principale||hit.section_activite_principale), legalActivityCode: normalize(hit.activite_principale), logoUrl: normalize(hit.logo_url||hit.logo||'') || (normalize(hit.site_internet||hit.website) ? companyLogoUrl(normalize(hit.site_internet||hit.website)) || undefined : undefined),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function searchFrenchCompanies(name: string): Promise<RegistryCompany[]> {
  const q = String(name ?? '').trim();
  if (q.length < 2) throw new Error('Nom de fournisseur trop court.');
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=10`;
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`REGISTRY_HTTP_${response.status}`);
  const data: any = await response.json();
  return (data.results || []).map((hit:any) => {
    const siege=hit.siege||{};
    return {siren:normalize(hit.siren||siege.siren),siret:normalize(siege.siret),legalName:normalize(hit.nom_complet||hit.nom_raison_sociale||hit.denomination),address:[siege.adresse,siege.complement_adresse].filter(Boolean).map(normalize).join('\n'),postalCode:normalize(siege.code_postal),city:normalize(siege.libelle_commune||siege.commune),source:'recherche-entreprises.api.gouv.fr',activity:normalize(hit.activite_principale_libelle||hit.activite_principale||''),legalActivityCode:normalize(hit.activite_principale),website:normalize(hit.site_internet||hit.website),logoUrl:(normalize(hit.site_internet||hit.website)?companyLogoUrl(normalize(hit.site_internet||hit.website))||undefined:undefined)};
  }).filter((x:RegistryCompany)=>x.legalName||x.siret);
}

export function companyLogoUrl(website:string|null|undefined){if(!website)return null;try{return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(new URL(/^https?:\/\//i.test(website)?website:'https://'+website).hostname)}`}catch{return null}}
