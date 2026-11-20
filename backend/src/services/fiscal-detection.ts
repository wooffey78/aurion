import { profileFor } from './profiles.js';

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
export const PROFILE_MICRO_CATEGORY: Record<string,'vente_bic'|'services_bic'|'services_bnc'|'services_bnc_cipav'> = {
  'smartphone-repair':'services_bic','computer-repair':'services_bic','plumbing':'services_bic',
  'electrical':'services_bic','auto':'services_bic','web-development':'services_bnc',
  'creative':'services_bnc','beauty':'services_bic','cleaning':'services_bic','consulting':'services_bnc',
  'building':'services_bic','catering':'services_bic','couture':'services_bic','transport':'services_bic',
  'pets':'services_bic','lessons':'services_bnc','sport':'services_bnc','handcraft':'vente_bic',
  'events':'services_bnc','generic-services':'services_bic',
};

export function detectFiscalSettings(legalForm:string, profileCode:string, activityName:string, description:string){
  const code=normaliseForm(legalForm);
  const p=profileFor(activityName,description,profileCode);
  const text=(activityName+' '+description+' '+p.title).toLowerCase();
  const isMicro=code==='EI_MICRO';
  const isLiberal=/\b(BNC|LIBE|LIBÉRAL|PROFESSION LIBÉRALE|CIPAV)\b/.test(text);
  const isSale=/\b(COMMERCE|VENTE|REVENTE|BOUTIQUE|NÉGOCE|NEGOCE)\b/.test(text);
  // Hiérarchie : mots-clés explicites → catégorie par défaut du profil métier → services BIC.
  const profileCategory=!isSale&&!isLiberal?PROFILE_MICRO_CATEGORY[p.code]||'services_bic':null;
  let socialRate:number|null=null, socialRegime='À confirmer selon le régime social';
  const contributions:ContributionPreset[]=[];
  if(isMicro){
    if(isSale||profileCategory==='vente_bic'){
      socialRate=12.3; socialRegime='Micro-social · vente de marchandises (BIC)';
      contributions.push({name:'Cotisations sociales micro-social',rate:12.3,basis:'chiffre d’affaires HT',mandatory:true,variable:false,source:'URSSAF · barème 2026'});
      contributions.push({name:'Contribution à la formation professionnelle',rate:0.1,basis:'chiffre d’affaires',mandatory:true,variable:false,source:'URSSAF · commerçants · barème 2026'});
    } else if(isLiberal||profileCategory==='services_bnc'||profileCategory==='services_bnc_cipav'){
      socialRate=25.6; socialRegime='Micro-social · autres prestations de services / profession libérale (BNC)';
      contributions.push({name:'Cotisations sociales micro-social',rate:25.6,basis:'chiffre d’affaires HT',mandatory:true,variable:false,source:'URSSAF · barème 2026'});
      contributions.push({name:'Contribution à la formation professionnelle',rate:0.2,basis:'chiffre d’affaires',mandatory:true,variable:false,source:'URSSAF · professions libérales · barème 2026'});
    } else {
      socialRate=21.2; socialRegime='Micro-social · prestations de services commerciales ou artisanales (BIC)';
      contributions.push({name:'Cotisations sociales micro-social',rate:21.2,basis:'chiffre d’affaires HT',mandatory:true,variable:false,source:'URSSAF · barème 2026'});
      contributions.push({name:'Contribution à la formation professionnelle',rate:0.3,basis:'chiffre d’affaires',mandatory:true,variable:false,source:'URSSAF · artisans · barème 2026'});
    }
  } else if(['EI_REEL','EURL','SARL','SELARL','SNC','SCP'].includes(code)) {
    socialRegime='Travailleur indépendant · calcul selon le revenu et la situation du dirigeant';
    contributions.push({name:'Cotisations sociales du travailleur indépendant',rate:null,basis:'revenu professionnel',mandatory:true,variable:true,source:'URSSAF · calcul selon assiette et situation'});
  } else if(['SASU','SAS','SA','SELASU','SELAS','SELAFA'].includes(code)) {
    socialRegime='Assimilé salarié · calcul selon la rémunération du dirigeant';
    contributions.push({name:'Cotisations sociales sur rémunération',rate:null,basis:'rémunération brute',mandatory:true,variable:true,source:'URSSAF · régime général · calcul selon rémunération'});
  } else if(code) {
    socialRegime=LEGAL_FORMS.find(x=>x.code===code)?.regime||'À confirmer selon le régime social';
    contributions.push({name:'Cotisations sociales',rate:null,basis:'revenu ou rémunération selon le statut',mandatory:true,variable:true,source:'URSSAF · calcul selon la situation'});
  }
  const totalRate=contributions.filter(x=>x.rate!==null).reduce((t,x)=>t+Number(x.rate||0),0);
  const vatFranchise=isMicro;
  return {
    legalFormCode:code,
    legalFormLabel:LEGAL_FORMS.find(x=>x.code===code)?.label||String(legalForm||''),
    socialRate:contributions.length&&contributions.every(x=>x.rate!==null)?Number(totalRate.toFixed(4)):socialRate,
    socialRegime,
    vatRate:vatFranchise?0:20,
    vatRegime:vatFranchise?'Franchise en base de TVA · 0 %':'TVA · taux normal 20 % (à confirmer selon activité/régime)',
    contributions,
    reason:'Détection automatique fondée sur la forme juridique et le profil métier. Les régimes dont les cotisations dépendent du revenu ou de la rémunération restent variables et ne sont pas remplacés par un faux taux fixe.'
  };
}
