// Bloc 8 — Proposition de catégorie d'activité micro à partir du code APE/NAF détecté
// par le registre public (recherche-entreprises.api.gouv.fr renvoie `activite_principale`).
//
// Règles du prompt : « Proposer une classification, mais ne pas considérer le code APE
// comme preuve suffisante des prestations réellement réalisées. » — La proposition est
// TOUJOURS explicite, sourcée, avec une confiance déclarée et un rappel à confirmer ;
// elle n'est jamais appliquée silencieusement (détection au clic, proposition
// « appliquer / ignorer », valeurs de l'utilisateur conservées).
import type { MicroCategoryCode } from './micro-referential.js';
import { MICRO_CATEGORIES } from './micro-referential.js';
import { PROFILE_CODES, RULES, EXTRA_KEYWORDS } from './profiles.js';

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
  { prefix: '43.31', profile: 'building', note: 'Travaux de plâtrerie → bâtiment / rénovation.' },
  { prefix: '43.34', profile: 'building', note: 'Travaux de peinture et vitrerie → bâtiment / rénovation.' },
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
  { prefix: '88.91', profile: 'childcare', note: 'Accueil de jeunes enfants → garde d’enfants (régime spécifique à confirmer).' },
  // Indices ajoutés 15.4.36 pour les dix nouveaux métiers.
  { prefix: '88.10', profile: 'home-care', note: 'Aide à domicile pour personnes âgées → aide à la personne.' },
  { prefix: '87.30', profile: 'home-care', note: 'Hébergement médicalisé / aide aux personnes âgées → aide à la personne.' },
  { prefix: '86.90', profile: 'wellness', note: 'Activités paramédicales → bien-être (profession réglementée : CIPAV à confirmer).' },
  { prefix: '01.13', profile: 'agriculture', note: 'Culture de légumes / maraîchage → agriculture.' },
  { prefix: '01.19', profile: 'agriculture', note: 'Autres cultures non permanentes → agriculture.' },
  { prefix: '01.50', profile: 'agriculture', note: 'Élevage et cultures associées → agriculture (MSA à confirmer).' },
  { prefix: '55.20', profile: 'hospitality', note: 'Hébergement touristique de courte durée → hébergement / location meublée.' },
  { prefix: '55.10', profile: 'hospitality', note: 'Hôtellerie → hébergement (règles spécifiques à confirmer).' },
  { prefix: '68.31', profile: 'real-estate', note: 'Agences immobilières → immobilier.' },
  { prefix: '68.32', profile: 'real-estate', note: 'Gestion de biens immobiliers → gestion locative.' },
  { prefix: '80.10', profile: 'security', note: 'Activités de sécurité privée → gardiennage / sécurité.' },
  { prefix: '80.20', profile: 'security', note: 'Systèmes de sécurité → télésurveillance / installation.' },
  { prefix: '90.01', profile: 'music-audio', note: 'Activités artistiques (musique) → musique / son.' },
  { prefix: '59.20', profile: 'music-audio', note: 'Enregistrement sonore et édition musicale → studio / musique.' },
  { prefix: '47.91', profile: 'retail', note: 'Vente à distance / e-commerce → commerce de détail (BIC vente).' },
  { prefix: '74.30', profile: 'writing', note: 'Traduction et interprétation → rédaction / traduction.' },
  { prefix: '90.03', profile: 'writing', note: 'Création artistique littéraire → rédaction.' },
  { prefix: '47.11', profile: 'retail', note: 'Commerce de détail alimentaire → commerce de détail.' },
  { prefix: '47.19', profile: 'retail', note: 'Autre commerce de détail → commerce de détail.' },
  { prefix: '31.09', profile: 'handcraft', note: 'Fabrication de meubles → artisanat / création.' },
  { prefix: '32.99', profile: 'handcraft', note: 'Fabrication d’objets → artisanat / création.' },
  // Calibrage étendu (chantier 3, 15.4.44) : divisions et sous-divisions NAF révision 2
  // courantes du micro, préfixes disjoints des entrées existantes ; les notes décrivent la
  // division (elles restent indicatives : jamais une preuve des prestations réelles).
  { prefix: '41.20', profile: 'building', note: 'Construction de bâtiments → bâtiment / rénovation (régime des constructions à confirmer).' },
  { prefix: '43.32', profile: 'building', note: 'Travaux de menuiserie bois et PVC → bâtiment / rénovation.' },
  { prefix: '43.33', profile: 'building', note: 'Travaux de revêtement des sols et des murs (carrelage) → bâtiment / rénovation.' },
  { prefix: '43.91', profile: 'building', note: 'Travaux de couverture (toiture) → bâtiment / rénovation.' },
  { prefix: '43.99', profile: 'building', note: 'Autres travaux spécialisés de construction → bâtiment / rénovation.' },
  { prefix: '45.20', profile: 'auto', note: 'Entretien et réparation de véhicules automobiles → garage / mécanique.' },
  { prefix: '45.31', profile: 'auto', note: 'Commerce de voitures → garage (vente : règles BIC spécifiques à confirmer).' },
  { prefix: '49.39', profile: 'transport', note: 'Transports terrestres de voyageurs → transport.' },
  { prefix: '52.29', profile: 'transport', note: 'Services auxiliaires de transport (logistique) → transport / livraison.' },
  { prefix: '55.30', profile: 'hospitality', note: 'Camping et parcs de caravanes → hébergement touristique.' },
  { prefix: '55.90', profile: 'hospitality', note: 'Autres hébergements touristiques → hébergement / location meublée.' },
  { prefix: '56.29', profile: 'catering', note: 'Autres services de restauration → traiteur / restauration (règles spécifiques à confirmer).' },
  { prefix: '62.03', profile: 'web-development', note: 'Gestion d’installations informatiques → informatique / maintenance.' },
  { prefix: '62.09', profile: 'web-development', note: 'Autres services informatiques → développement / maintenance.' },
  { prefix: '63.11', profile: 'web-development', note: 'Traitement de données et hébergement → hébergement web / informatique.' },
  { prefix: '69.20', profile: 'consulting', note: 'Activités comptables → conseil / gestion (réglementation comptable à confirmer).' },
  { prefix: '70.21', profile: 'creative', note: 'Relations publiques et communication → communication.' },
  { prefix: '70.22', profile: 'consulting', note: 'Conseil pour les affaires et le management → conseil / gestion.' },
  { prefix: '74.10', profile: 'creative', note: 'Activités de design et graphisme → graphisme / création visuelle.' },
  { prefix: '78.10', profile: 'consulting', note: 'Agences de placement (RH) → accompagnement / gestion des ressources humaines.' },
  { prefix: '80.30', profile: 'security', note: 'Activités d’enquêtes → sécurité (profession réglementée à confirmer).' },
  { prefix: '81.29', profile: 'cleaning', note: 'Autres services d’entretien (désinfection) → nettoyage / entretien.' },
  { prefix: '85.32', profile: 'lessons', note: 'Enseignement technique et professionnel → cours / formation.' },
  { prefix: '85.52', profile: 'lessons', note: 'Enseignement culturel (musique, langues) → cours.' },
  { prefix: '85.53', profile: 'sport', note: 'Clubs de sports → coaching sportif.' },
  { prefix: '88.51', profile: 'childcare', note: 'Crèches et garde d’âge préscolaire → garde d’enfants (régime spécifique à confirmer).' },
  { prefix: '90.02', profile: 'events', note: 'Soutien au spectacle vivant → événementiel / spectacle.' },
  { prefix: '95.22', profile: 'couture', note: 'Réparation d’articles personnels (vêtements) → couture / retouches.' },
  { prefix: '95.23', profile: 'couture', note: 'Réparation de chaussures et articles en cuir → retouches / maroquinerie.' },
  { prefix: '01.11', profile: 'agriculture', note: 'Culture de céréales → agriculture (MSA à confirmer).' },
  { prefix: '01.47', profile: 'agriculture', note: 'Élevage de volailles → agriculture (MSA à confirmer).' },
  { prefix: '32.12', profile: 'handcraft', note: 'Bijouterie fantaisie → bijoux / création.' },
  { prefix: '47.75', profile: 'retail', note: 'Vente de produits cosmétiques et d’hygiène → commerce de détail.' },
  { prefix: '47.78', profile: 'retail', note: 'Autres commerces de détail spécialisés → commerce de détail.' },
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

// ── V2 (chantier 2) — Moteur de propositions de métiers ────────────────────────────
// Conception V2 : classement multi-signaux de plusieurs profils métiers, niveaux de
// confiance explicites et expliqués, conservation systématique des choix manuels.
// Le moteur est DÉTERMINISTE et LOCAL (aucun service d'IA distante — standard posé en
// 15.4.0 avec le retrait de l'IA et respecté par bordereau-parser). Il ne sait PAS
// écrire : il ne touche jamais la sélection retenue (activity_profile_overrides) —
// seule une action utilisateur explicite l'écrit, via les routes prévues.
//
// Pondérations documentées (score entier interne, plafonné à 100, jamais affiché
// comme un pourcentage de certitude) — CENTRALISÉES dans la constante unique
// PROPOSAL_TUNING ci-dessous, conformément à l'exigence de conception : « les seuils
// de classement doivent être centralisés et configurables, et non dispersés dans
// plusieurs fichiers ». Ajuster un poids ou un seuil se fait à un seul endroit.
//   - code APE/NAF précis (préfixe connu)       : +50
//   - mots-clés de la description de l'activité : +10 par mot-clé reconnu, max +25
//   - mots-clés du nom de l'activité            : +15 (si au moins un mot-clé)
//   - prestations du catalogue correspondantes  : +6 par prestation, max +24
//   - pièces du catalogue correspondantes       : +4 par pièce, max +12
//     (catalogue plafonné à +30 au total)
//   - activités secondaires ou complémentaires  : +8 par mot-clé reconnu, max +15
export const PROPOSAL_TUNING = {
  /** Code APE/NAF précis (préfixe de règle connue vers ce profil). */
  nafPrecisePoints: 50,
  /** Mots-clés de la description de l'activité (+10 par mot-clé reconnu). */
  descriptionPerKeyword: 10,
  descriptionCap: 25,
  /** Mots-clés du nom de l'activité (forfait si au moins un mot-clé reconnu). */
  nameMatchPoints: 15,
  /** Prestations du catalogue correspondantes (+6 par prestation reconnue). */
  servicePerMatch: 6,
  /** Pièces du catalogue correspondantes (+4 par pièce reconnue). */
  partPerMatch: 4,
  /** Plafond de la famille catalogue (prestations + pièces cumulées). */
  catalogueCap: 30,
  /** Activités secondaires ou complémentaires (+8 par mot-clé reconnu). */
  secondaryPerKeyword: 8,
  secondaryCap: 15,
  /** Plafond du score interne (jamais affiché comme un pourcentage de certitude). */
  maxScore: 100,
  /** Nombre maximal de propositions affichées (conception : une liste de 2 à 5). */
  maxProposals: 5,
  /** Catalogue étayé seul : nombre de prestations reconnues à partir duquel la
   * correspondance devient « moyen » (plausible, à confirmer). */
  catalogueAloneThreshold: 2,
  /** Contradiction : score texte minimal d'un profil concurrent pour signaler que le
   * code NAF pointe ici alors que le texte (description, catalogue) désigne nettement
   * un autre métier (conception V2, tableau 2 des critères de confiance). */
  textContradictionThreshold: 20,
} as const;
//
// Échelle de confiance (mapping déterministe, critères écrits ici et testés par contrat,
// conformes au tableau 2 de la conception V2) :
//   - très élevé : code NAF précis ET au moins deux autres familles concordantes ET
//                  aucune contradiction détectée ;
//   - élevé      : code NAF précis ET au moins une autre famille ; OU trois familles
//                  ou plus concordantes sans code NAF précis ; une contradiction
//                  détectée et AFFICHÉE (raison sourcée) compte comme « expliquée » :
//                  elle bloque le niveau très élevé sans rétrograder le niveau élevé ;
//   - moyen      : code NAF précis seul ; OU deux familles concordantes sans code NAF
//                  précis ; OU catalogue étayé seul (au moins deux prestations reconnues) ;
//   - faible     : un seul signal non étayé ou aucun (demande de confirmation requise).
export interface ProfileProposal {
  profile: string;
  score: number;
  confidence: 'tres-eleve' | 'eleve' | 'moyen' | 'faible';
  confidenceLabel: string;
  reasons: string[];
  /** Signaux contradictoires détectés entre familles (conception V2, tableau 2 :
   * « signaux contradictoires entre familles »). Cités comme raisons sourcées et
   * affichés à l'utilisateur ; bloquent le niveau « très élevé ». */
  contradictions: string[];
  category: MicroCategoryCode | null;
  categoryLabel: string | null;
  matchedNaf: string | null;
}

export interface ProfileSignals {
  nafCode?: string | null;
  name?: string | null;
  description?: string | null;
  services?: string[] | null;
  parts?: string[] | null;
  secondaryActivities?: string[] | null;
}

export interface ProfileProposalsResult {
  proposals: ProfileProposal[];
  requiresConfirmation: boolean;
  source: string;
}

export const PROFILE_PROPOSAL_SOURCE =
  'Moteur de propositions Aurion (V2) — propositions classées, indicatives et expliquées ; jamais appliquées sans confirmation explicite.';

const CONFIDENCE_LABELS: Record<ProfileProposal['confidence'], string> = {
  'tres-eleve': 'Très élevé — correspondance particulièrement forte',
  eleve: 'Élevé — correspondance cohérente et bien étayée',
  moyen: 'Moyen — correspondance plausible, à confirmer',
  faible: 'Faible — correspondance incertaine, informations complémentaires nécessaires',
};

/** Texte normalisé (minuscules, sans accents) pour la comparaison des mots-clés. */
function normText(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/** Fragments réellement reconnus d'un profil dans un texte (preuves citables, sans doublons). */
function matchedKeywords(text: string, code: string): string[] {
  if (!text) return [];
  const raw = String(text).toLowerCase();
  const nrm = normText(text);
  const frags: string[] = [];
  for (const [c, re] of RULES) {
    if (c !== code) continue;
    const m = re.exec(raw) || re.exec(nrm);
    if (m?.[0]) frags.push(m[0].trim());
  }
  for (const w of EXTRA_KEYWORDS[code] || []) {
    if (raw.includes(w) || nrm.includes(normText(w))) frags.push(w);
  }
  return uniq(frags.map(f => f.trim()).filter(Boolean));
}

/** Propose plusieurs métiers classés par pertinence à partir de tous les signaux disponibles.
 * Sortie pure (aucune écriture) : la sélection retenue n'est modifiée que par une action
 * utilisateur explicite (routes dédiées), conformément à l'invariant V2 de conservation
 * des choix manuels. */
export function proposeProfilesFromSignals(signals: ProfileSignals): ProfileProposalsResult {
  const tuning = PROPOSAL_TUNING;
  const nafRaw = String(signals.nafCode ?? '').trim();
  const name = String(signals.name ?? '');
  const description = String(signals.description ?? '');
  const services = Array.isArray(signals.services) ? signals.services.map(v => String(v)).filter(Boolean) : [];
  const parts = Array.isArray(signals.parts) ? signals.parts.map(v => String(v)).filter(Boolean) : [];
  const secondary = Array.isArray(signals.secondaryActivities) ? signals.secondaryActivities.map(v => String(v)).filter(Boolean) : [];

  // Signaux NAF calculés une fois : préfixes précis vers un profil + catégorie micro cohérente.
  const nafNormalized = nafRaw.toUpperCase().replace(/[^0-9.]/g, '');
  const nafHints = nafNormalized ? NAF_PROFILE_HINTS.filter(h => nafNormalized.startsWith(h.prefix)) : [];
  const nafCategory = nafRaw ? proposeCategoryFromNaf(nafRaw) : null;

  // Passe 1 — score de chaque profil candidat depuis toutes les familles de signaux.
  type Draft = {
    code: string;
    score: number;
    textScore: number;
    families: string[];
    svcCount: number;
    reasons: string[];
    hint: (typeof nafHints)[number] | null;
  };
  const drafts: Draft[] = [];
  for (const code of PROFILE_CODES) {
    const reasons: string[] = [];
    const families: string[] = [];
    let score = 0;
    let textScore = 0;
    // 1) Code APE/NAF précis (préfixe connu) — signal « registre », hors score texte.
    const hint = nafHints.find(h => h.profile === code) || null;
    if (hint) {
      score += tuning.nafPrecisePoints;
      families.push('naf');
      reasons.push(`Code APE/NAF ${nafRaw} (INSEE) : ${hint.note}`);
    }
    // 2) Description de l'activité renseignée par l'utilisateur.
    const desc = matchedKeywords(description, code);
    if (desc.length) {
      const pts = Math.min(tuning.descriptionCap, desc.length * tuning.descriptionPerKeyword);
      score += pts; textScore += pts;
      families.push('description');
      reasons.push(`Description de l'activité : « ${desc.slice(0, 3).join(' », « ')} »`);
    }
    // 3) Nom de l'activité.
    const nm = matchedKeywords(name, code);
    if (nm.length) {
      score += tuning.nameMatchPoints; textScore += tuning.nameMatchPoints;
      families.push('nom');
      reasons.push(`Nom de l'activité : « ${nm.slice(0, 2).join(' », « ')} »`);
    }
    // 4) Prestations et pièces effectivement proposées (catalogue réel).
    const svc = uniq(services.map(s => matchedKeywords(s, code)[0]).filter(Boolean) as string[]);
    const prt = uniq(parts.map(s => matchedKeywords(s, code)[0]).filter(Boolean) as string[]);
    if (svc.length) reasons.push(`Prestations du catalogue : « ${svc.slice(0, 3).join(' », « ')} »`);
    if (prt.length) reasons.push(`Pièces du catalogue : « ${prt.slice(0, 3).join(' », « ')} »`);
    if (svc.length || prt.length) {
      const pts = Math.min(tuning.catalogueCap, svc.length * tuning.servicePerMatch + prt.length * tuning.partPerMatch);
      score += pts; textScore += pts;
      families.push('catalogue');
    }
    const svcCount = svc.length + prt.length;
    // 5) Activités secondaires ou complémentaires déclarées.
    const sec = uniq(secondary.map(s => matchedKeywords(s, code)[0]).filter(Boolean) as string[]);
    if (sec.length) {
      const pts = Math.min(tuning.secondaryCap, sec.length * tuning.secondaryPerKeyword);
      score += pts; textScore += pts;
      families.push('secondaire');
      reasons.push(`Activités secondaires : « ${sec.slice(0, 2).join(' », « ')} »`);
    }
    if (!score) continue;
    drafts.push({ code, score, textScore, families, svcCount, reasons, hint });
  }

  // Contradiction (conception V2, tableau 2) : profil qui ressort LE PLUS fort du texte
  // hors code NAF. Déterministe — égalité départagée par code de profil.
  const textLeader = drafts
    .filter(d => d.textScore >= tuning.textContradictionThreshold)
    .sort((a, b) => b.textScore - a.textScore || (a.code < b.code ? -1 : 1))[0] || null;

  // Passe 2 — niveau de confiance, contradiction, données manquantes, classement.
  const proposals: ProfileProposal[] = drafts.map(d => {
    const nafPrecis = d.families.includes('naf');
    const others = d.families.filter(f => f !== 'naf').length;
    let confidence: ProfileProposal['confidence'];
    if (nafPrecis && others >= 2) confidence = 'tres-eleve';
    else if (nafPrecis && others === 1) confidence = 'eleve';
    else if (nafPrecis) confidence = 'moyen';
    else if (d.families.length >= 3) confidence = 'eleve';
    else if (d.families.length === 2) confidence = 'moyen';
    else if (d.families[0] === 'catalogue' && d.svcCount >= tuning.catalogueAloneThreshold) confidence = 'moyen';
    else confidence = 'faible';

    // Contradiction : le code NAF précis pointe ici alors que le texte désigne nettement
    // un autre profil. Critère du tableau 2 : « très élevé » exige l'absence de
    // contradiction ; expliquée par une raison sourcée, elle ne rétrograde pas « élevé ».
    const contradictions: string[] = [];
    if (nafPrecis && textLeader && textLeader.code !== d.code) {
      contradictions.push(`Signal contraire : la description et le catalogue ressortent pour « ${textLeader.code} » alors que le code APE/NAF pointe ici — décision à l'utilisateur.`);
    }
    if (confidence === 'tres-eleve' && contradictions.length) confidence = 'eleve';

    // Raisons (2 à 4, courtes et sourcées) : preuves d'abord, contradiction ensuite,
    // données manquantes enfin (exigence §5 : expliquer aussi les données manquantes).
    const out: string[] = d.reasons.slice(0, contradictions.length ? 3 : 4);
    out.push(...contradictions);
    if (!nafRaw) out.push('Donnée manquante : aucun code APE/NAF exploitable — la correspondance ne s’appuie pas sur le registre.');
    if (!description.trim()) out.push('Donnée manquante : aucune description d’activité — ajoutez-la pour affiner le classement.');
    if (!services.length && !parts.length) out.push('Donnée manquante : aucune prestation ni pièce du catalogue reconnue.');
    if (out.length < 2) out.push('Correspondance incertaine : informations complémentaires nécessaires avant confirmation.');
    return {
      profile: d.code,
      score: Math.min(tuning.maxScore, d.score),
      confidence,
      confidenceLabel: CONFIDENCE_LABELS[confidence],
      reasons: out.slice(0, 4),
      contradictions,
      category: nafCategory?.category ?? null,
      categoryLabel: nafCategory ? MICRO_CATEGORIES[nafCategory.category] : null,
      matchedNaf: d.hint ? nafRaw : null,
    };
  })
    .sort((a, b) => b.score - a.score || (a.profile < b.profile ? -1 : 1))
    .slice(0, tuning.maxProposals);

  const best = proposals[0];
  return {
    proposals,
    requiresConfirmation: !best || best.confidence === 'faible',
    source: PROFILE_PROPOSAL_SOURCE,
  };
}
