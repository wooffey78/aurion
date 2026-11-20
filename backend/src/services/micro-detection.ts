// Bloc 8 — Proposition de catégorie d'activité micro à partir du code APE/NAF détecté
// par le registre public (recherche-entreprises.api.gouv.fr renvoie `activite_principale`).
//
// Règles du prompt : « Proposer une classification, mais ne pas considérer le code APE
// comme preuve suffisante des prestations réellement réalisées. » — La proposition est
// TOUJOURS explicite, sourcée, avec une confiance déclarée et un rappel à confirmer ;
// elle n'est jamais appliquée silencieusement (détection au clic, proposition
// « appliquer / ignorer », valeurs de l'utilisateur conservées).
import type { MicroCategoryCode } from './micro-referential.js';

export interface CategoryProposal {
  nafCode: string;
  section: string;
  category: MicroCategoryCode;
  categoryLabel: string;
  confidence: 'section-level' | 'code-level';
  note: string;
  source: string;
  proposedAt: string;
}

/** Section NAF → catégorie dominante (proposition de niveau section, jamais automatique). */
const SECTION_RULES: Record<string, { category: MicroCategoryCode; note: string }> = {
  A: { category: 'specific', note: 'Activité agricole : le micro social agricole relève de la MSA — rattachement à confirmer.' },
  B: { category: 'vente_bic', note: 'Industries extractives : production et vente de biens (BIC vente) — à confirmer.' },
  C: { category: 'vente_bic', note: 'Fabrication : production puis vente de biens (BIC vente) — à confirmer.' },
  D: { category: 'vente_bic', note: 'Production et distribution d’énergie : vente de biens (BIC) — à confirmer.' },
  E: { category: 'vente_bic', note: 'Production et distribution d’eau / déchets : à confirmer (BIC vente ou prestation).' },
  F: { category: 'services_bic', note: 'Construction et travaux : prestations artisanales (BIC services).' },
  G: { category: 'vente_bic', note: 'Commerce (achat/revente, boutique, e-commerce) : BIC vente de marchandises.' },
  H: { category: 'services_bic', note: 'Transports et entreposage : prestations commerciales (BIC) — à confirmer.' },
  I: { category: 'specific', note: 'Hébergement / restauration : règles spécifiques (fourniture de logement 12,30 %, location meublée de tourisme 6 %, restauration BIC) — à confirmer.' },
  J: { category: 'services_bnc', note: 'Information et communication : services informatiques et prestations (BNC) ; édition et télécom plutôt BIC — à confirmer.' },
  K: { category: 'specific', note: 'Banque / assurance : activités réglementées hors micro standard — à confirmer.' },
  L: { category: 'specific', note: 'Immobilier : location meublée 21,20 %, location meublée de tourisme 6 %, agences BIC — à confirmer.' },
  M: { category: 'services_bnc', note: 'Activités spécialisées, scientifiques et techniques : professions libérales (BNC) ; les professions réglementées relèvent de la CIPAV — à confirmer.' },
  N: { category: 'services_bic', note: 'Administratif et services de soutien : prestations commerciales (BIC) — à confirmer.' },
  O: { category: 'specific', note: 'Administration publique : hors périmètre micro-entrepreneur.' },
  P: { category: 'services_bnc', note: 'Enseignement et formation : prestations libérales (BNC) — à confirmer.' },
  Q: { category: 'services_bnc_cipav', note: 'Santé et action sociale libérale : professions réglementées affiliées CIPAV (BNC) — à confirmer (salarial = hors micro).' },
  R: { category: 'services_bnc', note: 'Arts, spectacles et activités récréatives : prestations libérales (BNC) — à confirmer.' },
  S: { category: 'services_bic', note: 'Autres services : réparation (95), services personnels (96) = prestations artisanales BIC ; activités associatives (94) plutôt BNC — à confirmer.' },
  T: { category: 'specific', note: 'Activités des ménages : rattachement à confirmer.' },
  U: { category: 'specific', note: 'Organisations extraterritoriales : hors périmètre micro-entrepreneur.' },
};

/** Précisions par code NAF les plus courants (proposition de niveau code, plus fiable). */
const CODE_RULES: Record<string, { category: MicroCategoryCode; note: string }> = {
  '62.01': { category: 'services_bnc', note: 'Programmation et conseil informatique : prestation libérale non réglementée (BNC).' },
  '62.02': { category: 'services_bnc', note: 'Conseil en systèmes et logiciels : prestation libérale non réglementée (BNC).' },
  '62.03': { category: 'services_bnc', note: 'Gestion d’infrastructures informatiques : prestation libérale non réglementée (BNC).' },
  '63.11': { category: 'services_bnc', note: 'Traitement de données / hébergement web : prestation (BNC) — à confirmer.' },
  '58.29': { category: 'vente_bic', note: 'Édition d’autres logiciels : commerce de produits informationnels — BIC/BNC à confirmer.' },
  '69.10': { category: 'services_bnc_cipav', note: 'Activités juridiques (avocats, notaires…) : profession réglementée (CIPAV selon activité).' },
  '69.20': { category: 'services_bnc_cipav', note: 'Comptables et experts-comptables : profession réglementée (CIPAV/ordre) — à confirmer.' },
  '70.21': { category: 'services_bnc', note: 'Conseil en relations publiques et communication : prestation libérale non réglementée (BNC).' },
  '71.11': { category: 'services_bnc_cipav', note: 'Architecture : profession réglementée (ordre des architectes, CIPAV pour les auto-entrepreneurs).' },
  '71.12': { category: 'services_bnc', note: 'Ingénierie / études techniques : prestation libérale non réglementée (BNC) — à confirmer selon réglementation.' },
  '74.10': { category: 'services_bnc_cipav', note: 'Activités spécialisées de design : à confirmer (CIPAV pour certaines professions).' },
  '74.20': { category: 'services_bnc', note: 'Photographie : prestation libérale non réglementée (BNC).' },
  '74.30': { category: 'services_bnc', note: 'Traduction / interprétation : prestation libérale non réglementée (BNC).' },
  '85.59': { category: 'services_bnc', note: 'Formation continue : prestation libérale non réglementée (BNC).' },
  '85.51': { category: 'services_bnc', note: 'Enseignement sportif et culturel : prestation libérale (BNC) — à confirmer.' },
  '86.21': { category: 'services_bnc_cipav', note: 'Médecine libérale : profession réglementée (CIPAV).' },
  '86.22': { category: 'services_bnc_cipav', note: 'Soins dentaires libéraux : profession réglementée (CIPAV).' },
  '86.23': { category: 'services_bnc_cipav', note: 'Pratique médicale libérale : profession réglementée (CIPAV).' },
  '86.90': { category: 'services_bnc_cipav', note: 'Autres activités de santé libérales (infirmiers, kinés…) : professions réglementées (CIPAV) — à confirmer.' },
  '90.03': { category: 'services_bnc', note: 'Activités artistiques indépendantes : prestation libérale (BNC) — à confirmer (Maison des artistes/URSSAF).' },
  '94.12': { category: 'services_bnc', note: 'Activités des associations : hors micro-entrepreneur — à confirmer.' },
  '95.11': { category: 'services_bic', note: 'Réparation d’ordinateurs : prestation artisanale (BIC services).' },
  '95.12': { category: 'services_bic', note: 'Réparation d’équipements : prestation artisanale (BIC services).' },
  '95.21': { category: 'services_bic', note: 'Réparation d’appareils électroménagers : prestation artisanale (BIC services).' },
  '95.23': { category: 'services_bic', note: 'Réparation de chaussures et articles en cuir : artisanat (BIC services).' },
  '95.25': { category: 'services_bic', note: 'Réparation d’articles personnels : artisanat (BIC services).' },
  '96.02': { category: 'services_bic', note: 'Coiffure et soins de beauté : artisanat (BIC services).' },
  '96.04': { category: 'services_bic', note: 'Entretien corporel (massage, esthétique) : artisanat (BIC services) — à confirmer.' },
  '56.10': { category: 'vente_bic', note: 'Restauration sur place : fourniture de repas (BIC vente selon URSSAF) — à confirmer.' },
  '56.21': { category: 'services_bic', note: 'Traiteurs et services de restauration : prestation (BIC) — à confirmer.' },
  '55.10': { category: 'vente_bic', note: 'Hôtels : fourniture de logement (12,30 %) — à confirmer.' },
  '68.20': { category: 'specific', note: 'Location de logements : location meublée 21,20 % ou meublée de tourisme 6 %, nue = hors micro BIC — à confirmer.' },
  // Codes ajoutés 15.4.35 : couverture élargie des activités micro courantes.
  '47.11': { category: 'vente_bic', note: 'Commerce de détail en magasin (alimentation généraliste) : BIC vente de marchandises.' },
  '47.19': { category: 'vente_bic', note: 'Autres commerces de détail en magasin : BIC vente de marchandises.' },
  '47.91': { category: 'vente_bic', note: 'Vente à distance / e-commerce : BIC vente de marchandises.' },
  '43.21': { category: 'services_bic', note: 'Travaux d’installation électrique : prestation artisanale (BIC services).' },
  '43.22': { category: 'services_bic', note: 'Travaux de plomberie, chauffage et climatisation : prestation artisanale (BIC services).' },
  '43.31': { category: 'services_bic', note: 'Travaux de peinture et vitrerie : prestation artisanale (BIC services).' },
  '43.32': { category: 'services_bic', note: 'Travaux de menuiserie métallique et de serrurerie : prestation artisanale (BIC services).' },
  '43.34': { category: 'services_bic', note: 'Fabrication et pose de menuiserie intérieure : prestation artisanale (BIC services).' },
  '43.39': { category: 'services_bic', note: 'Autres travaux d’installation (finitions du bâtiment) : prestation artisanale (BIC services) — à confirmer.' },
  '81.21': { category: 'services_bic', note: 'Nettoyage courant des bâtiments : prestation commerciale (BIC services).' },
  '81.29': { category: 'services_bic', note: 'Autres activités de nettoyage (vitrerie, désinfection) : prestation commerciale (BIC services).' },
  '81.30': { category: 'services_bic', note: 'Aménagement paysager / entretien de parcs et jardins : prestation artisanale (BIC services).' },
  '96.01': { category: 'services_bic', note: 'Blanchisserie / pressing : prestation artisanale (BIC services).' },
  '96.09': { category: 'services_bic', note: 'Autres services personnels (retouches et couture, toilettage…) : prestation artisanale (BIC services) — à confirmer.' },
  '49.32': { category: 'services_bic', note: 'Transport de voyageurs (taxi, VTC) : prestation commerciale (BIC services) — licence propre à confirmer.' },
  '49.41': { category: 'services_bic', note: 'Transport routier de marchandises / livraison : prestation commerciale (BIC services).' },
  '53.20': { category: 'services_bic', note: 'Autres activités de poste et de messagerie / livraison : prestation commerciale (BIC services) — à confirmer.' },
  '73.11': { category: 'services_bnc', note: 'Agences de publicité : prestation libérale non réglementée (BNC) — à confirmer selon mode d’exercice.' },
  '93.19': { category: 'services_bnc', note: 'Autres activités sportives (coaching sportif indépendant) : prestation libérale (BNC) — à confirmer.' },
  '59.11': { category: 'services_bnc', note: 'Production de films et de programmes : prestation libérale (BNC) — à confirmer.' },
  '31.09': { category: 'vente_bic', note: 'Fabrication d’autres meubles (création artisanale) : production puis vente de biens (BIC vente).' },
  '32.99': { category: 'vente_bic', note: 'Autres activités de fabrication (artisanat, bijoux, objets) : production puis vente de biens (BIC vente).' },
  '88.91': { category: 'specific', note: 'Accueil de jeunes enfants (assistant(e) maternel(le)) : régime spécifique de l’agrément — à confirmer auprès de l’URSSAF.' },
};

export const PROPOSAL_SOURCE = 'Code APE/NAF (INSEE) — proposition indicative, jamais une preuve des prestations réellement réalisées.';

/** Indices NAF → métier (profil) : affinage de la SUGGESTION de métier à partir du code APE
 * détecté. Proposé uniquement (jamais imposé) ; la liste complète des métiers reste
 * sélectionnable. Préfixes de code APE les plus courants du micro. */
export const NAF_PROFILE_HINTS: { prefix: string; profile: string; note: string }[] = [
  { prefix: '95.11', profile: 'computer-repair', note: 'Réparation d’ordinateurs → dépannage informatique.' },
  { prefix: '95.21', profile: 'computer-repair', note: 'Réparation d’équipements électroniques grand public → dépannage.' },
  { prefix: '95.25', profile: 'smartphone-repair', note: 'Réparation d’articles personnels (téléphones) → réparation smartphone.' },
  { prefix: '43.21', profile: 'electrical', note: 'Installation électrique → électricité / domotique.' },
  { prefix: '43.22', profile: 'plumbing', note: 'Plomberie / chauffage → plomberie / chauffage.' },
  { prefix: '43.31', profile: 'building', note: 'Peinture / vitrerie → bâtiment / rénovation.' },
  { prefix: '43.34', profile: 'building', note: 'Menuiserie intérieure → bâtiment / rénovation.' },
  { prefix: '43.39', profile: 'building', note: 'Finitions du bâtiment → bâtiment / rénovation.' },
  { prefix: '96.02', profile: 'beauty', note: 'Coiffure / soins de beauté → coiffure / esthétique.' },
  { prefix: '96.04', profile: 'beauty', note: 'Entretien corporel (massage) → bien-être.' },
  { prefix: '96.01', profile: 'cleaning', note: 'Blanchisserie / pressing → nettoyage / entretien.' },
  { prefix: '96.09', profile: 'couture', note: 'Retouches / services personnels → couture / retouches.' },
  { prefix: '81.21', profile: 'cleaning', note: 'Nettoyage courant → nettoyage / entretien.' },
  { prefix: '81.30', profile: 'cleaning', note: 'Aménagement paysager → jardinage / entretien.' },
  { prefix: '49.32', profile: 'transport', note: 'Taxi / VTC → transport.' },
  { prefix: '49.41', profile: 'transport', note: 'Transport routier de marchandises → transport / livraison.' },
  { prefix: '53.20', profile: 'transport', note: 'Messagerie / livraison → transport / livraison.' },
  { prefix: '62.01', profile: 'web-development', note: 'Programmation informatique → développement web / logiciel.' },
  { prefix: '62.02', profile: 'web-development', note: 'Conseil en systèmes et logiciels → développement.' },
  { prefix: '74.20', profile: 'creative', note: 'Photographie → graphisme / photo / vidéo.' },
  { prefix: '59.11', profile: 'creative', note: 'Production de films → photo / vidéo.' },
  { prefix: '73.11', profile: 'creative', note: 'Publicité → communication.' },
  { prefix: '56.21', profile: 'catering', note: 'Traiteurs → traiteur / pâtisserie.' },
  { prefix: '56.10', profile: 'catering', note: 'Restauration → traiteur (règles spécifiques à confirmer).' },
  { prefix: '85.51', profile: 'sport', note: 'Enseignement sportif → coaching sportif (ou cours selon discipline).' },
  { prefix: '85.59', profile: 'lessons', note: 'Formation continue → cours / formation.' },
  { prefix: '93.19', profile: 'sport', note: 'Activités sportives indépendantes → coaching sportif.' },
  { prefix: '88.91', profile: 'events', note: 'Accueil jeune enfant → service personnalisé (régime spécifique).' },
  { prefix: '47.91', profile: 'handcraft', note: 'Vente à distance de créations → artisanat / vente directe.' },
  { prefix: '31.09', profile: 'handcraft', note: 'Fabrication de meubles → artisanat / création.' },
  { prefix: '32.99', profile: 'handcraft', note: 'Fabrication d’objets → artisanat / création.' },
];

/** Suggère un métier (profil) à partir d'un code APE/NAF détecté — proposition indicative. */
export function proposeProfileFromNaf(nafCode: unknown): { profile: string; note: string } | null {
  const raw = String(nafCode ?? '').trim().toUpperCase().replace(/[^0-9.]/g, '');
  if (!raw) return null;
  for (const hint of NAF_PROFILE_HINTS) {
    if (raw.startsWith(hint.prefix)) return { profile: hint.profile, note: hint.note };
  }
  return null;
}

/** Propose une catégorie à partir d'un code APE/NAF (ex. « 47.11A », « 62.01Z », « 95.11Z »). */
const DIVISION_TO_SECTION: Record<string, string> = {
  '01':'A','02':'A','03':'A','05':'B','06':'B','07':'B','08':'B','09':'B',
  ...Object.fromEntries([...Array(23)].map((_, i) => [String(10 + i).padStart(2, '0'), 'C'])),
  '33':'D','34':'D','35':'D','36':'E','37':'E','38':'E','39':'E',
  '41':'F','42':'F','43':'F','45':'G','46':'G','47':'G','49':'H','50':'H','51':'H','52':'H','53':'H',
  '55':'I','56':'I','58':'J','59':'J','60':'J','61':'J','62':'J','63':'J','64':'K','65':'K','66':'K','68':'L',
  '69':'M','70':'M','71':'M','72':'M','73':'M','74':'M','75':'M','77':'N','78':'N','79':'N','80':'N','81':'N','82':'N','84':'O','85':'P',
  '86':'Q','87':'Q','88':'Q','90':'R','91':'R','92':'R','93':'R','94':'S','95':'S','96':'S','97':'T','98':'T','99':'U',
};

export function proposeCategoryFromNaf(nafCode: unknown, atISO = new Date().toISOString()): CategoryProposal | null {
  const raw = String(nafCode ?? '').trim().toUpperCase();
  if (!raw) return null;
  const normalizedCode = raw.match(/^(\d{2})\.\d{2}/)?.[0] || (raw.match(/^\d{2}/)?.[0] ? `${raw.slice(0, 2)}.00` : '');
  const section = /^[A-Z]$/.test(raw) ? raw : DIVISION_TO_SECTION[raw.slice(0, 2)] || '';
  if (!/^[A-U]$/.test(section)) return null;
  const codeRule = normalizedCode && normalizedCode !== '00' ? CODE_RULES[normalizedCode] : undefined;
  const rule = codeRule || SECTION_RULES[section];
  if (!rule) return null;
  return {
    nafCode: raw,
    section,
    category: rule.category,
    categoryLabel: rule.category,
    confidence: codeRule ? 'code-level' : 'section-level',
    note: rule.note,
    source: PROPOSAL_SOURCE,
    proposedAt: atISO.slice(0, 10),
  };
}
