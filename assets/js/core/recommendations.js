const stopWords=new Set(['de','du','des','la','le','les','et','en','pour','avec','sur','dans','un','une','d','l','the','and','or','a','an']);
export function normalizeRecommendationText(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
const tokens=value=>normalizeRecommendationText(value).split(' ').filter(x=>x&&x.length>1&&!stopWords.has(x));
// 15.4.55 — tokenisation cachée : le catalogue complet était re-tokenisé À CHAQUE FRAPPE dans
// l'éditeur (detectService + rankRelevantParts par ligne). Les jeux de token-sets sont calculés
// une seule fois par référence de tableau (WeakMap : invalidés naturellement quand le catalogue
// change) ; le comportement et le classement restent strictement identiques.
const serviceTokenCache=new WeakMap();
const serviceTokensOf=(services)=>{let sets=serviceTokenCache.get(services);if(!sets){sets=services.map(service=>({service,st:new Set(tokens([service?.name,service?.description].filter(Boolean).join(' ')))}));serviceTokenCache.set(services,sets)}return sets};
const partTokenCache=new WeakMap();
const partTokensOf=(parts)=>{let sets=partTokenCache.get(parts);if(!sets){sets=parts.map((part,index)=>({part,index,signature:normalizeRecommendationText([part?.name,part?.model,part?.variant,part?.color,part?.quality,part?.reference].join('|')),pt:new Set(tokens([part?.name,part?.category,part?.model,part?.variant,part?.color,part?.quality,part?.reference].filter(Boolean).join(' ')))}));partTokenCache.set(parts,sets)}return sets};
export function detectService(input,services=[]){const raw=normalizeRecommendationText(input);if(!raw)return null;const exact=services.find(s=>normalizeRecommendationText(s?.name)===raw);if(exact)return exact;const inputTokens=new Set(tokens(raw));let best=null,bestScore=0;for(const {service,st} of serviceTokensOf(services)){if(!st.size)continue;let hits=0;for(const t of inputTokens)if(st.has(t))hits++;
  // 15.4.70 — un seul mot générique (« remplacement », « réparation ») ne suffit plus à
  // sélectionner une prestation à plusieurs mots : il faut au moins deux correspondances,
  // sauf pour une prestation dont le nom ne comporte qu'un seul mot significatif. La détection
  // reste volontairement stricte : une mauvaise prestation est plus coûteuse qu'une suggestion.
  if(hits<Math.min(2,st.size))continue;
  const score=hits/Math.max(1,inputTokens.size);if(score>bestScore){bestScore=score;best=service}}return bestScore>=0.2?best:null}
export function rankRelevantParts(service,parts=[],learnedSignatures=[]){const serviceTokens=new Set(tokens([service?.name,service?.description].filter(Boolean).join(' ')));const learned=new Set((learnedSignatures||[]).map(normalizeRecommendationText));return partTokensOf(parts).map(({part,index,signature,pt})=>{let hits=0;for(const t of serviceTokens)if(pt.has(t))hits++;let score=learned.has(signature)?100:0;score+=hits*10;return{part,index,score}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.part)}
