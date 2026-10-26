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


export function detectLegalFormFromProfile(activityName:string, description:string){
  const text=(String(activityName||'')+' '+String(description||'')).toLowerCase();
  const rules:[RegExp,string][]=[
    [/\b(eurl)\b/,'EURL — entreprise unipersonnelle à responsabilité limitée'],[/\b(sasu)\b/,'SASU — société par actions simplifiée unipersonnelle'],[/\b(sarl)\b/,'SARL — société à responsabilité limitée'],[/\b(sas)\b/,'SAS — société par actions simplifiée'],[/\b(sa)\b/,'SA — société anonyme'],[/\b(sci)\b/,'SCI — société civile immobilière'],[/\b(snc)\b/,'SNC — société en nom collectif'],[/\b(selarl)\b/,'SELARL — société d’exercice libéral à responsabilité limitée'],[/\b(selasu)\b/,'SELASU — société d’exercice libéral par actions simplifiée unipersonnelle'],[/\b(selas)\b/,'SELAS — société d’exercice libéral par actions simplifiée'],[/\b(auto[- ]?entrepreneur|micro[- ]?entreprise|micro[- ]entrepreneur)\b/,'Entreprise individuelle — micro-entreprise'],[/\b(entreprise individuelle|ei)\b/,'Entreprise individuelle — régime réel']
  ];
  const hit=rules.find(([re])=>re.test(text));
  if(!hit)return {legalForm:null,message:'Aucune forme juridique suffisamment explicite n’a été détectée dans le nom ou la description.'};
  return {legalForm:hit[1],legalFormCode:LEGAL_FORMS.find(x=>x.label===hit[1])?.code||null};
}

function normaliseForm(legalForm:string){
  const raw=String(legalForm||'').trim().toUpperCase().replace(/[’']/g,"'").replace(/\s+/g,' ');
  if(/MICRO|AUTO[- ]?ENTREPRENEUR|MICRO[- ]?ENTREPRISE/.test(raw))return 'EI_MICRO';
  if(/^EI$|ENTREPRISE INDIVIDUELLE/.test(raw))return 'EI_REEL';
  for(const x of LEGAL_FORMS){if(raw===x.code||raw.includes(x.code)||raw.includes(x.label.toUpperCase()))return x.code;}
  return raw;
}

export function detectFiscalSettings(legalForm:string, profileCode:string, activityName:string, description:string){
  const code=normaliseForm(legalForm);
  const p=profileFor(activityName,description,profileCode);
  const text=(activityName+' '+description+' '+p.title).toLowerCase();
  const isMicro=code==='EI_MICRO';
  const isLiberal=/\b(BNC|LIBE|LIBÉRAL|PROFESSION LIBÉRALE|CIPAV)\b/.test(text);
  const isSale=/\b(COMMERCE|VENTE|REVENTE|BOUTIQUE|NÉGOCE|NEGOCE)\b/.test(text);
  let socialRate:number|null=null, socialRegime='À confirmer selon le régime social';
  const contributions:ContributionPreset[]=[];
  if(isMicro){
    if(isSale){
      socialRate=12.3; socialRegime='Micro-social · vente de marchandises (BIC)';
      contributions.push({name:'Cotisations sociales micro-social',rate:12.3,basis:'chiffre d’affaires HT',mandatory:true,variable:false,source:'URSSAF · barème 2026'});
      contributions.push({name:'Contribution à la formation professionnelle',rate:0.1,basis:'chiffre d’affaires',mandatory:true,variable:false,source:'URSSAF · commerçants · barème 2026'});
    } else if(isLiberal){
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
