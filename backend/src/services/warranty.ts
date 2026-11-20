import { query } from '../db.js';
import { parseWarrantyText, type ParsedWarranty } from './warranty-parser.js';
export { parseWarrantyText } from './warranty-parser.js';
export type { ParsedWarranty } from './warranty-parser.js';

export async function createInvoiceWarranty(org:string,quoteId:string,row:any):Promise<ParsedWarranty|null>{
  const parsed=parseWarrantyText(row?.warranty_text);
  await query('delete from warranties where quote_id=$1 and organization_id=$2',[quoteId,org]);
  if(!parsed)return null;
  const startsAt=new Date();
  const endsAt=new Date(startsAt);
  if(parsed.unit==='month'||parsed.unit==='year'){const originalDay=endsAt.getDate();const targetMonth=endsAt.getMonth()+(parsed.unit==='year'?parsed.value*12:parsed.value);endsAt.setDate(1);endsAt.setMonth(targetMonth);const lastDay=new Date(endsAt.getFullYear(),endsAt.getMonth()+1,0).getDate();endsAt.setDate(Math.min(originalDay,lastDay));}else if(parsed.unit==='week')endsAt.setDate(endsAt.getDate()+parsed.value*7);else endsAt.setDate(endsAt.getDate()+parsed.value);
  await query(
    'insert into warranties(organization_id,activity_id,client_id,quote_id,policy_name,duration_months,starts_at,ends_at,scope_type,snapshot_text) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [org,row.activity_id,row.client_id,quoteId,parsed.policyName,parsed.durationMonths,startsAt,endsAt,parsed.scopeType,parsed.policyName]
  );
  return parsed;
}
