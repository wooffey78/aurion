export type WarrantyScope='parts'|'labor'|'both';

export interface ParsedWarranty {
  policyName:string;
  days:number;
  durationMonths:number;
  scopeType:WarrantyScope;
  value:number;
  unit:'day'|'week'|'month'|'year';
}

export function parseWarrantyText(value:unknown):ParsedWarranty|null{
  const policyName=String(value??'').trim();
  if(!policyName)return null;
  const text=policyName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe').toLowerCase();
  const match=text.match(/(\d+)\s*(jour|jours|semaine|semaines|mois|an|ans)\b/i);
  if(!match)return null;
  const n=Math.max(0,Number(match[1]));
  if(!Number.isFinite(n))return null;
  const unit=match[2].toLowerCase();
  const parsedUnit:'day'|'week'|'month'|'year'=unit.startsWith('jour')?'day':unit.startsWith('semaine')?'week':unit.startsWith('an')?'year':'month';
  const days=parsedUnit==='day'?n:parsedUnit==='week'?n*7:parsedUnit==='year'?n*365:n*30;
  const hasParts=/piece|pieces/.test(text);
  const hasLabor=/main\s*-?\s*d['’]?oeuvre|m\.\s*o\.?/.test(text);
  const scopeType:WarrantyScope=hasParts&&hasLabor?'both':hasParts?'parts':hasLabor?'labor':'both';
  return {policyName,days,durationMonths:parsedUnit==='year'?n*12:parsedUnit==='month'?n:Math.ceil(days/30),scopeType,value:n,unit:parsedUnit};
}
