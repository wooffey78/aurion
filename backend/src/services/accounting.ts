import { query } from '../db.js';
export interface MonthRow { month:string; revenueHt:number; vat:number; purchases:number; purchaseVat:number; social:number; mileage:number; invoiceCount:number }
const n=(v:any)=>Number(v||0);
/** Comptabilité de trésorerie : chaque versement est affecté au mois d'encaissement,
 * le montant restant de la facture est d'abord affecté au principal puis aux majorations. */
export async function monthlyAccounting(orgId:string,activityId:string,year?:number):Promise<MonthRow[]>{
 const filter=year?"and date_trunc('year',paid_at)=make_date($3,1,1)":'';
 const params:any[]=[orgId,activityId];if(year)params.push(year);
 const inv=await query(`
   with payment_rows as (
     select p.id payment_id,p.quote_id,p.amount,p.paid_at,q.total_ttc,q.vat_rate,q.part_cost,q.shipping_cost,
            q.mileage_total,q.mileage_mode,q.mileage_internal_rate,q.mileage_km,q.labor_internal_cost_ht,
            q.purchase_vat_mode,q.purchase_vat_rate,q.contribution_snapshot,q.urssaf_rate,
            q.coefficient_basis,q.coefficient_unit,q.coefficient_value,q.part_coefficient_percent,
            coalesce((select sum(i.quantity) from quote_items i where i.quote_id=q.id),1)::numeric part_quantity,
            coalesce(sum(p.amount) over(partition by q.id order by p.paid_at,p.id rows between unbounded preceding and 1 preceding),0)::numeric paid_before,
            case when q.mileage_mode='margin' then case when coalesce(q.mileage_internal_rate,0)>0 then coalesce(q.mileage_km,0)*q.mileage_internal_rate else coalesce(q.mileage_total,0) end else 0 end::numeric internal_mileage
     from invoice_payments p join quotes q on q.id=p.quote_id
     where q.organization_id=$1 and q.activity_id=$2 and q.document_type='invoice'
   ), allocated as (
     select pr.*,
       greatest(0,least(amount,greatest(0,coalesce(total_ttc,0)-paid_before)))::numeric base_amount,
       greatest(0,amount-greatest(0,least(amount,greatest(0,coalesce(total_ttc,0)-paid_before))))::numeric penalty_amount,
       (coalesce(part_cost,0)+coalesce(shipping_cost,0)+coalesce(labor_internal_cost_ht,0)+internal_mileage)::numeric base_cost,
       case when coalesce(coefficient_basis,'purchase')='purchase' then
         case when coalesce(coefficient_unit,'percent')='euro' then coalesce(coefficient_value,0)*greatest(1,coalesce(part_quantity,1))
         else coalesce(part_cost,0)*coalesce(coefficient_value,part_coefficient_percent,0)/100 end else 0 end::numeric coefficient_markup,
       case when coalesce(total_ttc,0)>0 then least(1,greatest(0,amount-greatest(0,coalesce(total_ttc,0)-paid_before))/nullif(total_ttc,0)+least(greatest(0,coalesce(total_ttc,0)-paid_before),amount)/nullif(total_ttc,0)) else 0 end::numeric allocation_ratio
     from payment_rows pr
   )
   select date_trunc('month',paid_at)::date as "month",
          sum(base_amount/nullif(1+vat_rate/100,0)+penalty_amount)::numeric revenue_ht,
          sum(base_amount-(base_amount/nullif(1+vat_rate/100,0)))::numeric vat,
          sum(base_cost*case when coalesce(total_ttc,0)>0 then least(1,base_amount/nullif(total_ttc,0)) else 0 end)::numeric purchases,
          sum((coalesce(part_cost,0)+coalesce(shipping_cost,0))*case when coalesce(total_ttc,0)>0 then least(1,base_amount/nullif(total_ttc,0)) else 0 end*case when purchase_vat_mode='exempt' then 0 else coalesce(purchase_vat_rate,vat_rate,0)/100 end)::numeric purchase_vat,
          sum(((base_amount/nullif(1+vat_rate/100,0))+penalty_amount)*coalesce((select sum(coalesce((c->>'rate')::numeric,0)) from jsonb_array_elements(case when jsonb_typeof(contribution_snapshot)='array' then contribution_snapshot else '[]'::jsonb end) c where coalesce(c->>'basis','ca_ht')='ca_ht'),urssaf_rate,0)/100)::numeric social,
          sum(coalesce(mileage_total,0)*case when coalesce(total_ttc,0)>0 then least(1,base_amount/nullif(total_ttc,0)) else 0 end)::numeric mileage,
          count(distinct quote_id)::int invoice_count
   from allocated where true ${filter}
   group by 1`,params);
 const entParams:any[]=[orgId,activityId];if(year)entParams.push(year);
 const ent=await query(`select date_trunc('month',entry_date)::date as "month",coalesce(sum(case when entry_type='purchase' then amount else 0 end),0)::numeric purchases,coalesce(sum(case when entry_type='social' then amount else 0 end),0)::numeric social,coalesce(sum(case when entry_type='sav' then amount else 0 end),0)::numeric sav from accounting_entries where organization_id=$1 and activity_id=$2 ${year?"and date_trunc('year',entry_date)=make_date($3,1,1)":''} group by 1`,entParams);
 const byMonth=new Map<string,MonthRow>();
 for(const r of inv.rows){const k=r.month.toISOString().slice(0,10);byMonth.set(k,{month:r.month,revenueHt:n(r.revenue_ht),vat:n(r.vat),purchases:n(r.purchases),purchaseVat:n(r.purchase_vat),social:n(r.social),mileage:n(r.mileage),invoiceCount:Number(r.invoice_count||0)})}
 for(const r of ent.rows){const k=r.month.toISOString().slice(0,10);const cur=byMonth.get(k)||{month:r.month,revenueHt:0,vat:0,purchases:0,purchaseVat:0,social:0,mileage:0,invoiceCount:0};cur.purchases+=n(r.purchases);cur.social+=n(r.social);cur.revenueHt+=n(r.sav);byMonth.set(k,cur)}
 return [...byMonth.values()].sort((a,b)=>+new Date(b.month)-+new Date(a.month));
}
