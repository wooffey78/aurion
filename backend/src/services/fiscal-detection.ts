import { profileFor } from './profiles.js';
import { proposeCategoryFromNaf } from './micro-detection.js';

export type LegalFormOption={code:string;label:string;regime:string};
export type ContributionPreset={name:string;rate:number|null;basis:string;mandatory:boolean;variable:boolean;source:string};

export const LEGAL_FORMS:LegalFormOption[]=[
  {code:'EI_MICRO',label:'Entreprise individuelle — micro-entreprise',regime:'Micro-social'},
  {code:'EI_REEL',label:'Entreprise individuelle — régime réel',regime:'Travailleur indépendant'},
  {code:'EURL',label:'EURL — entreprise unipersonnelle à responsabilité limitée',regime:'Travailleur indépendant'},
  {code:'SARL',label:'SARL — société à responsabilité limitée',regime:'Travailleur indépendant / assimilé selon le dirigeant'},
  {code:'SASU',label:'SASU — société par actions simplifiée unipersonnelle',regime:'Assimilé salarié'},
  {code:'SAS',label:'SAS — société par actions simplifiée',regime:'Assimilé salarié'},
  {code:'SA',label:'SA — société anonyme',regime:'Assimilé salarié / statut du dirigeant'},
  {code:'SNC',label:'SNC — société en nom collectif',regime:'Travailleur indépendant pour les associés concernés'},
  {code:'SCS',label:'SCS — société en commandite simple',regime:'Selon le statut du dirigeant / associé'},
  {code:'SCA',label:'SCA — société en commandite par actions',regime:'Selon le statut du dirigeant / associé'},
  {code:'SELARL',label:'SELARL — société d’exercice libéral à responsabilité limitée',regime:'Travailleur indépendant / statut du dirigeant'},
  {code:'SELASU',label:'SELASU — société d’exercice libéral par actions simplifiée unipersonnelle',regime:'Assimilé salarié'},
  {code:'SELAS',label:'SELAS — société d’exercice libéral par actions simplifiée',regime:'Assimilé salarié'},
  {code:'SELAFA',label:'SELAFA — société d’exercice libéral à forme anonyme',regime:'Assimilé salarié / statut du dirigeant'},
  {code:'SCP',label:'SCP — société civile professionnelle',regime:'Travailleur indépendant / associés'},
  {code:'SCM',label:'SCM — société civile de moyens',regime:'Selon la situation de chaque professionnel'},
  {code:'SCI',label:'SCI — société civile immobilière',regime:'Selon activité et rémunération'},
  {code:'SOCIETE_CIVILE',label:'Autre société civile',regime:'Selon la situation du dirigeant / associé'},
  {code:'GIE',label:'GIE — groupement d’intérêt économique',regime:'Selon la situation des membres'},
  {code:'GEIE',label:'GEIE — groupement européen d’intérêt économique',regime:'Selon la situation des membres'},
  {code:'EARL',label:'EARL — exploitation agricole à responsabilité limitée',regime:'Régime agricole / statut du dirigeant'},
  {code:'GAEC',label:'GAEC — groupement agricole d’exploitation en commun',regime:'Régime agricole / statut des associés'},
  {code:'SCEA',label:'SCEA — société civile d’exploitation agricole',regime:'Régime agricole / statut des associés'},
  {code:'ASSOCIATION',label:'Association loi 1901',regime:'Selon activité et situation des dirigeants'},
];

// Bloc 7 (recentrage micro-entreprise) : le compte de l'entrepreneur est exclusivement une
// entreprise individuelle (EI), régime micro par défaut ; l'EI au réel reste disponible comme
// variante d'entreprise individuelle. Les sociétés (SAS, SASU, SARL, EURL, SA, SNC, SCI, SEL…,
// associations, formes agricoles) ne sont plus proposées pour le PROFIL DU PROPRIÉTAIRE — elles
// restent acceptées comme tiers professionnels (clients, fournisseurs) sans aucune conversion.
// LEGAL_FORMS (liste complète ci-dessus) est conservée uniquement pour étiqueter les valeurs
// historiques et calculer les régimes correspondants (données déjà enregistrées).
export const OWNER_LEGAL_FORMS:LegalFormOption[]=[
  {code:'EI_MICRO',label:'Entreprise individuelle — micro-entreprise',regime:'Micro-social'},
  {code:'EI_REEL',label:'Entreprise individuelle — régime réel',regime:'Travailleur indépendant'},
];

/** Catégories juridiques INSEE (nature_juridique) correspondant à une entreprise individuelle. */
export const EI_LEGAL_FORM_CODES=['1000','1990'];

export const OWNER_LEGAL_FORM_REFUSAL='Aurion est conçu exclusivement pour les entreprises individuelles (micro-entrepreneurs). Cette forme juridique n’est pas prise en charge pour le compte de l’entrepreneur : aucune conversion automatique n’est effectuée. Les sociétés restent acceptées comme clients ou fournisseurs.';

/** Vrai si la valeur saisie/détectée désigne bien une entreprise individuelle (EI_MICRO ou EI_REEL). */
export function isOwnerLegalFormAllowed(legalForm:string){
  const code=normaliseForm(legalForm);
  return code==='EI_MICRO'||code==='EI_REEL';
}

/** Vrai si la catégorie juridique INSEE détectée par le registre public désigne une entreprise individuelle. */
export function isEIJuridique(legalFormCode:string){
  return EI_LEGAL_FORM_CODES.includes(String(legalFormCode||'').trim());
}

export function detectLegalFormFromProfile(activityName:string, description:string){
  const text=(String(activityName||'')+' '+String(description||'')).toLowerCase();
  // Bloc 7 : seule l'entreprise individuelle est reconnue pour le compte de l'entrepreneur.
  // Une description évoquant une société (SARL, SAS…) n'est JAMAIS convertie : refus explicite.
  const societyRules:[RegExp,string][]=[
    // « sa » (possessif très courant) volontairement exclu pour éviter les faux refus.
    [/\b(eurl|sasu|sarl|sas|sci|snc|scs|sca|selarl|selasu|selas|selafa|scp|scm|gie|geie|earl|gaec|scea)\b/,''],
    [/\b(société|societe)\b/,'']
  ];
  if(societyRules.some(([re])=>re.test(text)))return {legalForm:null,legalFormCode:null,message:OWNER_LEGAL_FORM_REFUSAL};
  const rules:[RegExp,string][]=[
    [/\b(auto[- ]?entrepreneur|micro[- ]?entreprise|micro[- ]entrepreneur)\b/,'Entreprise individuelle — micro-entreprise'],[/\b(entreprise individuelle|ei)\b/,'Entreprise individuelle — régime réel']
  ];
  const hit=rules.find(([re])=>re.test(text));
  if(!hit)return {legalForm:null,legalFormCode:null,message:'Aucune forme juridique suffisamment explicite n’a été détectée dans le nom ou la description. Aurion prend en charge les entreprises individuelles (micro-entreprise ou réel).'};
  return {legalForm:hit[1],legalFormCode:LEGAL_FORMS.find(x=>x.label===hit[1])?.code||null};
}

function normaliseForm(legalForm:string){
  const raw=String(legalForm||'').trim().toUpperCase().replace(/[’']/g,"'").replace(/\s+/g,' ');
  if(/MICRO|AUTO[- ]?ENTREPRENEUR|MICRO[- ]?ENTREPRISE/.test(raw))return 'EI_MICRO';
  if(/^EI$|ENTREPRISE INDIVIDUELLE/.test(raw))return 'EI_REEL';
  for(const x of LEGAL_FORMS){if(raw===x.code||raw.includes(x.code)||raw.includes(x.label.toUpperCase()))return x.code;}
  return raw;
}

/** Catégorie micro par défaut de chaque profil métier : garantit que TOUTES les activités
 * reçoivent des cotisations configurées (micro-social + CFP + versement libératoire selon
 * l'option), même quand le nom de l'activité ne contient aucun mot-clé typique.
 * Les mots-clés explicites du nom restent prioritaires ; la catégorie reste modifiable
 * par l'utilisateur (bloc 8, proposition jamais imposée). */
export type MicroCategory='vente_bic'|'services_bic'|'services_bnc'|'services_bnc_cipav'|'specific';

export const PROFILE_MICRO_CATEGORY: Record<string,MicroCategory> = {
  'smartphone-repair':'services_bic','computer-repair':'services_bic','plumbing':'services_bic',
  'electrical':'services_bic','auto':'services_bic','web-development':'services_bnc',
  'creative':'services_bnc','beauty':'services_bic','cleaning':'services_bic','consulting':'services_bnc',
  'building':'services_bic','catering':'services_bic','couture':'services_bic','transport':'services_bic',
  'pets':'services_bic','lessons':'services_bnc','sport':'services_bnc','handcraft':'vente_bic',
  'events':'services_bnc','generic-services':'services_bic',
  // Profils étendus (15.4.36) : chaque nouveau métier reçoit une catégorie explicite.
  'home-care':'services_bic','wellness':'services_bnc','agriculture':'specific',
  'hospitality':'specific','real-estate':'specific','security':'services_bic',
  'music-audio':'services_bnc','writing':'services_bnc','childcare':'specific','retail':'vente_bic',
};

/** Taux de cotisations micro 2026 par catégorie RÉELLE (social + CFP).
 * La CFP dépend du caractère commercial (0,10 %) ou artisanal (0,30 %) de l'activité BIC :
 * elle n'est plus imposée à 0,30 % pour toutes les prestations BIC. */
export const CONTRIBUTION_RATES_2026 = {
  vente_bic: { social: 12.3, cfp: 0.1, regime: 'Micro-social · vente de marchandises (BIC)', cfpLabel: 'commerçants' },
  services_bic_artisan: { social: 21.2, cfp: 0.3, regime: 'Micro-social · prestations de services artisanales (BIC)', cfpLabel: 'artisans' },
  services_bic_commercial: { social: 21.2, cfp: 0.1, regime: 'Micro-social · prestations de services commerciales (BIC)', cfpLabel: 'commerçants' },
  services_bnc: { social: 25.6, cfp: 0.2, regime: 'Micro-social · autres prestations de services / profession libérale (BNC)', cfpLabel: 'professions libérales' },
  services_bnc_cipav: { social: 23.2, cfp: 0.2, regime: 'Micro-social · profession libérale réglementée affiliée CIPAV (BNC)', cfpLabel: 'professions libérales' },
  specific: { social: null as number | null, cfp: null as number | null, regime: 'Micro-social · activité à règles spécifiques (à confirmer)', cfpLabel: 'à confirmer' },
} as const;

/** Seuils de franchise en base de TVA 2026 (art. 293 B du CGI).
 * Vente de marchandises : 85 000 € (seuil majoré 93 500 €) ;
 * Prestations de services : 37 500 € (seuil majoré 41 250 €).
 * Le régime micro-social N'IMPLIQUE PAS la franchise : elle se constate sur le chiffre d'affaires
 * de l'année précédente ou sur une option expresse. */
export const VAT_FRANCHISE_THRESHOLDS_2026 = {
  vente: { base: 85000, majore: 93500, label: 'vente de marchandises et fourniture de logement' },
  services: { base: 37500, majore: 41250, label: 'prestations de services' },
} as const;

export type VatCategory = keyof typeof VAT_FRANCHISE_THRESHOLDS_2026;
export type VatRegimeChoice = 'franchise' | 'assujetti' | 'assujetti_option';

/** Mots-clés des professions libérales réglementées affiliées CIPAV (23,20 %, jamais 25,60 %). */
const CIPAV_KEYWORDS = /cipav|avocat|notaire|architecte|expert[- ]?comptable|comptable|m[ée]decin|kin[ée]|infirmi|orthophoniste|orthoptiste|sage[- ]?femme|ost[ée]opathe|psychologue|psychoth[ée]rapeute|v[ée]t[ée]rinaire|huissier|g[ée]om[èe]tre|di[ée]t[ée]ticien|podologue|ergoth[ée]rapeute|chiropracteur|chiropraticien/;
/** Activités commerciales (revente de biens) : BIC vente + CFP commerçant 0,10 %. */
const COMMERCE_KEYWORDS = /commerce|commer[çc]ant|boutique|magasin|n[ée]goce|e-?commerce|d[ée]taillant|[ée]picerie|primeur/;

/** Catégorie micro-sociale réelle d'une activité (mots-clés explicites prioritaires). */
export function microCategoryFor(profileCode:string, text:string, nafCode?:string|null):MicroCategory{
  const t=String(text||'').toLowerCase();
  if(CIPAV_KEYWORDS.test(t))return 'services_bnc_cipav';
  if(COMMERCE_KEYWORDS.test(t)||/\bvente\b|revente/.test(t))return 'vente_bic';
  // Code APE détecté au registre : un code précis affine la catégorie avant les mots-clés
  // génériques (« libéral », « artisan ») qui ne distinguent pas les régimes spéciaux.
  const naf=nafCode?proposeCategoryFromNaf(nafCode):null;
  if(naf&&naf.confidence==='code-level'&&naf.category!=='specific')return naf.category as MicroCategory;
  if(/\bbnc\b|lib[ée]ral/.test(t))return 'services_bnc';
  if(naf&&naf.category!=='specific')return naf.category as MicroCategory;
  return PROFILE_MICRO_CATEGORY[profileCode]||'services_bic';
}

/** Détermine le régime de TVA — jamais déduit du seul statut micro. */
export function detectVatRegime(input:{category:VatCategory;annualRevenueHt?:number|null;vatRegime?:VatRegimeChoice|string|null}){
  const category:VatCategory=input.category==='vente'?'vente':'services';
  const thresholds=VAT_FRANCHISE_THRESHOLDS_2026[category];
  const choice=String(input.vatRegime||'') as VatRegimeChoice|'';
  const revenue=input.annualRevenueHt===null||input.annualRevenueHt===undefined?null:Number(input.annualRevenueHt);
  const revenueKnown=revenue!==null&&Number.isFinite(revenue)&&revenue>=0;
  const base={category,thresholds:{base:thresholds.base,majore:thresholds.majore}};
  if(choice==='franchise')return {...base,franchise:true,rate:0,toConfirm:false,
    regime:'Franchise en base de TVA · 0 % (régime confirmé)',
    reason:`Franchise en base confirmée : seuil ${thresholds.base.toLocaleString('fr-FR')} € (${thresholds.label}).`};
  if(choice==='assujetti'||choice==='assujetti_option')return {...base,franchise:false,rate:20,toConfirm:false,
    regime:`TVA · taux normal 20 %${choice==='assujetti_option'?' (option volontaire)':' (assujetti)'}`,
    reason:'Assujettissement à la TVA confirmé : aucun taux 0 % appliqué.'};
  if(!revenueKnown)return {...base,franchise:false,rate:20,toConfirm:true,
    regime:'TVA · taux normal 20 % — régime À CONFIRMER (le régime micro ne vaut pas franchise en base)',
    reason:`Le régime micro-social ne suffit pas à établir la franchise en base de TVA. Renseignez votre chiffre d'affaires de l'année précédente (seuil ${thresholds.base.toLocaleString('fr-FR')} € / ${thresholds.majore.toLocaleString('fr-FR')} € pour ${thresholds.label}) ou choisissez votre régime : la TVA est appliquée à 20 % par défaut, jamais à 0 % sans confirmation.`};
  if(revenue! > thresholds.majore)return {...base,franchise:false,rate:20,toConfirm:false,
    regime:'TVA · taux normal 20 % (seuil de franchise dépassé)',
    reason:`Chiffre d'affaires ${revenue!.toLocaleString('fr-FR')} € > seuil majoré ${thresholds.majore.toLocaleString('fr-FR')} € : la TVA est due.`};
  if(revenue! > thresholds.base)return {...base,franchise:true,rate:0,toConfirm:false,
    regime:'Franchise en base de TVA · 0 % (seuil de base dépassé, franchise maintenue pour l’année en cours)',
    reason:`Chiffre d'affaires ${revenue!.toLocaleString('fr-FR')} € compris entre ${thresholds.base.toLocaleString('fr-FR')} € et ${thresholds.majore.toLocaleString('fr-FR')} € : franchise maintenue pour l'année en cours, TVA due au 1er janvier suivant.`};
  return {...base,franchise:true,rate:0,toConfirm:false,
    regime:'Franchise en base de TVA · 0 %',
    reason:`Chiffre d'affaires ${revenue!.toLocaleString('fr-FR')} € ≤ seuil de franchise ${thresholds.base.toLocaleString('fr-FR')} € (${thresholds.label}).`};
}

/** Cotisations micro-sociales d'une activité — la CFP commerce/artisanat et la CIPAV sont distinctes. */
export function detectContributionPresets(legalForm:string, profileCode:string, activityName:string, description:string, nafCode?:string|null, commercial?:boolean|null){
  const code=normaliseForm(legalForm);
  const p=profileFor(activityName,description,profileCode);
  // Le titre du profil est une chaîne d'interface (« vente à la ferme », « vente directe »…) :
  // il ne doit pas décider de la catégorie micro. Seuls le nom et la description de l'activité
  // font foi, puis la catégorie par défaut du métier.
  const text=(activityName+' '+description).toLowerCase();
  const category=microCategoryFor(p.code,text,nafCode);
  const isMicro=code==='EI_MICRO';
  let socialRate:number|null=null, socialRegime='À confirmer selon le régime social', cfpRate:number|null=null;
  const contributions:ContributionPreset[]=[];
  if(isMicro){
    // Caractère commercial explicite (activité déclarée commerçante) : CFP 0,10 % au lieu du
    // taux artisan 0,30 %, y compris pour des prestations de services BIC.
    const bicCommercial=category==='services_bic'&&(commercial===true||COMMERCE_KEYWORDS.test(text));
    const key=category==='services_bic'?(bicCommercial?'services_bic_commercial':'services_bic_artisan'):category;
    const rates=CONTRIBUTION_RATES_2026[key as keyof typeof CONTRIBUTION_RATES_2026];
    socialRegime=rates.regime;
    if(rates.social!==null){
      socialRate=rates.social;
      contributions.push({name:'Cotisations sociales micro-social',rate:rates.social,basis:'chiffre d’affaires HT',mandatory:true,variable:false,source:'URSSAF · barème 2026'});
      cfpRate=rates.cfp;
      contributions.push({name:'Contribution à la formation professionnelle',rate:rates.cfp,basis:'chiffre d’affaires',mandatory:true,variable:false,source:`URSSAF · ${rates.cfpLabel} · barème 2026`});
    } else {
      // Activité à règles spécifiques : aucun faux taux fixe — cotisations présentes mais variables.
      contributions.push({name:'Cotisations sociales micro-social',rate:null,basis:'chiffre d’affaires HT',mandatory:true,variable:true,source:'URSSAF / MSA · régime spécifique à confirmer'});
      contributions.push({name:'Contribution à la formation professionnelle',rate:null,basis:'chiffre d’affaires',mandatory:true,variable:true,source:'URSSAF / MSA · taux à confirmer'});
    }
  }
  return {category,socialRate,socialRegime,cfpRate,contributions,isMicro};
}

export function detectFiscalSettings(legalForm:string, profileCode:string, activityName:string, description:string, options:{annualRevenueHt?:number|null;vatRegime?:VatRegimeChoice|string|null;nafCode?:string|null;commercial?:boolean|null}={}){
  const code=normaliseForm(legalForm);
  // Aurion s'adresse aux micro-entrepreneurs. Une organisation dont la forme juridique n'a pas
  // encore été renseignée (installation locale, parcours d'accueil interrompu) ne doit pas perdre
  // la détection des cotisations : la forme micro est supposée et signalée comme telle, puis
  // remplacée dès que l'utilisateur déclare sa situation réelle dans Paramètres.
  const legalFormAssumed=!code;
  const effectiveForm=code||'EI_MICRO';
  const p=profileFor(activityName,description,profileCode);
  const detected=detectContributionPresets(effectiveForm,p.code,activityName,description,options.nafCode,options.commercial);
  let {contributions}=detected;
  const socialRate=detected.socialRate;
  let socialRegime=detected.socialRegime;
  const category=detected.category;
  if(!detected.isMicro){
    contributions=[];
  }
  if(!detected.isMicro&&['EI_REEL','EURL','SARL','SELARL','SNC','SCP'].includes(code)) {
    socialRegime='Travailleur indépendant · calcul selon le revenu et la situation du dirigeant';
    contributions.push({name:'Cotisations sociales du travailleur indépendant',rate:null,basis:'revenu professionnel',mandatory:true,variable:true,source:'URSSAF · calcul selon assiette et situation'});
  } else if(!detected.isMicro&&['SASU','SAS','SA','SELASU','SELAS','SELAFA'].includes(code)) {
    socialRegime='Assimilé salarié · calcul selon la rémunération du dirigeant';
    contributions.push({name:'Cotisations sociales sur rémunération',rate:null,basis:'rémunération brute',mandatory:true,variable:true,source:'URSSAF · régime général · calcul selon rémunération'});
  } else if(!detected.isMicro&&code) {
    socialRegime=LEGAL_FORMS.find(x=>x.code===code)?.regime||'À confirmer selon le régime social';
    contributions.push({name:'Cotisations sociales',rate:null,basis:'revenu ou rémunération selon le statut',mandatory:true,variable:true,source:'URSSAF · calcul selon la situation'});
  }
  const totalRate=contributions.filter(x=>x.rate!==null).reduce((t,x)=>t+Number(x.rate||0),0);
  // P0 : la TVA dépend de l'activité ET du chiffre d'affaires, jamais du seul statut micro.
  const vatCategory:VatCategory=category==='vente_bic'?'vente':'services';
  const vat=detectVatRegime({category:vatCategory,annualRevenueHt:options.annualRevenueHt,vatRegime:options.vatRegime});
  return {
    legalFormCode:effectiveForm,
    legalFormAssumed,
    legalFormLabel:legalFormAssumed?'Micro-entrepreneur (forme juridique à confirmer)':(LEGAL_FORMS.find(x=>x.code===code)?.label||String(legalForm||'')),
    socialRate:contributions.length&&contributions.every(x=>x.rate!==null)?Number(totalRate.toFixed(4)):socialRate,
    socialRegime,
    microCategory:category,
    cfpRate:detected.cfpRate,
    vatRate:vat.rate,
    vatRegime:vat.regime,
    vatFranchise:vat.franchise,
    vatToConfirm:vat.toConfirm,
    vatCategory,
    vatThresholds:vat.thresholds,
    vatReason:vat.reason,
    contributions,
    reason:(legalFormAssumed?'Forme juridique non renseignée : régime micro-entrepreneur supposé pour détecter les cotisations, à confirmer dans Paramètres → Entreprise. ':'')+'Détection automatique fondée sur la forme juridique et le profil métier. Les régimes dont les cotisations dépendent du revenu ou de la rémunération restent variables et ne sont pas remplacés par un faux taux fixe.'
  };
}
