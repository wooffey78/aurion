import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, db } from '../db.js';
import crypto from 'node:crypto';
import { renderDocument, fileFromKey } from '../services/document-renderer.js';
import { readFile, unlink } from 'node:fs/promises';
import { profileFor, defaultCgvFor, listProfiles, PROFILE_CODES } from '../services/profiles.js';
import { computePricing } from '../services/pricing.js';
import { AurionError } from '../services/errors.js';
import { sendOrgMail, mailConfigured } from '../services/mail.js';
import { loadAppointment, syncAppointment } from '../services/calendar.js';
import { clientSummary } from '../services/clients.js';
import { monthlyAccounting } from '../services/accounting.js';
import { accountingReportCsv } from '../services/accounting-report.js';
import { signatureFor } from '../services/signature.js';
import { lookupFrenchCompany, searchFrenchCompanies, normalizeSiret, normalizeSiren } from '../services/public-registry.js';
import { savePrivateUpload } from '../services/storage.js';
import { buildStructuredInvoice } from '../services/electronic-invoice.js';
import { detectFiscalSettings, detectLegalFormFromProfile, LEGAL_FORMS } from '../services/fiscal-detection.js';
import { calculateReminderPenalty, reminderTotal } from '../services/invoice-workflow.js';
import { createInvoiceWarranty } from '../services/warranty.js';
import { syncPrimaryActivityFromOrganization } from '../services/configuration-sync.js';
import type { PenaltyMode } from '../services/invoice-workflow.js';

type QuoteItem={label:string;quantity:number;unitCost:number;unitPrice?:number|null;partId:string|null;saleCoefficientPercent?:number|null};
type SqlExecutor={query:(text:string,values?:unknown[])=>Promise<any>};
const numericInput = z.union([z.number().finite(), z.string().max(80), z.null()]).optional();
const optionalUuid = z.union([z.string().uuid(), z.literal(''), z.null()]).optional();
const quoteLineInputSchema = z.object({
  label: z.string().max(500).optional(), name: z.string().max(500).optional(),
  quantity: numericInput, unitCost: numericInput, unitPrice: numericInput,
  partId: optionalUuid, saleCoefficientPercent: numericInput,
}).passthrough();
const clientCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  email: z.string().trim().email().max(254).or(z.literal('')).nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  interventionAddress: z.string().max(1000).nullable().optional(),
  siret: z.string().max(40).nullable().optional(),
  estimatedMinutes: numericInput,
  activityId: optionalUuid,
}).passthrough();
const clientPatchInputSchema = z.object({
  name: z.string().trim().min(1).max(240).optional(),
  email: z.string().trim().email().max(254).or(z.literal('')).nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  interventionAddress: z.string().max(1000).nullable().optional(),
  siret: z.string().max(40).nullable().optional(),
  estimatedMinutes: numericInput,
  activityId: optionalUuid,
}).passthrough();

const stockInput = z.union([
  z.number().int().min(0).max(10_000_000),
  z.string().regex(/^[0-9]{1,8}$/),
  z.literal(''),
  z.null(),
]).optional();
const partCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  activityId: optionalUuid,
  category: z.string().max(160).nullable().optional(),
  model: z.string().max(160).nullable().optional(),
  variant: z.string().max(160).nullable().optional(),
  color: z.string().max(100).nullable().optional(),
  quality: z.string().max(100).nullable().optional(),
  reference: z.string().max(160).nullable().optional(),
  stock: stockInput,
  sellingPrice: numericInput,
  saleCoefficientPercent: numericInput,
  notes: z.string().max(4000).nullable().optional(),
}).passthrough();
const partPatchInputSchema = partCreateInputSchema.partial();
const partPriceInputSchema = z.object({
  supplierId: z.string().uuid(),
  supplierReference: z.string().max(160).nullable().optional(),
  purchasePrice: numericInput,
  available: z.boolean().optional(),
}).passthrough();

const supplyCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  activityId: optionalUuid,
  supplierId: optionalUuid,
  reference: z.string().max(160).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  purchasePrice: numericInput,
}).passthrough();
const supplyPatchInputSchema = z.object({
  name: z.string().trim().min(1).max(240).optional(),
  supplierId: optionalUuid,
  reference: z.string().max(160).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  purchasePrice: numericInput,
}).passthrough();

const supplierCreateInputSchema = z.object({
  activityId: optionalUuid,
  name: z.string().trim().min(1).max(240),
  legalName: z.string().max(240).nullable().optional(),
  email: z.string().trim().email().max(254).or(z.literal('')).nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  website: z.string().max(2048).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  siret: z.string().max(40).nullable().optional(),
  siren: z.string().max(40).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  city: z.string().max(160).nullable().optional(),
  registrySource: z.string().max(160).nullable().optional(),
  legalForm: z.string().max(160).nullable().optional(),
}).passthrough();
const supplierPatchInputSchema = supplierCreateInputSchema.partial();

const activityCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  code: z.string().trim().max(160).optional(),
  description: z.string().max(4000).nullable().optional(),
  legalForm: z.string().max(240).nullable().optional(),
  cgvText: z.string().max(12000).nullable().optional(),
  urssafRate: numericInput,
  vatRate: numericInput,
  marginMinPercent: numericInput,
  defaultPartCoefficientPercent: numericInput,
  defaultLaborCoefficientPercent: numericInput,
  profileCode: z.string().max(120).nullable().optional(),
  autoFiscalDetect: z.boolean().optional(),
  active: z.boolean().optional(),
  paymentTerms: z.string().max(4000).nullable().optional(),
  insuranceInfo: z.string().max(4000).nullable().optional(),
  mediatorInfo: z.string().max(4000).nullable().optional(),
  legalNotes: z.string().max(8000).nullable().optional(),
  quoteValidityDays: numericInput,
}).passthrough();
const activityPatchInputSchema = activityCreateInputSchema.partial();
const activityParamsSchema = z.object({ id: z.string().uuid() });

const quoteCreateInputSchema = z.object({
  clientId: optionalUuid, activityId: optionalUuid, intervention: z.string().max(240).optional(),
  documentType: z.enum(['quote','invoice']).optional(), items: z.array(quoteLineInputSchema).max(500).nullable().optional(),
  currentItems: z.array(quoteLineInputSchema).max(500).nullable().optional(),
  vatRate: numericInput, urssafRate: numericInput, shippingCost: numericInput, purchaseVatRate: numericInput,
  reminderIntervalDays: numericInput, latePenaltyValue: numericInput, mileageKm: numericInput,
  mileageRate: numericInput, mileageInternalRate: numericInput, mileageClientRate: numericInput,
  coefficientValue: numericInput, laborSellingHt: numericInput, laborInternalCostHt: numericInput,
  finalPriceTtc: numericInput, partCost: numericInput, partQuantity: numericInput,
  allowLoss: z.boolean().optional(), catalogPricing: z.boolean().optional(), sendEmail: z.boolean().optional(),
  invoiceAddressSource: z.enum(['client','intervention','free']).optional(), billingAddress: z.string().max(1000).optional(),
  contributions: z.array(z.object({ name: z.string().max(160).optional(), rate: numericInput, basis: z.string().max(120).optional(), mandatory: z.boolean().optional(), variable: z.boolean().optional() }).passthrough()).max(100).optional(),
}).passthrough();
const quotePatchInputSchema = quoteCreateInputSchema.partial();
const invoiceConversionInputSchema = z.object({
  dueAt: z.string().max(40).optional(), reminderIntervalDays: numericInput,
  invoiceAddressSource: z.enum(['client','intervention','free']).optional(), billingAddress: z.string().max(1000).optional(),
  sendEmail: z.boolean().optional(),
}).passthrough();
const invoicePaymentInputSchema = z.object({
  amount: numericInput, paymentMethod: z.enum(['transfer','card','cash','cheque','crypto']).optional(),
  paidAt: z.string().max(40).optional(), reference: z.string().max(160).optional(), note: z.string().max(2000).optional(),
}).passthrough();
const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
function optionalNumber(v:any,name:string,min=0,max=1e12){
  if(v===undefined||v===null||v==='')return null;
  const n=Number(String(v).replace(',','.'));
  if(!Number.isFinite(n)||n<min||n>max)throw new AurionError('INVALID_INPUT',`${name} invalide.`);
  return n;
}
function requiredNumber(v:any,name:string,min=0,max=1e12){
  const n=Number(String(v??'').trim().replace(',','.'));
  if(!Number.isFinite(n)||n<min||n>max)throw new AurionError('INVALID_INPUT',`${name} invalide.`);
  return n;
}
function firstDefined(source:any,...keys:string[]){
  for(const key of keys) if(source?.[key]!==undefined) return source[key];
  return undefined;
}
function enumValue<T extends string>(value:unknown,allowed:readonly T[],fallback:T):T{
  return typeof value==='string'&&allowed.includes(value as T)?value as T:fallback;
}
function cleanItems(raw:any):QuoteItem[]{
  if(!Array.isArray(raw))return [];
  return raw.map((x:any)=>({
    label:String(x?.label||'').trim().slice(0,240),
    quantity:Number(String(x?.quantity??1).replace(',','.')),
    unitCost:Number(String(x?.unitCost??0).replace(',','.')),
    unitPrice:x?.unitPrice===null||x?.unitPrice===undefined||x?.unitPrice===''?null:Number(String(x.unitPrice).replace(',','.')),
    partId:/^[0-9a-f-]{36}$/i.test(String(x?.partId||''))?String(x.partId):null,
    saleCoefficientPercent:x?.saleCoefficientPercent===null||x?.saleCoefficientPercent===undefined||x?.saleCoefficientPercent===''?null:Number(String(x.saleCoefficientPercent).replace(',','.'))
  }))
    .filter(x=>x.label)
    .map(x=>{
      if(!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>100000)throw new AurionError('INVALID_INPUT','Quantité invalide.');
      if(!Number.isFinite(x.unitCost)||x.unitCost<0||x.unitCost>1e9)throw new AurionError('INVALID_INPUT','Coût d’achat invalide.');
      if(x.unitPrice!==null&&(!Number.isFinite(x.unitPrice)||x.unitPrice<0||x.unitPrice>1e9))throw new AurionError('INVALID_INPUT','Prix de vente de pièce invalide.');
      if(x.saleCoefficientPercent!==null&&(!Number.isFinite(x.saleCoefficientPercent)||x.saleCoefficientPercent<0||x.saleCoefficientPercent>1e6))throw new AurionError('INVALID_INPUT','Coefficient de pièce invalide.');
      return x;
    });
}
async function withTransaction<T>(work:(client:SqlExecutor)=>Promise<T>):Promise<T>{
  const client=await db.connect();
  try{
    await client.query('begin');
    const result=await work(client);
    await client.query('commit');
    return result;
  }catch(error){
    await client.query('rollback').catch(()=>{});
    throw error;
  }finally{
    client.release();
  }
}
async function saveItems(executor:SqlExecutor,quoteId:string,org:string,activityId:string,items:QuoteItem[],defaultCoefficient=0,coefficientBasis='purchase',coefficientUnit='percent',coefficientValue=0){
  const resolved:Array<{item:QuoteItem;part:any}>=[];
  for(const item of items){
    const part=item.partId
      ?(await executor.query('select id,sale_coefficient_percent,selling_price,photo_key from parts where id=$1 and organization_id=$2 and activity_id=$3',[item.partId,org,activityId])).rows[0]
      :(await executor.query('select id,sale_coefficient_percent,selling_price,photo_key from parts where organization_id=$1 and activity_id=$2 and lower(trim(name))=lower(trim($3)) limit 1',[org,activityId,item.label])).rows[0];
    if(item.partId&&!part){
      const fallback=await executor.query('select id from parts where id=$1 and organization_id=$2',[item.partId,org]);
      if(!fallback.rowCount)item.partId=null;
      else throw new AurionError('INVALID_INPUT','La pièce sélectionnée n’appartient pas à l’activité du devis.');
    }
    if(part?.id) item.partId=String(part.id);
    resolved.push({item,part});
  }
  await executor.query('delete from quote_items where quote_id=$1',[quoteId]);
  for(const [position,{item,part}] of resolved.entries()){
    const coefficient=coefficientBasis==='purchase'&&coefficientUnit==='percent'
      ?Math.max(0,Number(item.saleCoefficientPercent??defaultCoefficient))
      :0;
    const euroCoefficient=coefficientBasis==='purchase'&&coefficientUnit==='euro'?Math.max(0,Number(coefficientValue||0)):0;
    const unitPrice=item.unitPrice!==null&&item.unitPrice!==undefined?Math.max(0,Number(item.unitPrice)):Math.max(0,Number(item.unitCost||0)*(1+coefficient/100)+euroCoefficient);
    await executor.query('insert into quote_items(quote_id,position,label,quantity,unit_cost,part_id,sale_coefficient_percent,unit_price,photo_key) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[quoteId,position,item.label,item.quantity,item.unitCost,item.partId,coefficient,unitPrice,part?.photo_key||null]);
  }
}
async function catalogQuoteTarget(org:string,activityId:string,intervention:string,items:QuoteItem[],vatRate:number,coefficientValue:number,coefficientUnit='percent',coefficientBasis='purchase'){
  const service=(await query('select default_price from interventions where organization_id=$1 and activity_id=$2 and lower(trim(name))=lower(trim($3)) limit 1',[org,activityId,intervention])).rows[0];
  // Le prix catalogue d’une prestation est un prix TTC fixe : il englobe déjà
  // main-d’œuvre, pièces, livraison, kilométrage, cotisations et taxes.
  // Les pièces restent des coûts internes et ne s’ajoutent jamais au TTC client.
  const total=Number(service?.default_price||0);
  if(!Number.isFinite(total)||total<0)throw new AurionError('INVALID_INPUT','Prix catalogue de prestation invalide.');
  return round2(total);
}
const summarize=(items:QuoteItem[])=>items.map(i=>`${i.quantity} × ${i.label}`).join(' ; ');
const pricedParts=(items:QuoteItem[])=>items.reduce((t,i)=>t+i.quantity*i.unitCost,0);
/** Coût d'achat des pièces : somme des lignes si elles portent un coût, sinon la valeur saisie. */
function partsCost(items:QuoteItem[],fallback:unknown){return items.some(i=>i.unitCost>0)?round2(items.reduce((t,i)=>t+i.quantity*i.unitCost,0)):Number(fallback??0)}
async function prepareQuoteCalculation(org:string,activityId:string,body:any,current:any={}){
  const effective=(...keys:string[])=>{
    const fromBody=firstDefined(body,...keys); if(fromBody!==undefined) return fromBody;
    return firstDefined(current,...keys);
  };
  const items=Array.isArray(body.items)
    ?cleanItems(body.items)
    :cleanItems(Array.isArray(body.currentItems)?body.currentItems:[]);

  const basis=enumValue(effective('coefficientBasis','coefficient_basis'),['purchase','margin'] as const,'purchase');
  const unit=enumValue(effective('coefficientUnit','coefficient_unit'),['percent','euro'] as const,'percent');
  const defaults=(await query('select default_part_coefficient_percent,default_labor_coefficient_percent from activities where id=$1 and organization_id=$2',[activityId,org])).rows[0]||{};
  const legacyPart=optionalNumber(firstDefined(body,'partCoefficientPercent','part_coefficient_percent')??defaults.default_part_coefficient_percent??0,'Coefficient pièces',0,1e6)??0;
  const legacyLabor=optionalNumber(firstDefined(body,'laborCoefficientPercent','labor_coefficient_percent')??defaults.default_labor_coefficient_percent??0,'Coefficient main-d’œuvre',0,1e6)??0;
  const coefficientCandidate=firstDefined(body,'coefficientValue','coefficient_value')!==undefined
    ?firstDefined(body,'coefficientValue','coefficient_value')
    :firstDefined(current,'coefficient_value')??(basis==='margin'?legacyLabor:legacyPart);
  const selectedValue=optionalNumber(coefficientCandidate,'Coefficient',0,1e6)??0;
  const partCoefficient=basis==='purchase'&&unit==='percent'?selectedValue:0;
  const laborCoefficient=basis==='margin'&&unit==='percent'?selectedValue:0;

  const partQuantity=Math.max(1,items.reduce((total,item)=>total+(Number(item.quantity)||0),0));
  const rawPart=items.some(i=>i.unitCost>0)
    ?round2(items.reduce((total,item)=>total+item.quantity*item.unitCost,0))
    :(optionalNumber(effective('partCost','part_cost'),'Coût des pièces',0,1e9)??0);
  const shippingCost=optionalNumber(effective('shippingCost','shipping_cost'),'Livraison',0,1e9)??0;
  const mileageKm=optionalNumber(effective('mileageKm','mileage_km'),'Kilométrage',0,1e7)??0;
  const mileageInternalRate=optionalNumber(effective('mileageInternalRate','mileage_internal_rate','mileageRate','mileage_rate'),'Coût kilométrique interne',0,1e4)??0;
  const mileageClientRate=optionalNumber(effective('mileageClientRate','mileage_client_rate','mileageRate','mileage_rate')??mileageInternalRate,'Tarif kilométrique client',0,1e4)??0;
  const mileageMode=enumValue(effective('mileageMode','mileage_mode'),['margin','client_price'] as const,'margin');
  const laborRaw=effective('laborSellingHt','labor_selling_ht');
  const laborSellingHt=laborRaw===undefined||laborRaw===null||laborRaw===''?undefined:optionalNumber(laborRaw,'Prix de vente main-d’œuvre',0,1e9);
  const laborInternalCostHt=optionalNumber(effective('laborInternalCostHt','labor_internal_cost_ht'),'Coût interne main-d’œuvre',0,1e9)??0;
  const vatRate=requiredNumber(effective('vatRate','vat_rate'),'TVA',0,100);
  const contributionOverrides=firstDefined(body,'contributions')!==undefined
    ?body.contributions
    :firstDefined(current,'contribution_snapshot');
  const contributions=await documentContributions(org,activityId,{...body,contributions:contributionOverrides});
  const contributionRates=contributions.map((c:any)=>({...c,rate:optionalNumber(c.rate,'Taux de cotisation',0,99.99)??0}));
  let targetTtc=requiredNumber(firstDefined(body,'finalPriceTtc','final_price_ttc','totalTtc','total_ttc')??0,'Prix TTC',0,1e9);
  const catalogPricing=Boolean(firstDefined(body,'catalogPricing','catalog_pricing')??false);
  if(catalogPricing===true){
    const catalogTarget=await catalogQuoteTarget(org,activityId,String(effective('intervention')||''),items,vatRate,selectedValue,unit,basis);
    if(catalogTarget>0)targetTtc=catalogTarget;
  }
  const targetNetValue=firstDefined(body,'targetNet','target_net','minimumProfit','minimum_profit')??0;
  const p=computePricing({
    partCost:rawPart,
    partQuantity,
    shippingCost,
    mileageKm,
    mileageRate:mileageClientRate,
    mileageInternalRate,
    mileageClientRate,
    laborSellingHt,
    laborInternalCostHt,
    coefficientBasis:basis,
    coefficientUnit:unit,
    coefficientValue:selectedValue,
    vatRate,
    urssafRate:firstDefined(body,'urssafRate','urssaf_rate'),
    contributions:contributionRates,
    targetTtc,
    targetNet:targetNetValue,
    driver:'ttc',
    mileageMode,
  });
  return {items,basis,unit,selectedValue,partCoefficient,laborCoefficient,partQuantity,rawPart,shippingCost,mileageKm,mileageInternalRate,mileageClientRate,mileageTotal:p.mileageTotal,mileageMode,laborSellingHt,laborInternalCostHt,vatRate,contributions:contributionRates,targetTtc,catalogPricing,p};
}
async function documentContributions(org:string,activityId:string,body:any){
  const rows=(await query(`select c.name,c.rate,c.basis,c.mandatory,c.variable,c.source from activity_contributions c
    where c.activity_id=$1 and exists(select 1 from activities a where a.id=c.activity_id and a.organization_id=$2)
    order by c.position,c.name`,[activityId,org])).rows;
  const overrides=Array.isArray(body?.contributions)?body.contributions:[];
  if(overrides.length)return overrides.map((c:any)=>({name:String(c.name||'Cotisation'),rate:c.rate===null||c.rate===undefined?null:Number(c.rate),basis:String(c.basis||'ca_ht'),mandatory:c.mandatory!==false,variable:Boolean(c.variable)}));
  return rows.map((c:any)=>({name:c.name,rate:c.rate===null?null:Number(c.rate),basis:/marge/i.test(String(c.basis||''))?'gross_margin':/résultat|resultat/i.test(String(c.basis||''))?'profit':'ca_ht',mandatory:c.mandatory!==false,variable:Boolean(c.variable)}));
}
async function saveLegalFields(id:string,org:string,b:any){
  const map:[string,string,boolean][]=[['paymentTerms','payment_terms',false],['insuranceInfo','insurance_info',false],['mediatorInfo','mediator_info',false],['legalNotes','legal_notes',false],['quoteValidityDays','quote_validity_days',true]];
  const sets:string[]=[],vals:any[]=[];
  for(const [k,col,num] of map){if(b[k]===undefined)continue;vals.push(num?Math.min(365,Math.max(1,Number(b[k])||30)):(String(b[k]).trim()||null));sets.push(`${col}=$${vals.length}`)}
  if(!sets.length)return;vals.push(id,org);await query(`update activities set ${sets.join(',')},updated_at=now() where id=$${vals.length-1} and organization_id=$${vals.length}`,vals);
}
async function nextNumber(org:string,prefix:string){
  const year=new Date().getFullYear();
  const prefixes=prefix==='FAC'?[`FAC-${year}-%`,`FA-${year}-%`]:[`${prefix}-${year}-%`];
  const r=await query(
    `select coalesce(max(substring(number from '([0-9]+)$')::int),0)+1 n
       from quotes
      where organization_id=$1
        and number like any($2::text[])`,
    [org,prefixes],
  );
  return `${prefix}-${year}-${String(r.rows[0].n).padStart(4,'0')}`;
}
async function pauseClientTimer(org:string,userId:string,clientId:string){
  await query(`update client_time_sessions set accumulated_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),duration_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),paused_at=now(),status='paused',ended_at=null where organization_id=$1 and user_id=$2 and client_id=$3 and ended_at is null and status='running'`,[org,userId,clientId]);
}
async function resumeClientTimer(org:string,userId:string,clientId:string,activityId:string){
  const paused=await query("select id from client_time_sessions where organization_id=$1 and user_id=$2 and client_id=$3 and ended_at is null and status='paused' order by created_at desc limit 1",[org,userId,clientId]);
  if(paused.rowCount){await query("update client_time_sessions set started_at=now(),paused_at=null,status='running' where id=$1",[paused.rows[0].id]);return paused.rows[0].id;}
  const active=await query("select id from client_time_sessions where organization_id=$1 and user_id=$2 and ended_at is null and status='running' limit 1",[org,userId]);
  if(active.rowCount) return active.rows[0].id;
  const id=crypto.randomUUID();
  await query('insert into client_time_sessions(id,organization_id,user_id,client_id,activity_id,manual_minutes,started_at,accumulated_seconds) values($1,$2,$3,$4,$5,0,now(),0)',[id,org,userId,clientId,activityId]);
  return id;
}
async function stopClientTimer(org:string,userId:string,clientId:string){
  await query(`update client_time_sessions set duration_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),accumulated_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),ended_at=now(),status='completed',paused_at=null where organization_id=$1 and user_id=$2 and client_id=$3 and ended_at is null and status='running'`,[org,userId,clientId]);
  await query(`update client_time_sessions set ended_at=now(),status='completed' where organization_id=$1 and user_id=$2 and client_id=$3 and ended_at is null and status='paused'`,[org,userId,clientId]);
}

async function marginGuard(org:string,activityId:string,purchaseHt:number,totalHt:number,requestedCoefficient:unknown){const a=(await query('select margin_min_percent from activities where id=$1 and organization_id=$2',[activityId,org])).rows[0];const min=Math.max(0,Number(a?.margin_min_percent??0));const coefficient=Number(requestedCoefficient??min);if(purchaseHt>0&&(!Number.isFinite(coefficient)||coefficient<min))throw new AurionError('INVALID_INPUT','Coefficient de marge inférieur au minimum métier.');const safeCoefficient=Number.isFinite(coefficient)?coefficient:min;const requiredHt=purchaseHt*(1+safeCoefficient/100);return {coefficient:safeCoefficient,min,requiredHt,ok:purchaseHt<=0||totalHt>=requiredHt}}
async function emailDocument(org:string,id:string,type:'quote'|'invoice',number:string,clientId:string):Promise<string>{
  const c=(await query('select email,name from clients where id=$1 and organization_id=$2',[clientId,org])).rows[0];
  if(!c?.email)return 'client_email_missing';
  if(!(await mailConfigured(org)))return 'mail_not_configured';
  try{
    const d=await renderDocument(org,id,type);const pdf=await readFile(fileFromKey(d.keys.pdf));const label=type==='invoice'?'facture':'devis';const sig=await signatureFor(org,d.row.activity_id);
    await sendOrgMail(org,{to:c.email,subject:`${type==='invoice'?'Facture':'Devis'} ${number}`,text:`Bonjour ${c.name||''},\n\nVeuillez trouver votre ${label} ${number} en pièce jointe.${sig}`,attachments:[{filename:`${number}.pdf`,content:pdf}]});
    await query('update quotes set sent_at=now(),updated_at=now() where id=$1 and organization_id=$2',[id,org]);
    if(type==='invoice') await createInvoiceWarranty(org,id,d.row as any);
    return 'sent';
  }catch(e:any){return 'failed:'+String(e?.message||e)}
}

function activityId(request:any, body?:any){ return body?.activityId || request.headers['x-aurion-activity-id']; }
async function ensureActivity(request:any, id?:string){
  const a=id?await query('select id from activities where id=$1 and organization_id=$2 and active=true',[id,request.auth!.organizationId]):await query('select id from activities where organization_id=$1 and active=true order by created_at limit 1',[request.auth!.organizationId]);
  return a.rows[0]?.id as string|undefined;
}

async function saveContributionPresets(org:string,activityId:string,presets:any[]){
  const owned=await query('select 1 from activities where id=$1 and organization_id=$2',[activityId,org]);
  if(!owned.rowCount)throw new Error('ACTIVITY_NOT_FOUND');
  await query('delete from activity_contributions c using activities a where c.activity_id=a.id and a.id=$1 and a.organization_id=$2',[activityId,org]);
  for(const [position,p] of (Array.isArray(presets)?presets:[]).entries()) await query(
    `insert into activity_contributions(activity_id,name,rate,basis,mandatory,variable,source,position)
     select $1,$2,$3,$4,$5,$6,$7,$8 where exists(select 1 from activities where id=$1 and organization_id=$9)
     on conflict(activity_id,name) do update set rate=excluded.rate,basis=excluded.basis,mandatory=excluded.mandatory,variable=excluded.variable,source=excluded.source,position=excluded.position,updated_at=now()`,
    [activityId,String(p.name||'Cotisation sociale'),p.rate===null||p.rate===undefined?null:Number(p.rate),String(p.basis||'revenu professionnel'),p.mandatory!==false,p.variable===true,String(p.source||'Aurion'),position,org]);
}
async function saveActivityProfileOverride(org:string,activityId:string,profileCode:string){
  if(!PROFILE_CODES.includes(profileCode))throw new Error('INVALID_ACTIVITY_PROFILE');
  await query(`insert into activity_profile_overrides(activity_id,profile_code)
    select id,$3 from activities where id=$1 and organization_id=$2
    on conflict(activity_id) do update set profile_code=excluded.profile_code,updated_at=now()`,[activityId,org,profileCode]);
}

export async function businessRoutes(app:FastifyInstance){
  app.addHook('preHandler',app.requireAuth);
  app.get('/activities',async r=>{await syncPrimaryActivityFromOrganization(r.auth!.organizationId);return (await query(`select id,code,name,description,legal_form,cgv_text,active,urssaf_rate,vat_rate,configuration_defined,default_part_coefficient_percent,default_labor_coefficient_percent,payment_terms,insurance_info,mediator_info,legal_notes,quote_validity_days,margin_min_percent,social_regime,vat_regime,social_auto_detected,vat_auto_detected,(select profile_code from activity_profile_overrides o where o.activity_id=activities.id and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$1)) profile_code,coalesce((select json_agg(json_build_object('name',ac.name,'rate',ac.rate,'basis',ac.basis,'mandatory',ac.mandatory,'variable',ac.variable,'source',ac.source) order by ac.position,ac.name) from activity_contributions ac where ac.activity_id=activities.id),'[]'::json) contributions from activities where organization_id=$1 order by active desc,name`,[r.auth!.organizationId])).rows});
  app.get('/profiles',async()=>listProfiles());
  app.get('/legal-forms',async()=>LEGAL_FORMS);
  app.post('/activities/detect-fiscal',async(r,reply)=>{const b:any=r.body||{};if(!b.legalForm)return reply.code(400).send({error:'INVALID_INPUT'});const p=profileFor(String(b.name||''),String(b.description||''),b.profileCode);const detected=detectFiscalSettings(String(b.legalForm),p.code,String(b.name||''),String(b.description||''));return {...detected,cgvText:defaultCgvFor(p.code,p.title,String(b.legalForm||''))};});
  app.post('/activities/detect-legal-form',async(r,reply)=>{const b:any=r.body||{};return detectLegalFormFromProfile(String(b.name||''),String(b.description||''));});
  app.post('/activities/detect-profile',async(r,reply)=>{const b:any=r.body||{};const p=profileFor(String(b.name||''),String(b.description||''),b.profileCode);return {code:p.code,title:p.title,modules:p.modules,calc:p.calc,suggestedParts:p.suggestedParts.length,warranty:p.warranty};});
  app.get('/activities/:id/profile',async(r,reply)=>{const x=await query('select id,name,description from activities where id=$1 and organization_id=$2',[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});const ov=(await query('select profile_code from activity_profile_overrides o where o.activity_id=$1 and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$2)',[(r.params as any).id,r.auth!.organizationId])).rows[0]?.profile_code;return profileFor(x.rows[0].name,x.rows[0].description||'',ov)});
  app.post('/activities',async(r,reply)=>{
    const parsed=activityCreateInputSchema.safeParse(r.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data;
    let urssafRate:number,vatRate:number,marginMinPercent:number,partCoefficient:number,laborCoefficient:number,quoteValidityDays:number;
    try{
      urssafRate=b.urssafRate===''?0:(optionalNumber(b.urssafRate,'Cotisations',0,99.99)??0);
      vatRate=b.vatRate===''?0:(optionalNumber(b.vatRate,'TVA',0,100)??20);
      marginMinPercent=optionalNumber(b.marginMinPercent,'Marge minimale',0,1e6)??0;
      partCoefficient=optionalNumber(b.defaultPartCoefficientPercent,'Coefficient pièces',0,1e6)??0;
      laborCoefficient=optionalNumber(b.defaultLaborCoefficientPercent,'Coefficient main-d’œuvre',0,1e6)??0;
      quoteValidityDays=optionalNumber(b.quoteValidityDays,'Validité du devis',1,365)??30;
    }catch{return reply.code(400).send({error:'INVALID_INPUT',message:'Les taux et coefficients de l’activité sont invalides.'})}
    const id=crypto.randomUUID();
    const code=(b.code||b.name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||`activity-${Date.now()}`;
    try{
      await query('insert into activities(id,organization_id,code,name,description,legal_form,cgv_text,urssaf_rate,vat_rate,margin_min_percent,default_part_coefficient_percent,default_labor_coefficient_percent) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,r.auth!.organizationId,code,b.name.trim(),b.description||null,b.legalForm||null,b.cgvText||null,b.urssafRate===''?null:urssafRate,vatRate,marginMinPercent,partCoefficient,laborCoefficient]);
      if(b.profileCode&&PROFILE_CODES.includes(b.profileCode))await saveActivityProfileOverride(r.auth!.organizationId,id,b.profileCode);
      const profile=profileFor(b.name.trim(),b.description||'',b.profileCode);
      const detected=detectFiscalSettings(String(b.legalForm||''),profile.code,b.name.trim(),b.description||'');
      if(b.legalForm&&b.autoFiscalDetect!==false){
        await query('update activities set urssaf_rate=$1,vat_rate=coalesce($2,vat_rate),social_regime=$3,vat_regime=$4,social_auto_detected=true,vat_auto_detected=true where id=$5 and organization_id=$6',[detected.socialRate,detected.vatRate,detected.socialRegime,detected.vatRegime,id,r.auth!.organizationId]);
        await saveContributionPresets(r.auth!.organizationId,id,detected.contributions);
      }
      const defaultCgv=defaultCgvFor(profile.code,profile.title,String(b.legalForm||''));
      await query('update activities set cgv_text=coalesce(cgv_text,$1) where id=$2 and organization_id=$3',[defaultCgv,id,r.auth!.organizationId]);
      for(const n of profile.suggestedServices)await query('insert into interventions(organization_id,activity_id,name,description,default_duration_minutes) values($1,$2,$3,$4,$5)',[r.auth!.organizationId,id,n,`${profile.title} · prestation`,profile.serviceMinutes[n]||60]);
      for(const n of profile.suggestedParts)await query('insert into parts(organization_id,activity_id,name,category,selling_price) values($1,$2,$3,$4,0)',[r.auth!.organizationId,id,n,profile.itemLabel]);
      for(const w of (profile.warranty.length?profile.warranty:['Garantie standard'])){
        const m=/(\d+)\s*(mois|an)/.exec(w);
        await query('insert into warranty_policies(organization_id,activity_id,name,duration_months) values($1,$2,$3,$4)',[r.auth!.organizationId,id,w,m?(m[2]==='an'?12*Number(m[1]):Number(m[1])):12]);
      }
      await saveLegalFields(id,r.auth!.organizationId,{...b,quoteValidityDays});
      return reply.code(201).send({id,profile});
    }catch(e:any){
      if(e?.code==='23505')return reply.code(409).send({error:'INVALID_INPUT'});
      throw e;
    }
  });
  app.delete('/activities/:id',async(r,reply)=>{const id=(r.params as any).id;const count=await query('select count(*)::int n from activities where organization_id=$1 and active=true',[r.auth!.organizationId]);if(Number(count.rows[0].n)<=1)return reply.code(400).send({error:'LAST_ACTIVITY',message:'Il faut conserver au moins une activité.'});const used=await query('select ((select count(*) from clients where activity_id=$1)+(select count(*) from quotes where activity_id=$1)+(select count(*) from appointments where activity_id=$1))::int n',[id]);if(Number(used.rows[0].n)>0)return reply.code(409).send({error:'ACTIVITY_NOT_EMPTY',message:'Cette activité contient encore des clients, devis ou rendez-vous : supprimez-les d’abord.'});const x=await query('delete from activities where id=$1 and organization_id=$2',[id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.post('/activities/:id/seed-catalog',async(r,reply)=>{const id=(r.params as any).id,org=r.auth!.organizationId;const a=await query('select id,name,description from activities where id=$1 and organization_id=$2',[id,org]);if(!a.rowCount)return reply.code(404).send({error:'NOT_FOUND'});const ov=(await query('select profile_code from activity_profile_overrides o where o.activity_id=$1 and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$2)',[id,org])).rows[0]?.profile_code;const profile=profileFor(a.rows[0].name,a.rows[0].description||'',ov);let services=0,parts=0,warranties=0;for(const n of profile.suggestedServices){const x=await query('insert into interventions(organization_id,activity_id,name,description,default_duration_minutes) select $1::uuid,$2::uuid,$3::varchar,$4::text,$5::int where not exists(select 1 from interventions where activity_id=$2::uuid and lower(name)=lower($3::varchar))',[org,id,n,`${profile.title} · prestation`,profile.serviceMinutes[n]||60]);services+=x.rowCount||0}for(const n of profile.suggestedParts){const x=await query('insert into parts(organization_id,activity_id,name,category,selling_price) select $1::uuid,$2::uuid,$3::varchar,$4::varchar,0 where not exists(select 1 from parts where activity_id=$2::uuid and lower(name)=lower($3::varchar))',[org,id,n,profile.itemLabel]);parts+=x.rowCount||0}for(const w of profile.warranty){const m=/(\d+)\s*(mois|an)/.exec(w);const x=await query('insert into warranty_policies(organization_id,activity_id,name,duration_months) select $1::uuid,$2::uuid,$3::varchar,$4::int where not exists(select 1 from warranty_policies where activity_id=$2::uuid and lower(name)=lower($3::varchar))',[org,id,w,m?(m[2]==='an'?12*Number(m[1]):Number(m[1])):12]);warranties+=x.rowCount||0}return {added:{services,parts,warranties},profile:profile.code}});
  app.patch('/activities/:id',async(r,reply)=>{
    const parsed=activityPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const params=activityParamsSchema.safeParse(r.params);
    if(!params.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,id=params.data.id;
    let urssafRate:any=null,vatRate:number|null=null,marginMinPercent:number|null=null,partCoefficient:number|null=null,laborCoefficient:number|null=null;
    try{
      urssafRate=b.urssafRate===undefined||b.urssafRate===''?null:optionalNumber(b.urssafRate,'Cotisations',0,99.99);
      vatRate=b.vatRate===undefined?null:(b.vatRate===''?0:optionalNumber(b.vatRate,'TVA',0,100));
      marginMinPercent=b.marginMinPercent===undefined?null:(optionalNumber(b.marginMinPercent,'Marge minimale',0,1e6)??0);
      partCoefficient=b.defaultPartCoefficientPercent===undefined?null:(optionalNumber(b.defaultPartCoefficientPercent,'Coefficient pièces',0,1e6)??0);
      laborCoefficient=b.defaultLaborCoefficientPercent===undefined?null:(optionalNumber(b.defaultLaborCoefficientPercent,'Coefficient main-d’œuvre',0,1e6)??0);
      if(b.quoteValidityDays!==undefined)optionalNumber(b.quoteValidityDays,'Validité du devis',1,365);
    }catch{return reply.code(400).send({error:'INVALID_INPUT',message:'Les taux et coefficients de l’activité sont invalides.'})}
    const x=await query('update activities set name=coalesce($1,name),description=$2,legal_form=$3,cgv_text=$4,urssaf_rate=$5,vat_rate=coalesce($6,vat_rate),margin_min_percent=greatest(0,coalesce($7,margin_min_percent)),default_part_coefficient_percent=greatest(0,coalesce($8,default_part_coefficient_percent)),default_labor_coefficient_percent=greatest(0,coalesce($9,default_labor_coefficient_percent)),active=coalesce($10,active),configuration_defined=true,updated_at=now() where id=$11 and organization_id=$12 returning *',[b.name?.trim(),b.description??null,b.legalForm??null,b.cgvText??null,urssafRate,vatRate,marginMinPercent,partCoefficient,laborCoefficient,b.active,id,r.auth!.organizationId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    if(b.profileCode!==undefined){
      if(b.profileCode&&PROFILE_CODES.includes(b.profileCode))await saveActivityProfileOverride(r.auth!.organizationId,id,b.profileCode);
      else await query('delete from activity_profile_overrides o where o.activity_id=$1 and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$2)',[id,r.auth!.organizationId]);
    }
    if(b.autoFiscalDetect===false)await query('update activities set social_auto_detected=false,vat_auto_detected=false where id=$1 and organization_id=$2',[id,r.auth!.organizationId]);
    if(b.legalForm&&b.autoFiscalDetect!==false){
      const a=x.rows[0],p=profileFor(a.name,a.description||'',b.profileCode);
      const detected=detectFiscalSettings(String(b.legalForm),p.code,a.name,a.description||'');
      const keepManualSocial=a.social_auto_detected===false&&b.urssafRate!==undefined;
      const keepManualVat=a.vat_auto_detected===false&&b.vatRate!==undefined;
      const socialRate=keepManualSocial?Number(urssafRate):detected.socialRate;
      const vatRateDetected=keepManualVat?Number(vatRate):detected.vatRate;
      const socialDetected=!keepManualSocial,vatDetected=!keepManualVat;
      const cgv=defaultCgvFor(p.code,p.title,String(b.legalForm||''));
      await query('update activities set urssaf_rate=$1,vat_rate=coalesce($2,vat_rate),social_regime=$3,vat_regime=$4,cgv_text=$5,social_auto_detected=$6,vat_auto_detected=$7,updated_at=now() where id=$8 and organization_id=$9',[socialRate,vatRateDetected,detected.socialRegime,detected.vatRegime,cgv,socialDetected,vatDetected,id,r.auth!.organizationId]);
      if(socialDetected||vatDetected)await saveContributionPresets(r.auth!.organizationId,id,detected.contributions);
      x.rows[0].urssaf_rate=socialRate;x.rows[0].vat_rate=vatRateDetected;x.rows[0].cgv_text=cgv;x.rows[0].contributions=(socialDetected||vatDetected)?detected.contributions:[];
    }
    await saveLegalFields(id,r.auth!.organizationId,b);
    return x.rows[0];
  });

  app.get('/clients',async r=>(await query('select id,name,email,phone,address,intervention_address,siret,estimated_minutes,activity_id,created_at from clients where organization_id=$1 and ($2::uuid is null or activity_id=$2) order by name',[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/clients',async(r,reply)=>{
    const parsed=clientCreateInputSchema.safeParse(r.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data;
    const aid=await ensureActivity(r,activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    let manual=0;
    try{manual=optionalNumber(b.estimatedMinutes,'Temps manuel',0,1e7)??0}catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const id=crypto.randomUUID(),org=r.auth!.organizationId;
    await query('insert into clients(id,organization_id,activity_id,name,email,phone,address,intervention_address,siret,estimated_minutes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,org,aid,b.name.trim(),b.email||null,b.phone||null,b.address||null,b.interventionAddress||null,(String(b.siret||'').replace(/\D/g,'')||null),manual]);
    await query('insert into client_time_sessions(id,organization_id,user_id,client_id,activity_id,manual_minutes,started_at) values($1,$2,$3,$4,$5,$6,now())',[crypto.randomUUID(),org,r.auth!.userId,id,aid,manual]);
    return reply.code(201).send({id});
  });
  app.delete('/clients/:id',async(r,reply)=>{const x=await query('delete from clients where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.patch('/clients/:id',async(r,reply)=>{
    const parsed=clientPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,id=(r.params as any).id,hasManual=b.estimatedMinutes!==undefined;
    const requestedActivityId=b.activityId?await ensureActivity(r,b.activityId):undefined;
    if(b.activityId&&!requestedActivityId)return reply.code(400).send({error:'INVALID_ACTIVITY'});
    let manual:number|null=null;
    try{manual=hasManual?(optionalNumber(b.estimatedMinutes,'Temps manuel',0,1e7)??0):null}catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const x=await query('update clients set name=coalesce($1,name),email=$2,phone=$3,address=$4,intervention_address=$5,siret=$6,activity_id=coalesce($7,activity_id),estimated_minutes=coalesce($8,estimated_minutes),updated_at=now() where id=$9 and organization_id=$10 returning id',[b.name?.trim(),b.email||null,b.phone||null,b.address||null,b.interventionAddress||null,(String(b.siret||'').replace(/\D/g,'')||null),requestedActivityId||null,manual,id,r.auth!.organizationId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return x.rows[0];
  });

  app.get('/clients/:id/summary',async(r,reply)=>{const x=await clientSummary(r.auth!.organizationId,(r.params as any).id);if(!x)return reply.code(404).send({error:'NOT_FOUND'});return x});
  app.get('/suppliers',async r=>(await query('select * from suppliers where organization_id=$1 and activity_id=$2 order by name',[r.auth!.organizationId,activityId(r)])).rows);
  app.get('/suppliers/lookup',async(r,reply)=>{try{const id=String((r.query as any)?.identifier||'');const company=await lookupFrenchCompany(id);return {company}}catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}});
  app.get('/suppliers/search',async(r,reply)=>{try{return {companies:await searchFrenchCompanies(String((r.query as any)?.q||''))}}catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}});

  app.post('/suppliers',async(r,reply)=>{
    const parsed=supplierCreateInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT',message:'Les informations du fournisseur sont invalides.'});
    const b:any=parsed.data,aid=await ensureActivity(r,b.activityId||activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT',message:'L’activité du fournisseur est invalide.'});
    let siret:string|null=null,siren:string|null=null;
    try{if(b.siret)siret=normalizeSiret(b.siret);if(b.siren)siren=normalizeSiren(b.siren)}
    catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:e.message})}
    const org=r.auth!.organizationId,client=await db.connect();
    try{
      await client.query('begin');
      if(siret){
        const existing=(await client.query('select id from suppliers where organization_id=$1 and siret=$2 limit 1',[org,siret])).rows[0];
        if(existing){await client.query('commit');return reply.code(200).send({id:existing.id,existing:true})}
      }
      const id=crypto.randomUUID();
      const x=await client.query(
        'insert into suppliers(id,organization_id,activity_id,name,email,phone,website,notes,siren,siret,legal_name,address,postal_code,city,registry_source,legal_form,logo_url,registry_checked_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9::varchar,$10::varchar,$11,$12,$13,$14,$15,$16,$17,case when $9::varchar is not null or $10::varchar is not null then now() else null end) returning id',
        [id,org,aid,b.name.trim(),b.email||null,b.phone||null,b.website||null,b.notes||null,siren,siret,b.legalName||null,b.address||null,b.postalCode||null,b.city||null,b.registrySource||null,b.legalForm||null,null],
      );
      await client.query('commit');
      return reply.code(201).send({id:x.rows[0].id,existing:false});
    }catch(e:any){
      await client.query('rollback').catch(()=>{});
      if(e?.code==='23505'&&siret){
        const existing=await query('select id from suppliers where organization_id=$1 and siret=$2 limit 1',[org,siret]);
        if(existing.rowCount)return reply.code(200).send({id:existing.rows[0].id,existing:true});
      }
      r.log.error({err:e},'supplier creation failed');
      return reply.code(500).send({error:'SUPPLIER_SAVE_FAILED',message:'Le fournisseur n’a pas pu être enregistré.'});
    }finally{client.release()}
  });
  app.patch('/suppliers/:id',async(r,reply)=>{
    const parsed=supplierPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT',message:'Les informations du fournisseur sont invalides.'});
    const params=z.object({id:z.string().uuid()}).safeParse(r.params);
    if(!params.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,id=params.data.id,org=r.auth!.organizationId;
    let siret:string|null=null,siren:string|null=null;
    try{if(b.siret)siret=normalizeSiret(b.siret);if(b.siren)siren=normalizeSiren(b.siren)}
    catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:e.message})}
    try{
      const current=await query('select id from suppliers where id=$1 and organization_id=$2',[id,org]);
      if(!current.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
      if(siret){
        const duplicate=await query('select id from suppliers where organization_id=$1 and siret=$2 and id<>$3 limit 1',[org,siret,id]);
        if(duplicate.rowCount)return reply.code(409).send({error:'SUPPLIER_SIRET_EXISTS',message:'Ce SIRET est déjà utilisé par un autre fournisseur.'});
      }
      const x=await query(
        'update suppliers set name=coalesce(nullif(trim($1),\'\'),name),email=$2,phone=$3,website=$4,notes=$5,siren=$6,siret=$7,legal_name=$8,address=$9,postal_code=$10,city=$11,registry_source=$12,legal_form=$13,logo_url=$14,registry_checked_at=case when $7::varchar is not null then now() else registry_checked_at end,updated_at=now() where id=$15::uuid and organization_id=$16::uuid returning *',
        [b.name,b.email||null,b.phone||null,b.website||null,b.notes||null,siren,siret,b.legalName||null,b.address||null,b.postalCode||null,b.city||null,b.registrySource||null,b.legalForm||null,null,id,org],
      );
      if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
      return x.rows[0];
    }catch(e:any){
      r.log.error({err:e,supplierId:id},'supplier update failed');
      if(e?.code==='23505')return reply.code(409).send({error:'SUPPLIER_SIRET_EXISTS',message:'Ce SIRET est déjà utilisé par un autre fournisseur.'});
      return reply.code(500).send({error:'SUPPLIER_UPDATE_FAILED',message:'Le fournisseur n’a pas pu être modifié.'});
    }
  });
  app.get('/suppliers/:id.pdf',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;try{const {supplierPdf}=await import('../services/pdf.js');const {buffer}=await supplierPdf(org,id);return reply.header('Content-Type','application/pdf').header('Content-Disposition',`inline; filename="fiche-fournisseur-${id}.pdf"`).send(buffer)}catch(e:any){return reply.code(e?.message==='NOT_FOUND'?404:500).send({error:e?.message||'PDF_ERROR'})}});
  app.delete('/suppliers/:id',async(r,reply)=>{const x=await query('delete from suppliers where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});

  app.get('/supplies',async r=>(await query('select s.*,sp.name supplier_name from supplies s left join suppliers sp on sp.id=s.supplier_id where s.organization_id=$1 and s.activity_id=$2 order by s.name',[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/supplies',async(r,reply)=>{
    const parsed=supplyCreateInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,org=r.auth!.organizationId,aid=await ensureActivity(r,b.activityId||activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    const supplierId=b.supplierId||null;
    if(supplierId){
      const supplier=await query('select id from suppliers where id=$1 and organization_id=$2 and activity_id=$3',[supplierId,org,aid]);
      if(!supplier.rowCount)return reply.code(400).send({error:'INVALID_SUPPLIER'});
    }
    let purchasePrice=0;
    try{purchasePrice=optionalNumber(b.purchasePrice,'Prix d’achat',0,1e9)??0}catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const id=crypto.randomUUID();
    await query('insert into supplies(id,organization_id,activity_id,supplier_id,name,reference,description,purchase_price) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,org,aid,supplierId,b.name.trim(),b.reference||null,b.description||null,purchasePrice]);
    return reply.code(201).send({id});
  });
  app.patch('/supplies/:id',async(r,reply)=>{
    const parsed=supplyPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,id=String((r.params as any).id),org=r.auth!.organizationId;
    const current=(await query('select id,activity_id from supplies where id=$1 and organization_id=$2',[id,org])).rows[0];
    if(!current)return reply.code(404).send({error:'NOT_FOUND'});
    const supplierId=b.supplierId||null;
    if(supplierId){
      const supplier=await query('select id from suppliers where id=$1 and organization_id=$2 and activity_id=$3',[supplierId,org,current.activity_id]);
      if(!supplier.rowCount)return reply.code(400).send({error:'INVALID_SUPPLIER'});
    }
    let purchasePrice=0;
    try{purchasePrice=optionalNumber(b.purchasePrice,'Prix d’achat',0,1e9)??0}catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const x=await query(`update supplies set supplier_id=$1,name=coalesce(nullif(trim($2),''),name),reference=$3,description=$4,purchase_price=greatest(0,$5),updated_at=now() where id=$6 and organization_id=$7 returning *`,[supplierId,b.name,b.reference||null,b.description||null,purchasePrice,id,org]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return x.rows[0];
  });
  app.delete('/supplies/:id',async(r,reply)=>{const x=await query('delete from supplies where id=$1 and organization_id=$2',[String((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.get('/search/all',async r=>{const q=String((r.query as any)?.q||'').trim();const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));if(!aid)return {clients:[],suppliers:[],quotes:[],invoices:[],sav:[]};const like=`%${q}%`;const [clients,suppliers,docs,sav]=await Promise.all([query(`select id,name,email,phone,siret from clients where organization_id=$1 and activity_id=$2 and ($3='' or name ilike $3 or email ilike $3 or siret ilike $3) order by name limit 50`,[org,aid,like]),query(`select id,name,siret,legal_name from suppliers where organization_id=$1 and activity_id=$2 and ($3='' or name ilike $3 or legal_name ilike $3 or siret ilike $3) order by name limit 50`,[org,aid,like]),query(`select id,number,document_type,client_name,total_ttc,created_at from quotes where organization_id=$1 and activity_id=$2 and ($3='' or client_name ilike $3 or number ilike $3 or cast(total_ttc as text) ilike $3 or cast(created_at as text) ilike $3) order by created_at desc limit 100`,[org,aid,like]),query(`select s.id,s.invoice_id quote_id,s.amount_ttc amount,s.created_at,c.name client_name from sav_cases s left join clients c on c.id=s.client_id where s.organization_id=$1 and s.activity_id=$2 and ($3='' or c.name ilike $3 or cast(s.amount_ttc as text) ilike $3 or cast(s.created_at as text) ilike $3) order by s.created_at desc limit 50`,[org,aid,like]).catch(()=>({rows:[]}))]);return {clients:clients.rows,suppliers:suppliers.rows,quotes:docs.rows.filter(x=>x.document_type==='quote'),invoices:docs.rows.filter(x=>x.document_type==='invoice'),sav:sav.rows};});
  app.get('/parts',async r=>(await query(`select p.*,coalesce(json_agg(json_build_object('supplierId',s.id,'supplier',s.name,'supplierReference',sp.supplier_reference,'purchasePrice',sp.purchase_price,'available',sp.available) order by sp.purchase_price) filter(where s.id is not null),'[]') suppliers from parts p left join supplier_parts sp on sp.part_id=p.id left join suppliers s on s.id=sp.supplier_id where p.organization_id=$1 and p.activity_id=$2 group by p.id order by p.name`,[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/parts',async(r,reply)=>{
    const parsed=partCreateInputSchema.safeParse(r.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,aid=await ensureActivity(r,activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    let stock=0,sellingPrice=0,saleCoefficient=0;
    try{
      stock=optionalNumber(b.stock,'Stock',0,10_000_000)??0;
      if(!Number.isInteger(stock))return reply.code(400).send({error:'INVALID_INPUT'});
      sellingPrice=optionalNumber(b.sellingPrice,'Prix de vente',0,1e9)??0;
      saleCoefficient=optionalNumber(b.saleCoefficientPercent,'Coefficient de vente',0,1e6)??0;
    }catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const id=crypto.randomUUID();
    const activity=(await query('select margin_min_percent from activities where id=$1 and organization_id=$2',[aid,r.auth!.organizationId])).rows[0];
    const coefficient=Math.max(Number(activity?.margin_min_percent??0),saleCoefficient);
    await query(`insert into parts(id,organization_id,activity_id,name,category,model,variant,color,quality,reference,stock,selling_price,sale_coefficient_percent,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,r.auth!.organizationId,aid,b.name.trim(),b.category||null,b.model||null,b.variant||null,b.color||null,b.quality||null,b.reference||null,stock,sellingPrice,coefficient,b.notes||null]);
    return reply.code(201).send({id});
  });app.get('/parts/:id/photo',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const x=(await query('select photo_key from parts where id=$1 and organization_id=$2',[id,org])).rows[0];if(!x||!x.photo_key)return reply.code(404).send({error:'NOT_FOUND'});try{const buf=await readFile(fileFromKey(x.photo_key));const ext=String(x.photo_key).toLowerCase();const type=ext.endsWith('.png')?'image/png':ext.endsWith('.webp')?'image/webp':'image/jpeg';return reply.header('Content-Type',type).header('Cache-Control','private, max-age=3600').send(buf)}catch{return reply.code(404).send({error:'NOT_FOUND'})}});
  app.post('/parts/:id/photo',async(request,reply)=>{const part=await request.file();if(!part||!['image/png','image/jpeg','image/webp'].includes(part.mimetype))return reply.code(400).send({error:'INVALID_IMAGE'});const id=String((request.params as any).id),org=request.auth!.organizationId;const ok=await query('select id from parts where id=$1 and organization_id=$2',[id,org]);if(!ok.rowCount)return reply.code(404).send({error:'NOT_FOUND'});const saved=await savePrivateUpload(org,part,5*1024*1024);await query('update parts set photo_key=$1,updated_at=now() where id=$2 and organization_id=$3',[`private/${org}/${saved.safe}`,id,org]);return {ok:true,photoKey:`private/${org}/${saved.safe}`};});  app.patch('/parts/:id',async(r,reply)=>{
    const parsed=partPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,id=String((r.params as any).id),org=r.auth!.organizationId;
    let stock=0,sellingPrice=0,saleCoefficient=0;
    try{
      stock=optionalNumber(b.stock,'Stock',0,10_000_000)??0;
      if(!Number.isInteger(stock))return reply.code(400).send({error:'INVALID_INPUT'});
      sellingPrice=optionalNumber(b.sellingPrice,'Prix de vente',0,1e9)??0;
      saleCoefficient=optionalNumber(b.saleCoefficientPercent,'Coefficient de vente',0,1e6)??0;
    }catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const x=await query(`update parts p set name=coalesce($1,p.name),category=$2,model=$3,variant=$4,color=$5,quality=$6,reference=$7,stock=$8,selling_price=$9,sale_coefficient_percent=greatest(0,coalesce($10,p.sale_coefficient_percent)),notes=$11,updated_at=now() where p.id=$12 and p.organization_id=$13 returning p.*`,[b.name?.trim(),b.category||null,b.model||null,b.variant||null,b.color||null,b.quality||null,b.reference||null,stock,sellingPrice,saleCoefficient,b.notes||null,id,org]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return x.rows[0];
  });app.delete('/parts/:id',async(r,reply)=>{const x=await query('delete from parts where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.post('/parts/:id/prices',async(r,reply)=>{
    const parsed=partPriceInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data;
    let purchasePrice=0;
    try{purchasePrice=optionalNumber(b.purchasePrice,'Prix d’achat',0,1e9)??0}catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const part=await query('select id,activity_id from parts where id=$1 and organization_id=$2',[String((r.params as any).id),r.auth!.organizationId]);
    if(!part.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    const supplier=await query('select id from suppliers where id=$1 and organization_id=$2 and activity_id=$3',[b.supplierId,r.auth!.organizationId,part.rows[0].activity_id]);
    if(!supplier.rowCount)return reply.code(400).send({error:'INVALID_INPUT'});
    await query(`insert into supplier_parts(supplier_id,part_id,supplier_reference,purchase_price,available,updated_at) values($1,$2,$3,$4,$5,now()) on conflict(supplier_id,part_id) do update set supplier_reference=excluded.supplier_reference,purchase_price=excluded.purchase_price,available=excluded.available,updated_at=now()`,[b.supplierId,part.rows[0].id,b.supplierReference||null,purchasePrice,b.available!==false]);
    return {ok:true};
  });

app.get('/interventions',async r=>(await query('select * from interventions where organization_id=$1 and activity_id=$2 order by name',[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/interventions',async(r,reply)=>{const b:any=r.body,aid=await ensureActivity(r,activityId(r,b));if(!aid||!b?.name?.trim())return reply.code(400).send({error:'INVALID_INPUT'});const id=crypto.randomUUID();await query('insert into interventions(id,organization_id,activity_id,name,description,default_duration_minutes,default_price) values($1,$2,$3,$4,$5,$6,$7)',[id,r.auth!.organizationId,aid,b.name.trim(),b.description||null,b.durationMinutes?Number(b.durationMinutes):null,Number(b.defaultPrice||0)]);return reply.code(201).send({id})});
  app.patch('/interventions/:id',async(r,reply)=>{const b:any=r.body;const x=await query('update interventions set name=coalesce($1,name),description=$2,default_duration_minutes=$3,default_price=$4,updated_at=now() where id=$5 and organization_id=$6 returning *',[b.name?.trim(),b.description||null,b.durationMinutes?Number(b.durationMinutes):null,Number(b.defaultPrice||0),((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return x.rows[0]});
  app.delete('/interventions/:id',async(r,reply)=>{const x=await query('delete from interventions where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});

  app.get('/devices',async r=>(await query('select d.*,c.name client_name from devices d join clients c on c.id=d.client_id where d.organization_id=$1 and d.activity_id=$2 order by d.created_at desc',[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/devices',async(r,reply)=>{const b:any=r.body,aid=await ensureActivity(r,activityId(r,b));if(!aid||!b?.clientId||!b?.type)return reply.code(400).send({error:'INVALID_INPUT'});const c=await query('select id from clients where id=$1 and organization_id=$2 and activity_id=$3',[b.clientId,r.auth!.organizationId,aid]);if(!c.rowCount)return reply.code(400).send({error:'INVALID_INPUT'});const id=crypto.randomUUID();await query('insert into devices(id,organization_id,activity_id,client_id,type,brand,model,imei,serial_number,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,r.auth!.organizationId,aid,b.clientId,b.type,b.brand||null,b.model||null,b.imei||null,b.serialNumber||null,b.notes||null]);return reply.code(201).send({id})});
  app.get('/devices/search',async r=>{const q=String((r.query as any)?.q||'').trim();return (await query(`select d.*,c.name client_name from devices d join clients c on c.id=d.client_id where d.organization_id=$1 and d.activity_id=$2 and ($3='' or d.imei ilike '%'||$3||'%' or c.name ilike '%'||$3||'%') order by d.created_at desc`,[r.auth!.organizationId,activityId(r),q])).rows});

  app.get('/warranties',async r=>(await query('select w.*,d.imei,c.name client_name from warranties w left join devices d on d.id=w.device_id left join clients c on c.id=w.client_id where w.organization_id=$1 and w.activity_id=$2 order by w.ends_at desc',[r.auth!.organizationId,activityId(r)])).rows);
  app.get('/warranty-policies',async r=>(await query('select * from warranty_policies where organization_id=$1 and activity_id=$2 order by name',[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/warranty-policies',async(r,reply)=>{const b:any=r.body,aid=await ensureActivity(r,activityId(r,b));if(!aid||!b?.name)return reply.code(400).send({error:'INVALID_INPUT'});const id=crypto.randomUUID();await query('insert into warranty_policies(id,organization_id,activity_id,name,scope_type,scope_key,duration_months) values($1,$2,$3,$4,$5,$6,$7)',[id,r.auth!.organizationId,aid,b.name,b.scopeType||'activity',b.scopeKey||null,Number(b.durationMonths||12)]);return reply.code(201).send({id})});

  app.post('/pricing/suggestions',async(r,reply)=>{const b:any=r.body||{},org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r,b));if(!aid)return {servicePrice:null,partPrices:{},recommendedPartSignatures:[],relevantParts:[]};const norm=(v:any)=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');const sig=norm(b.service||b.intervention);const service=(await query(`select price_ttc from document_price_memory where organization_id=$1 and activity_id=$2 and kind='service' and signature=$3 order by use_count desc,last_used_at desc limit 1`,[org,aid,sig])).rows[0];const partPrices:any={};for(const x of Array.isArray(b.parts)?b.parts:[]){const ps=norm([x.name,x.model,x.variant,x.color,x.quality,x.reference].join('|'));const row=(await query(`select price_ttc from document_price_memory where organization_id=$1 and activity_id=$2 and kind='part' and signature=$3 order by use_count desc,last_used_at desc limit 1`,[org,aid,ps])).rows[0];if(row)partPrices[x.id||ps]=Number(row.price_ttc)}const patterns=(await query(`select part_signature from recommendation_patterns where organization_id=$1 and service_signature=$2 and use_count>=2 order by use_count desc,last_used_at desc limit 30`,[org,sig])).rows.map(x=>x.part_signature);const relevantRows=(await query(`select p.*,coalesce((select max(rp.use_count) from recommendation_patterns rp where rp.organization_id=$1 and rp.service_signature=$2 and rp.part_signature=lower(regexp_replace(trim(concat_ws('|',p.name,p.model,p.variant,p.color,p.quality,p.reference)),'\\s+',' ','g'))),0) learned_count from parts p where p.organization_id=$1 and p.activity_id=$3 order by learned_count desc,p.updated_at desc limit 100`,[org,sig,aid])).rows;return {servicePrice:service?Number(service.price_ttc):null,partPrices,recommendedPartSignatures:patterns,relevantParts:relevantRows};});
  app.post('/pricing/learn',async(r,reply)=>{const b:any=r.body||{},org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r,b));if(!aid)return {ok:true};const norm=(v:any)=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');const service=norm(b.service||b.intervention);if(service&&Number(b.servicePrice)>=0)await query(`insert into document_price_memory(organization_id,activity_id,kind,signature,price_ttc) values($1,$2,'service',$3,$4) on conflict(organization_id,activity_id,kind,signature) do update set price_ttc=excluded.price_ttc,last_used_at=now(),use_count=document_price_memory.use_count+1`,[org,aid,service,Number(b.servicePrice||0)]);for(const x of Array.isArray(b.parts)?b.parts:[]){const ps=norm([x.name,x.model,x.variant,x.color,x.quality,x.reference].join('|'));if(!ps||Number(x.price)<0)continue;await query(`insert into document_price_memory(organization_id,activity_id,kind,signature,price_ttc) values($1,$2,'part',$3,$4) on conflict(organization_id,activity_id,kind,signature) do update set price_ttc=excluded.price_ttc,last_used_at=now(),use_count=document_price_memory.use_count+1`,[org,aid,ps,Number(x.price||0)]);if(service)await query(`insert into recommendation_patterns(organization_id,activity_id,service_signature,part_signature) values($1,$2,$3,$4) on conflict(organization_id,activity_id,service_signature,part_signature) do update set use_count=recommendation_patterns.use_count+1,last_used_at=now()`,[org,aid,service,ps]);}return {ok:true};});
  app.post('/pricing/calculate',async(r,reply)=>{try{return computePricing((r.body||{}) as any)}catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}});

  app.get('/electronic-invoicing/profile',async r=>{const row=(await query('select * from electronic_invoice_profiles where organization_id=$1',[r.auth!.organizationId])).rows[0]||{};return {platformName:row.platform_name||null,platformIdentifier:row.platform_identifier||null,registrationStatus:row.registration_status||'not_registered',routingIdentifier:row.routing_identifier||null};});
  app.patch('/electronic-invoicing/profile',async(r,reply)=>{const b:any=r.body||{};const status=['not_registered','candidate','registered'].includes(b.registrationStatus)?b.registrationStatus:'not_registered';await query(`insert into electronic_invoice_profiles(organization_id,platform_name,platform_identifier,registration_status,routing_identifier,updated_at) values($1,$2,$3,$4,$5,now()) on conflict(organization_id) do update set platform_name=excluded.platform_name,platform_identifier=excluded.platform_identifier,registration_status=excluded.registration_status,routing_identifier=excluded.routing_identifier,updated_at=now()`,[r.auth!.organizationId,b.platformName||null,b.platformIdentifier||null,status,b.routingIdentifier||null]);return {ok:true,status};});
  app.get('/quotes',async r=>(await query(`select q.*,q.catalog_pricing as "catalogPricing",q.coefficient_unit as "coefficientUnit",q.coefficient_value as "coefficientValue",coalesce((select sum(ir.penalty_amount) from invoice_reminders ir where ir.quote_id=q.id),0)::numeric total_penalty_amount,coalesce((select json_agg(json_build_object('id',ir.id,'reminderNumber',ir.reminder_number,'penaltyAmount',ir.penalty_amount,'createdAt',ir.sent_at) order by ir.reminder_number) from invoice_reminders ir where ir.quote_id=q.id),'[]'::json) reminders,c.name client_name,c.email client_email,coalesce((select json_agg(json_build_object('id',i.id,'label',i.label,'quantity',i.quantity,'unitCost',i.unit_cost,'unitPrice',i.unit_price,'saleCoefficientPercent',i.sale_coefficient_percent,'photoKey',i.photo_key,'partId',i.part_id) order by i.position) from quote_items i where i.quote_id=q.id),'[]'::json) items,coalesce((select json_agg(json_build_object('id',w.id,'scopeType',w.scope_type,'policyName',w.policy_name,'endsAt',w.ends_at,'remainingDays',greatest(0,ceil(extract(epoch from(w.ends_at-now()))/86400.0)::int)) order by w.ends_at) from warranties w where w.quote_id=q.id and w.ends_at>now()),'[]'::json) warranties from quotes q left join clients c on c.id=q.client_id where q.organization_id=$1 and ($2::uuid is null or q.activity_id=$2) order by q.created_at desc`,[r.auth!.organizationId,activityId(r)])).rows);
  app.get('/invoices/:id/electronic-data',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const q=(await query(`select q.*,c.name client_name,c.email client_email,c.address client_address,o.name company_name,o.siren,o.siret from quotes q left join clients c on c.id=q.client_id join organizations o on o.id=q.organization_id where q.id=$1 and q.organization_id=$2 and q.document_type='invoice'`,[id,org])).rows[0];if(!q)return reply.code(404).send({error:'NOT_FOUND'});const items=(await query('select label,quantity,unit_price from quote_items where quote_id=$1 order by position',[id])).rows;const payload=buildStructuredInvoice(q,items);await query('update quotes set structured_invoice=$1,electronic_status=case when electronic_status=\'prepared\' then \'ready\' else electronic_status end where id=$2 and organization_id=$3',[payload,id,org]);return payload;});
  app.post('/quotes',async(r,reply)=>{
    const parsedBody=quoteCreateInputSchema.safeParse(r.body);
    if(!parsedBody.success)return reply.code(400).send({error:'INVALID_INPUT',message:'Les données du devis sont invalides.'});
    const b:any=parsedBody.data,org=r.auth!.organizationId;
    try{
      b.vatRate=requiredNumber(b.vatRate,'TVA',0,100);
      b.urssafRate=optionalNumber(b.urssafRate,'Cotisations',0,99.99)??0;
      b.shippingCost=optionalNumber(b.shippingCost,'Livraison',0,1e9)??0;
      b.purchaseVatRate=optionalNumber(b.purchaseVatRate,'TVA achats',0,100);
      b.reminderIntervalDays=optionalNumber(b.reminderIntervalDays,'Délai de relance',0,365)??0;
      b.latePenaltyValue=optionalNumber(b.latePenaltyValue,'Majoration',0,1e9)??0;
      b.mileageKm=optionalNumber(b.mileageKm,'Kilométrage',0,1e7)??0;
      b.mileageInternalRate=optionalNumber(b.mileageInternalRate??b.mileageRate,'Coût kilométrique interne',0,1e4)??0;
      b.mileageClientRate=optionalNumber(b.mileageClientRate??b.mileageRate??b.mileageInternalRate,'Tarif kilométrique client',0,1e4)??0;
      b.coefficientValue=optionalNumber(b.coefficientValue,'Coefficient',0,1e6)??0;
      b.laborSellingHt=optionalNumber(b.laborSellingHt,'Prix de vente main-d’œuvre',0,1e9);
      b.laborInternalCostHt=optionalNumber(b.laborInternalCostHt,'Coût interne main-d’œuvre',0,1e9)??0;
    }catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}
    if(!b.intervention||!String(b.intervention).trim())return reply.code(400).send({error:'INVALID_INPUT',message:'La prestation est obligatoire.'});
    const aid=await ensureActivity(r,activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    let prepared:any;
    try{prepared=await prepareQuoteCalculation(org,aid,b)}catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}
    const {items,basis,unit,selectedValue,partCoefficient,laborCoefficient,rawPart,shippingCost,mileageKm,mileageInternalRate,mileageClientRate,mileageTotal,mileageMode,laborSellingHt,laborInternalCostHt,contributions,targetTtc,catalogPricing,p}=prepared;
    const client=b.clientId?await query('select id from clients where id=$1 and organization_id=$2 and (activity_id=$3 or activity_id is null)',[b.clientId,org,aid]):{rowCount:1};
    if(!client.rowCount)return reply.code(400).send({error:'INVALID_INPUT',message:'Client invalide pour ce devis.'});
    if(!b.allowLoss&&p.belowMinimumPrice)return reply.code(400).send({error:'MARGIN_GUARD',message:'Le prix est inférieur au minimum calculé à partir des coûts directs et du coefficient.',minimumTotalHt:p.minimumSellingHt});

    const documentType=b.documentType==='invoice'?'invoice':'quote';
    const number=await nextNumber(org,documentType==='invoice'?'FAC':'DEV');
    const id=crypto.randomUUID();
    const cgv=(await query('select cgv_text from activities where id=$1 and organization_id=$2',[aid,org])).rows[0]?.cgv_text||null;
    const status=documentType==='invoice'?'issued':'draft';
    const invoiceAddressSource=['client','intervention','free'].includes(String(b.invoiceAddressSource))?String(b.invoiceAddressSource):'client';
    const billingAddress=invoiceAddressSource==='free'
      ?String(b.billingAddress||'').trim()||null
      :(b.clientId
        ?(invoiceAddressSource==='intervention'
          ?(await query('select intervention_address from clients where id=$1 and organization_id=$2',[b.clientId,org])).rows[0]?.intervention_address||null
          :(await query('select address from clients where id=$1 and organization_id=$2',[b.clientId,org])).rows[0]?.address||null)
        :null);
    if(invoiceAddressSource==='free'&&!billingAddress)return reply.code(400).send({error:'INVALID_INPUT',message:'Saisissez une adresse de facturation libre.'});
    const reminderInterval=Math.min(365,Math.max(0,Number(b.reminderIntervalDays||0)));
    const purchaseVatMode=['auto','manual','exempt'].includes(String(b.purchaseVatMode))?String(b.purchaseVatMode):'auto';
    const structured={
      profile:'factur-x',identifier:null,status:'prepared',seller:{organizationId:org},buyer:{clientId:b.clientId},
      totals:{ht:p.totalHt,tva:p.vat,ttc:p.totalTtc,baseTtc:targetTtc,mileage:{mode:mileageMode,km:mileageKm,internalRate:mileageInternalRate,clientRate:mileageClientRate,total:mileageTotal}},
      calculationVersion:2
    };
    const snapshot={version:2,baseTargetTtc:targetTtc,vatRate:b.vatRate,purchaseVatMode,purchaseVatRate:b.purchaseVatRate===''||b.purchaseVatRate===undefined?null:Number(b.purchaseVatRate),coefficient:{basis,unit,value:selectedValue},mileage:{mode:mileageMode,km:mileageKm,internalRate:mileageInternalRate,clientRate:mileageClientRate,total:mileageTotal},result:p};
    try{
      await withTransaction(async clientDb=>{
        await clientDb.query(`insert into quotes(
          id,organization_id,activity_id,client_id,number,document_type,status,intervention,product,
          part_cost,shipping_cost,mileage_km,mileage_rate,mileage_total,mileage_mode,labor_cost,margin,
          vat_rate,urssaf_rate,total_ht,total_tva,total_ttc,final_price_ttc,warranty_text,cgv_snapshot,
          margin_coefficient_percent,coefficient_value,coefficient_unit,coefficient_basis,payment_status,
          invoice_address_source,billing_address_snapshot,due_at,reminder_interval_days,late_penalty_mode,
          late_penalty_value,next_reminder_at,catalog_pricing,structured_invoice,part_coefficient_percent,
          labor_coefficient_percent,mileage_internal_rate,mileage_client_rate,labor_selling_ht,labor_internal_cost_ht,
          purchase_vat_mode,purchase_vat_rate,contribution_snapshot,calculation_snapshot,calculation_version
        ) values(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
          $26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50
        )`,[
          id,org,aid,b.clientId,number,documentType,status,String(b.intervention).trim(),summarize(items)||b.product||null,
          rawPart,shippingCost,mileageKm,mileageClientRate,mileageTotal,mileageMode,p.laborHt,p.grossMargin,
          b.vatRate,b.urssafRate,p.totalHt,p.vat,p.totalTtc,targetTtc,b.warrantyText||null,cgv,
          unit==='percent'?selectedValue:0,selectedValue,unit,basis,'unpaid',invoiceAddressSource,billingAddress,b.dueAt||null,
          reminderInterval,['fixed','percent'].includes(String(b.latePenaltyMode))?String(b.latePenaltyMode):'none',Math.max(0,Number(b.latePenaltyValue||0)),null,
          catalogPricing===true,structured,partCoefficient,laborCoefficient,mileageInternalRate,mileageClientRate,laborSellingHt??p.laborSellingHt,laborInternalCostHt,
          purchaseVatMode,b.purchaseVatRate===''||b.purchaseVatRate===undefined?null:Number(b.purchaseVatRate),JSON.stringify(contributions),JSON.stringify(snapshot),2
        ]);
        await saveItems(clientDb,id,org,aid,items,partCoefficient,basis,unit,selectedValue);
      });
    }catch(e:any){r.log.error({err:e,quoteId:id,documentType},'quote/invoice creation failed');return reply.code(500).send({error:'QUOTE_SAVE_FAILED',message:String(e?.message||'Le devis ou la facture n’a pas pu être enregistré.')});}
    if(b.clientId){try{await pauseClientTimer(org,r.auth!.userId,b.clientId)}catch(error){r.log.warn({err:error,quoteId:id,clientId:b.clientId},'client timer pause skipped after document save')}}
    const emailStatus=b.sendEmail&&b.clientId?await emailDocument(org,id,documentType,number,b.clientId):'not_requested';
    return reply.code(201).send({id,number,documentType,totalHt:p.totalHt,totalTva:p.vat,totalTtc:p.totalTtc,netMargin:p.netMargin,urssafEstimate:p.urssafEstimate,emailStatus});
  });
  app.patch('/quotes/:id',async(r,reply)=>{
    const parsedBody=quotePatchInputSchema.safeParse(r.body||{});
    if(!parsedBody.success)return reply.code(400).send({error:'INVALID_INPUT',message:'Les données du devis sont invalides.'});
    const b:any=parsedBody.data,org=r.auth!.organizationId,id=String((r.params as any).id);
    try{
      if(b.vatRate!==undefined)b.vatRate=requiredNumber(b.vatRate,'TVA',0,100);
      if(b.urssafRate!==undefined)b.urssafRate=optionalNumber(b.urssafRate,'Cotisations',0,99.99)??0;
      if(b.shippingCost!==undefined)b.shippingCost=optionalNumber(b.shippingCost,'Livraison',0,1e9)??0;
      if(b.purchaseVatRate!==undefined)b.purchaseVatRate=optionalNumber(b.purchaseVatRate,'TVA achats',0,100);
      if(b.reminderIntervalDays!==undefined)b.reminderIntervalDays=optionalNumber(b.reminderIntervalDays,'Délai de relance',0,365)??0;
      if(b.latePenaltyValue!==undefined)b.latePenaltyValue=optionalNumber(b.latePenaltyValue,'Majoration',0,1e9)??0;
      if(b.mileageKm!==undefined)b.mileageKm=optionalNumber(b.mileageKm,'Kilométrage',0,1e7)??0;
      if(b.mileageInternalRate!==undefined||b.mileageRate!==undefined)b.mileageInternalRate=optionalNumber(b.mileageInternalRate??b.mileageRate,'Coût kilométrique interne',0,1e4)??0;
      if(b.mileageClientRate!==undefined||b.mileageRate!==undefined)b.mileageClientRate=optionalNumber(b.mileageClientRate??b.mileageRate,'Tarif kilométrique client',0,1e4)??0;
      if(b.coefficientValue!==undefined)b.coefficientValue=optionalNumber(b.coefficientValue,'Coefficient',0,1e6)??0;
      if(b.laborSellingHt!==undefined)b.laborSellingHt=optionalNumber(b.laborSellingHt,'Prix de vente main-d’œuvre',0,1e9);
      if(b.laborInternalCostHt!==undefined)b.laborInternalCostHt=optionalNumber(b.laborInternalCostHt,'Coût interne main-d’œuvre',0,1e9)??0;
    }catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}

    const cur=(await query('select id,activity_id,client_id,margin_coefficient_percent,coefficient_value,coefficient_unit,coefficient_basis,payment_status,document_type,catalog_pricing,mileage_mode,mileage_km,mileage_rate,mileage_total,mileage_internal_rate,mileage_client_rate,labor_internal_cost_ht,labor_selling_ht,vat_rate,urssaf_rate,shipping_cost,part_cost,final_price_ttc,total_ttc,warranty_text,due_at,purchase_vat_mode,purchase_vat_rate,contribution_snapshot from quotes where id=$1 and organization_id=$2',[id,org])).rows[0];
    if(!cur)return reply.code(404).send({error:'NOT_FOUND'});
    if(!b.intervention&&b.intervention!==undefined)return reply.code(400).send({error:'INVALID_INPUT',message:'La prestation est obligatoire.'});
    const currentItems= b.items===undefined
      ?(await query('select label,quantity,unit_cost unitCost,unit_price unitPrice,part_id partId,sale_coefficient_percent saleCoefficientPercent from quote_items where quote_id=$1 order by position',[id])).rows
      :undefined;
    const calculationBody={...cur,...b,activityId:cur.activity_id,clientId:b.clientId??cur.client_id,documentType:cur.document_type,catalogPricing:b.catalogPricing??cur.catalog_pricing,currentItems};
    let prepared:any;
    try{prepared=await prepareQuoteCalculation(org,cur.activity_id,calculationBody,cur)}catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}
    const {items,basis,unit,selectedValue,partCoefficient,laborCoefficient,rawPart,shippingCost,mileageKm,mileageInternalRate,mileageClientRate,mileageTotal,mileageMode,laborSellingHt,laborInternalCostHt,contributions,targetTtc,catalogPricing,p}=prepared;
    if(!b.allowLoss&&p.belowMinimumPrice)return reply.code(400).send({error:'MARGIN_GUARD',message:'Le prix est inférieur au minimum calculé à partir des coûts directs et du coefficient.',minimumTotalHt:p.minimumSellingHt});
    const clientId=b.clientId!==undefined?(b.clientId?String(b.clientId):null):cur.client_id;
    if(clientId){const c=await query('select id from clients where id=$1 and organization_id=$2 and (activity_id=$3 or activity_id is null)',[clientId,org,cur.activity_id]);if(!c.rowCount)return reply.code(400).send({error:'INVALID_INPUT',message:'Client invalide pour ce document.'});}
    const invoiceAddressSource=b.invoiceAddressSource===undefined
      ?null
      :(['client','intervention','free'].includes(String(b.invoiceAddressSource))?String(b.invoiceAddressSource):null);
    const billingAddress=invoiceAddressSource==='free'
      ?String(b.billingAddress||'').trim()||null
      :(b.billingAddress!==undefined?String(b.billingAddress||'').trim()||null:null);
    if(invoiceAddressSource==='free'&&!billingAddress)return reply.code(400).send({error:'INVALID_INPUT',message:'Saisissez une adresse de facturation libre.'});
    const purchaseVatMode=b.purchaseVatMode===undefined?(cur.purchase_vat_mode||'auto'):(['auto','manual','exempt'].includes(String(b.purchaseVatMode))?String(b.purchaseVatMode):'auto');
    const purchaseVatRate=b.purchaseVatRate===undefined?cur.purchase_vat_rate:(b.purchaseVatRate===''||b.purchaseVatRate===null?null:Number(b.purchaseVatRate));
    const reminderInterval=b.reminderIntervalDays===undefined?null:Math.min(365,Math.max(0,Number(b.reminderIntervalDays||0)));
    const latePenaltyMode=b.latePenaltyMode===undefined?null:(['fixed','percent','none'].includes(String(b.latePenaltyMode))?String(b.latePenaltyMode):'none');
    const snapshot={version:2,vatRate:p.totalHt>0?p.vat/p.totalHt*100:Number(b.vatRate??cur.vat_rate??0),purchaseVatMode,purchaseVatRate,coefficient:{basis,unit,value:selectedValue},mileage:{mode:mileageMode,km:mileageKm,internalRate:mileageInternalRate,clientRate:mileageClientRate,total:mileageTotal},result:p};
    let updated:any;
    try{
      updated=await withTransaction(async clientDb=>{
        const result=await clientDb.query(`update quotes set
          intervention=coalesce($1,intervention),product=$2,part_cost=$3,shipping_cost=$4,mileage_km=$5,mileage_rate=$6,mileage_total=$7,
          mileage_mode=$8,margin=$9,vat_rate=$10,urssaf_rate=$11,total_ht=$12,total_tva=$13,total_ttc=$14,final_price_ttc=$15,warranty_text=$16,
          margin_coefficient_percent=$17,coefficient_value=$18,coefficient_unit=$19,coefficient_basis=$20,
          invoice_address_source=coalesce($21,invoice_address_source),billing_address_snapshot=coalesce($22,billing_address_snapshot),
          due_at=case when $23::date is null then due_at else $23::date end,reminder_interval_days=case when $24::int is null then reminder_interval_days else least(365,greatest(0,$24::int)) end,
          next_reminder_at=case when document_type='invoice' and payment_status<>'paid' and reminder_count<3 and $23::date is not null and coalesce($24,reminder_interval_days)>0
            then ($23::date + interval '1 day')::timestamptz
            else case when $24::int=0 then null else next_reminder_at end end,
          late_penalty_mode=coalesce($25,late_penalty_mode),late_penalty_value=case when $26::numeric is null then late_penalty_value else greatest(0,$26::numeric) end,
          client_id=coalesce($27,client_id),catalog_pricing=coalesce($28,catalog_pricing),part_coefficient_percent=$29,labor_coefficient_percent=$30,
          mileage_internal_rate=$31,mileage_client_rate=$32,labor_selling_ht=$33,labor_internal_cost_ht=$34,
          purchase_vat_mode=$35,purchase_vat_rate=$36,contribution_snapshot=$37,calculation_snapshot=$38,calculation_version=2,updated_at=now()
          where id=$39::uuid and organization_id=$40::uuid returning *`,[
          b.intervention!==undefined?(String(b.intervention).trim()||null):null,
          summarize(items)||b.product||null,rawPart,shippingCost,mileageKm,mileageClientRate,mileageTotal,mileageMode,p.grossMargin,
          Number(b.vatRate??cur.vat_rate??0),Number(b.urssafRate??cur.urssaf_rate??0),p.totalHt,p.vat,p.totalTtc,targetTtc,b.warrantyText||null,
          unit==='percent'?selectedValue:0,selectedValue,unit,basis,invoiceAddressSource,billingAddress,b.dueAt??cur.due_at??null,reminderInterval,latePenaltyMode,
          b.latePenaltyValue===undefined?null:Number(b.latePenaltyValue||0),clientId,b.catalogPricing===undefined?null:Boolean(catalogPricing),partCoefficient,laborCoefficient,
          mileageInternalRate,mileageClientRate,laborSellingHt??p.laborSellingHt,laborInternalCostHt,purchaseVatMode,purchaseVatRate,JSON.stringify(contributions),JSON.stringify(snapshot),id,org
        ]);
        if(!result.rowCount)throw new AurionError('NOT_FOUND','Document introuvable.');
        await saveItems(clientDb,id,org,cur.activity_id,items,partCoefficient,basis,unit,selectedValue);
        return result.rows[0];
      });
    }catch(e:any){r.log.error({err:e,quoteId:id,documentType:cur.document_type},'quote/invoice update failed');return reply.code(500).send({error:'QUOTE_SAVE_FAILED',message:String(e?.message||'Le devis ou la facture n’a pas pu être enregistré.')});}
    return updated;
  });
  app.delete('/quotes/:id',async(r,reply)=>{
    const org=r.auth!.organizationId,id=(r.params as any).id;
    const gen=await query('select docx_key,odt_key,pdf_key from generated_documents where quote_id=$1 and organization_id=$2',[id,org]);
    const x=await query('delete from quotes where id=$1 and organization_id=$2',[id,org]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    for(const g of gen.rows)for(const k of [g.docx_key,g.odt_key,g.pdf_key])if(k){try{await unlink(fileFromKey(k))}catch{}}
    await query('delete from generated_documents where quote_id=$1 and organization_id=$2',[id,org]);
    return {ok:true};
  });
  app.post('/quotes/:id/invoice',async(r,reply)=>{
    const parsedBody=invoiceConversionInputSchema.safeParse(r.body||{});
    if(!parsedBody.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const id=(r.params as any).id,org=r.auth!.organizationId,b:any=parsedBody.data;
    const q=await query('select id,client_id,document_type from quotes where id=$1 and organization_id=$2',[id,org]);if(!q.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    if(q.rows[0].document_type==='invoice')return reply.code(409).send({error:'ALREADY_INVOICE',message:'Ce document est déjà une facture.'});
    const number=await nextNumber(org,'FAC');
    const dueAt=b.dueAt?String(b.dueAt):null;if(!dueAt)return reply.code(400).send({error:'INVALID_INPUT',message:'Une échéance de paiement est obligatoire pour activer les relances.'});
    const reminderInterval=Math.min(365,Math.max(0,Number(b.reminderIntervalDays??0)));const due=new Date(`${dueAt}T00:00:00`);if(isNaN(due.getTime()))return reply.code(400).send({error:'INVALID_INPUT',message:'Échéance de paiement invalide.'});
    const invoiceAddressSource=['client','intervention','free'].includes(String(b.invoiceAddressSource))?String(b.invoiceAddressSource):'client';
    const billingAddress=invoiceAddressSource==='free'?String(b.billingAddress||'').trim()||null:(invoiceAddressSource==='intervention'?(await query('select intervention_address from clients where id=$1 and organization_id=$2',[q.rows[0].client_id,org])).rows[0]?.intervention_address||null:(await query('select address from clients where id=$1 and organization_id=$2',[q.rows[0].client_id,org])).rows[0]?.address||null);
    if(invoiceAddressSource==='free'&&!billingAddress)return reply.code(400).send({error:'INVALID_INPUT',message:'Saisissez une adresse de facturation libre.'});
    await query("update quotes set document_type='invoice',status='issued',number=$1,payment_status='unpaid',amount_paid=0,paid_at=null,invoice_address_source=$2,billing_address_snapshot=$3,due_at=$4::date,reminder_interval_days=$5::int,next_reminder_at=case when $5::int > 0 then ($4::date + interval '1 day')::timestamptz else null end,updated_at=now() where id=$6::uuid and organization_id=$7::uuid",[number,invoiceAddressSource,billingAddress,dueAt,reminderInterval,id,org]);
    const converted=(await query('select activity_id,total_ttc from quotes where id=$1 and organization_id=$2',[id,org])).rows[0];
    if(q.rows[0].client_id){const aid=(await query('select activity_id from quotes where id=$1 and organization_id=$2',[id,org])).rows[0]?.activity_id;if(aid) await resumeClientTimer(org,r.auth!.userId,q.rows[0].client_id,aid);}
    const emailStatus=(r.body as any)?.sendEmail!==false?await emailDocument(org,id,'invoice',number,q.rows[0].client_id):'not_requested';
    if(emailStatus==='sent' && q.rows[0].client_id) await stopClientTimer(org,r.auth!.userId,q.rows[0].client_id);
    return {number,emailStatus};
  });
  app.get('/invoices/:id/installments',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const q=(await query("select id,number,total_ttc from quotes where id=$1 and organization_id=$2 and document_type='invoice'",[id,org])).rows[0];if(!q)return reply.code(404).send({error:'NOT_FOUND'});return {invoice:q,installments:(await query('select id,installment_number,due_at,amount_due,amount_paid,status from invoice_installments where quote_id=$1 and organization_id=$2 order by installment_number',[id,org])).rows};});
  app.post('/invoices/:id/installments',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId,b:any=r.body||{};const q=(await query("select id,total_ttc from quotes where id=$1 and organization_id=$2 and document_type='invoice'",[id,org])).rows[0];if(!q)return reply.code(404).send({error:'NOT_FOUND'});const total=Math.round(Number(q.total_ttc||0)*100)/100;let rows:any[]=[];if(Array.isArray(b.installments)&&b.installments.length){rows=b.installments.map((x:any,i:number)=>({n:i+1,date:String(x.dueAt||x.due_at||''),amount:Math.round(Number(x.amount??x.amountDue??0)*100)/100}));}else{const count=Math.max(1,Math.min(120,Number(b.count||0)));if(!count)return reply.code(400).send({error:'INVALID_INPUT',message:'Indiquez le nombre d’échéances.'});const start=new Date(`${String(b.startDate||'').slice(0,10)}T12:00:00`);if(isNaN(start.getTime()))return reply.code(400).send({error:'INVALID_INPUT',message:'Date de première échéance invalide.'});const interval=Math.max(0,Math.min(3650,Number(b.intervalDays??30)));const base=Math.floor((total/count)*100)/100;for(let i=0;i<count;i++){const d=new Date(start);d.setDate(d.getDate()+i*interval);rows.push({n:i+1,date:d.toISOString().slice(0,10),amount:i===count-1?Math.round((total-base*(count-1))*100)/100:base});}}if(rows.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!Number.isFinite(x.amount)||x.amount<0))return reply.code(400).send({error:'INVALID_INPUT',message:'Échéancier invalide.'});const sum=Math.round(rows.reduce((n,x)=>n+x.amount,0)*100)/100;if(Math.abs(sum-total)>0.01)return reply.code(400).send({error:'INSTALLMENTS_TOTAL_MISMATCH',message:`L’échéancier doit totaliser ${total.toFixed(2)} €.`});await query('delete from invoice_installments where quote_id=$1 and organization_id=$2',[id,org]);for(const x of rows)await query('insert into invoice_installments(organization_id,quote_id,installment_number,due_at,amount_due) values($1,$2,$3,$4::date,$5)',[org,id,x.n,x.date,x.amount]);return {ok:true,installments:(await query('select id,installment_number,due_at,amount_due,amount_paid,status from invoice_installments where quote_id=$1 and organization_id=$2 order by installment_number',[id,org])).rows};});
  app.get('/invoices/:id/payments',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const q=(await query("select id,number,total_ttc,payment_status,amount_paid,coalesce((select sum(penalty_amount) from invoice_reminders ir where ir.quote_id=quotes.id),0)::numeric total_penalty_amount from quotes where id=$1 and organization_id=$2 and document_type='invoice'",[id,org])).rows[0];if(!q)return reply.code(404).send({error:'NOT_FOUND'});return {invoice:q,payments:(await query('select id,amount,payment_method,paid_at,reference,note from invoice_payments where quote_id=$1 and organization_id=$2 order by paid_at desc',[id,org])).rows};});
  app.post('/invoices/:id/payments',async(r,reply)=>{const parsedBody=invoicePaymentInputSchema.safeParse(r.body||{});if(!parsedBody.success)return reply.code(400).send({error:'INVALID_INPUT'});const id=String((r.params as any).id),org=r.auth!.organizationId,b:any=parsedBody.data;const q=(await query("select q.id,coalesce(q.activity_id,(select a.id from activities a where a.organization_id=q.organization_id and a.active=true order by a.created_at limit 1)) activity_id,q.number,q.total_ttc,q.payment_status,q.amount_paid,q.reminder_count,q.late_penalty_mode,q.late_penalty_value from quotes q where q.id=$1 and q.organization_id=$2 and q.document_type='invoice'",[id,org])).rows[0];if(!q)return reply.code(404).send({error:'NOT_FOUND'});if(!q.activity_id)return reply.code(400).send({error:'INVALID_INPUT',message:'Aucune activité valide n’est associée à cette facture.'});const amount=Math.round(Number(String(b.amount??'').replace(',','.'))*100)/100;if(!Number.isFinite(amount)||amount<=0)return reply.code(400).send({error:'INVALID_INPUT'});const penalties=(await query('select coalesce(sum(penalty_amount),0) total from invoice_reminders where quote_id=$1 and organization_id=$2',[id,org])).rows[0];const dueTotal=Number(q.total_ttc||0)+Number(penalties?.total||0);const remaining=Math.max(0,dueTotal-Number(q.amount_paid||0));if(remaining<=0)return reply.code(409).send({error:'ALREADY_PAID',message:'Cette facture est déjà entièrement payée.'});if(amount>remaining+0.005)return reply.code(400).send({error:'PAYMENT_TOO_HIGH',message:`Montant restant : ${remaining.toFixed(2)} €.`});const method=String(b.paymentMethod||'');if(!['transfer','card','cash','cheque','crypto'].includes(method))return reply.code(400).send({error:'INVALID_INPUT',message:'Choisissez un mode de paiement valide : espèces, chèque, carte, virement ou crypto.'});const reference=b.reference?String(b.reference).trim().slice(0,160)||null:null;const note=b.note?String(b.note).trim().slice(0,2000)||null:null;let paidAt=new Date();if(b.paidAt){const d=new Date(`${b.paidAt}`.length<=10?`${b.paidAt}T12:00:00`:b.paidAt);if(!isNaN(d.getTime())&&d.getTime()<=Date.now()+86400000)paidAt=d;}const pid=crypto.randomUUID();const paid=Number(q.amount_paid||0)+amount;const status=paid+0.005>=dueTotal?'paid':'partially_paid';const client=await db.connect();try{await client.query('begin');await client.query("insert into invoice_payments(id,organization_id,quote_id,amount,payment_method,paid_at,reference,note) values($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::varchar(20),$6::timestamptz,$7::varchar(160),$8::text)",[pid,org,id,amount,method,paidAt,reference,note]);const inst=(await client.query('select id,amount_due,amount_paid from invoice_installments where quote_id=$1 and organization_id=$2 and amount_paid<amount_due order by installment_number for update',[id,org])).rows;let remainingPayment=amount;for(const row of inst){if(remainingPayment<=0)break;const due=Math.max(0,Number(row.amount_due)-Number(row.amount_paid));const applied=Math.min(due,remainingPayment);const nextPaid=Number(row.amount_paid)+applied;await client.query("update invoice_installments set amount_paid=$1,status=$2,updated_at=now() where id=$3",[nextPaid,nextPaid+0.005>=Number(row.amount_due)?'paid':'partially_paid',row.id]);remainingPayment-=applied;}await client.query("update quotes set amount_paid=$1::numeric,payment_status=$2::varchar(20),paid_at=case when $2::varchar(20)='paid' then now() else paid_at end,status=case when $2::varchar(20)='paid' then 'paid' else status end,updated_at=now() where id=$3::uuid and organization_id=$4::uuid",[paid,status,id,org]);await client.query('commit');try{await query('insert into accounting_entries(organization_id,activity_id,entry_type,amount,entry_date,source_id,label) values($1::uuid,$2::uuid,$3::varchar(30),$4::numeric,current_date,$5::uuid,$6::varchar(240))',[org,q.activity_id,'payment',amount,id,`Paiement facture ${q.number}`]);}catch(e:any){r.log.error({err:e,invoiceId:id},'payment accounting entry failed');}return reply.code(201).send({id:pid,amount,paidAmount:paid,remaining:Math.max(0,dueTotal-paid),status});}catch(e:any){await client.query('rollback').catch(()=>{});r.log.error({err:e,invoiceId:id},'invoice payment failed');return reply.code(500).send({error:'PAYMENT_SAVE_FAILED',message:'Le paiement n’a pas pu être enregistré.'})}finally{client.release()}});
  app.patch('/invoices/:id/penalty',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId,b:any=r.body||{};const q=(await query("select reminder_count,payment_status from quotes where id=$1 and organization_id=$2 and document_type='invoice'",[id,org])).rows[0];if(!q)return reply.code(404).send({error:'NOT_FOUND'});if(q.payment_status==='paid')return reply.code(409).send({error:'ALREADY_PAID',message:'Cette facture est déjà réglée.'});if(Number(q.reminder_count||0)!==3)return reply.code(409).send({error:'PENALTY_WINDOW',message:'La majoration se configure après la 3e relance et avant l’envoi de la 4e relance.'});const mode=['fixed','percent'].includes(String(b.mode))?String(b.mode):'none';const value=Math.max(0,Math.round(Number(String(b.value??'').replace(',','.'))*100)/100);if(mode==='none'||value===0){await query("update quotes set late_penalty_mode='none',late_penalty_value=0,updated_at=now() where id=$1 and organization_id=$2",[id,org]);return {mode:'none',value:0}};await query("update quotes set late_penalty_mode=$1,late_penalty_value=$2,updated_at=now() where id=$3 and organization_id=$4",[mode,value,id,org]);return {mode,value};});
  app.post('/invoices/:id/reminders',async(r,reply)=>{
    const id=String((r.params as any).id),org=r.auth!.organizationId,b:any=r.body||{};
    const q=(await query("select q.*,c.email client_email,c.name client_name,o.name company_name from quotes q left join clients c on c.id=q.client_id join organizations o on o.id=q.organization_id where q.id=$1 and q.organization_id=$2 and q.document_type='invoice'",[id,org])).rows[0];
    if(!q)return reply.code(404).send({error:'NOT_FOUND'});
    if(q.payment_status==='paid')return reply.code(409).send({error:'ALREADY_PAID',message:'Cette facture est déjà réglée.'});
    if(!q.client_id||!q.client_email)return reply.code(400).send({error:'CLIENT_EMAIL_MISSING'});
    const current=Number(q.reminder_count||0),next=current+1;
    if(next>1000)return reply.code(409).send({error:'REMINDER_LIMIT',message:'Le nombre maximal de relances (1000) est atteint.'});
    let penalty=0;
    if(next===4){
      penalty=calculateReminderPenalty(Number(q.total_ttc||0),Number((await query('select coalesce(sum(penalty_amount),0) total from invoice_reminders where quote_id=$1 and organization_id=$2',[id,org])).rows[0]?.total||0),q.late_penalty_mode||'none',Number(q.late_penalty_value||0));
    } else if(next>4){
      const mode:PenaltyMode=['fixed','percent'].includes(String(b.additionalPenaltyMode))?(String(b.additionalPenaltyMode) as 'fixed'|'percent'):'fixed';
      const value=Math.max(0,Math.round(Number(String(b.additionalPenaltyValue??0).replace(',','.'))*100)/100);
      if(value<=0)return reply.code(400).send({error:'INVALID_INPUT',message:'Définissez une nouvelle majoration pour cette relance.'});
      const previousPenalties=Number((await query('select coalesce(sum(penalty_amount),0) total from invoice_reminders where quote_id=$1 and organization_id=$2',[id,org])).rows[0]?.total||0);
      penalty=calculateReminderPenalty(Number(q.total_ttc||0),previousPenalties,mode,value);
    }
    const d=await renderDocument(org,id,'invoice');const pdf=await readFile(fileFromKey(d.keys.pdf));
    const labels=['','1ère relance','2e relance','3e relance','4e relance'];const label=labels[next]||`${next}e relance`;
    const previousPenalties=Number((await query('select coalesce(sum(penalty_amount),0) total from invoice_reminders where quote_id=$1 and organization_id=$2',[id,org])).rows[0]?.total||0);
    const reminderAmount=reminderTotal(Number(q.total_ttc||0),previousPenalties,penalty);
    const text=`Bonjour ${q.client_name||''},\n\nVeuillez trouver votre facture ${q.number}, ${label.toLowerCase()}.\nMontant TTC de la relance précédente : ${Number(q.total_ttc||0)+previousPenalties > 0 ? (Number(q.total_ttc||0)+previousPenalties).toFixed(2) : Number(q.total_ttc||0).toFixed(2)} €.${penalty?`\nNouvelle majoration : ${penalty.toFixed(2)} €.\nNouveau total TTC : ${reminderAmount.toFixed(2)} €.`:''}\n\nCordialement,\n${q.company_name||'Aurion'}`;
    try{await sendOrgMail(org,{to:q.client_email,subject:`Facture ${q.number} · ${label}`,text,attachments:[{filename:`${q.number}-${next}e-relance.pdf`,content:pdf}]});}catch(e:any){return reply.code(502).send({error:'MAIL_FAILED',message:String(e?.message||e)});}
    await query('insert into invoice_reminders(organization_id,quote_id,reminder_number,penalty_amount,created_by) values($1,$2,$3,$4,$5)',[org,id,next,penalty,r.auth!.userId]);
    const intervalDays=Math.min(365,Math.max(0,Number(q.reminder_interval_days??0)));const nextAt=next<3&&intervalDays>0?new Date(Date.now()+intervalDays*86400000):null;
    await query('update quotes set reminder_count=$1,last_reminder_at=now(),next_reminder_at=$2,updated_at=now() where id=$3 and organization_id=$4',[next,nextAt,id,org]);
    return {ok:true,reminderNumber:next,penaltyAmount:penalty};
  });
  app.post('/time-metrics/reset',async r=>{await query("delete from client_time_sessions where organization_id=$1",[r.auth!.organizationId]);return {ok:true};});
  app.get('/time-metrics',async r=>{
    const org=r.auth!.organizationId;
    const totals=(await query(`select coalesce(sum(case when status='running' then accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int) when status='paused' then accumulated_seconds else duration_seconds end),0) actual_seconds,count(distinct client_id)::int clients,count(*) filter(where status in ('completed','paused'))::int sessions from client_time_sessions where organization_id=$1 and status in ('completed','paused','running')`,[org])).rows[0];
    const manualRow=(await query('select coalesce(sum(estimated_minutes),0) manual_minutes from clients where organization_id=$1',[org])).rows[0];
    const active=(await query(`select s.id,s.client_id,c.estimated_minutes,s.started_at,c.name client_name from client_time_sessions s join clients c on c.id=s.client_id where s.organization_id=$1 and s.ended_at is null and s.status='running' limit 1`,[org])).rows[0]||null;
    const manual=Number(manualRow?.manual_minutes??0),actual=Number(totals.actual_seconds??0)/60,saved=manual-actual;
    return {manualMinutes:manual,actualMinutes:actual,savedMinutes:saved,averageSavedMinutes:totals.sessions?saved/Number(totals.sessions):0,sessions:Number(totals.sessions||0),active};
  });
  app.get('/time-metrics/stats',async r=>{const org=r.auth!.organizationId;const rows=(await query(`select date_trunc('day',ended_at)::date day,coalesce(sum(manual_minutes),0) manual,coalesce(sum(duration_seconds),0)/60.0 actual,count(*)::int sessions from client_time_sessions where organization_id=$1 and status in ('completed','paused') and ended_at is not null group by 1 order by 1 desc limit 366`,[org])).rows;return {daily:rows,weekly:(await query(`select date_trunc('week',ended_at)::date week,coalesce(sum(manual_minutes),0) manual,coalesce(sum(duration_seconds),0)/60.0 actual,count(*)::int sessions from client_time_sessions where organization_id=$1 and status in ('completed','paused') and ended_at is not null group by 1 order by 1 desc limit 104`,[org])).rows,monthly:(await query(`select date_trunc('month',ended_at)::date month,coalesce(sum(manual_minutes),0) manual,coalesce(sum(duration_seconds),0)/60.0 actual,count(*)::int sessions from client_time_sessions where organization_id=$1 and status in ('completed','paused') and ended_at is not null group by 1 order by 1 desc limit 60`,[org])).rows};});
  app.post('/time-sessions/start',async(r,reply)=>{
    const b:any=r.body||{},org=r.auth!.organizationId,clientId=String(b.clientId||'');
    const existing=(await query("select id from client_time_sessions where client_id=$1 and organization_id=$2 and user_id=$3 and ended_at is null and status='paused' order by created_at desc limit 1",[clientId,org,r.auth!.userId])).rows[0];if(existing){await query("update client_time_sessions set started_at=now(),paused_at=null,status='running' where id=$1 and organization_id=$2 and user_id=$3",[existing.id,org,r.auth!.userId]);return {id:existing.id,resumed:true};}const hasHistory=Number((await query('select 1 from client_time_sessions where client_id=$1 and organization_id=$2 limit 1',[clientId,org])).rowCount||0)>0;const manual=hasHistory?0:(Number.isFinite(Number(b.manualMinutes))?Number(b.manualMinutes):Number((await query('select estimated_minutes from clients where id=$1 and organization_id=$2',[clientId,org])).rows[0]?.estimated_minutes||0));
    if(!clientId||!Number.isFinite(manual)||manual<0||manual>100000)return reply.code(400).send({error:'INVALID_INPUT'});
    const aid=await ensureActivity(r,activityId(r,b));if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    const c=await query('select id from clients where id=$1 and organization_id=$2 and activity_id=$3',[clientId,org,aid]);if(!c.rowCount)return reply.code(400).send({error:'INVALID_INPUT'});
    const id=crypto.randomUUID();await query('insert into client_time_sessions(id,organization_id,user_id,client_id,activity_id,manual_minutes,started_at) values($1,$2,$3,$4,$5,$6,now())',[id,org,r.auth!.userId,clientId,aid,manual]);return reply.code(201).send({id});
  });
  app.post('/time-sessions/:id/stop',async(r,reply)=>{
    const org=r.auth!.organizationId,id=String((r.params as any).id);
    const x=await query(`update client_time_sessions set ended_at=now(),duration_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),accumulated_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),status='completed',paused_at=null where id=$1 and organization_id=$2 and user_id=$3 and ended_at is null and status='running' returning *`,[id,org,r.auth!.userId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return x.rows[0];
  });
  app.post('/time-sessions/:id/abandon',async(r,reply)=>{
    const org=r.auth!.organizationId,id=String((r.params as any).id);
    const x=await query(`update client_time_sessions set ended_at=now(),duration_seconds=greatest(0,extract(epoch from(now()-started_at))::int),status='abandoned' where id=$1 and organization_id=$2 and user_id=$3 and ended_at is null and status='running' returning id`,[id,org,r.auth!.userId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return {ok:true,id};
  });
  app.get('/appointments',async r=>(await query(`select a.*,c.name client_name,c.email client_email,c.address client_address,c.intervention_address client_intervention_address,q.number quote_number,q.total_ttc quote_total_ttc from appointments a left join clients c on c.id=a.client_id left join quotes q on q.id=a.quote_id where a.organization_id=$1 and ($2::uuid is null or a.activity_id=$2) order by a.starts_at`,[r.auth!.organizationId,activityId(r)])).rows);
  app.patch('/appointments/:id',async(r,reply)=>{
    const b:any=r.body,org=r.auth!.organizationId,id=(r.params as any).id;
    const start=new Date(b.startsAt),end=new Date(b.endsAt||b.startsAt);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<start)return reply.code(400).send({error:'INVALID_INPUT',message:'L’heure de fin ne peut pas être antérieure à l’heure de début.'});
    const clientId=b.clientId||null,source=['postal','intervention','free'].includes(String(b.addressSource))?String(b.addressSource):'free';let quoteId=b.quoteId||null,quoteTotal=null,quoteItems:any[]=[];
    if(quoteId){const q=(await query(`select q.id,q.client_id,q.activity_id,q.total_ttc,coalesce((select json_agg(json_build_object('label',i.label,'quantity',i.quantity,'unitPrice',i.unit_price) order by i.position) from quote_items i where i.quote_id=q.id),'[]'::json) items from quotes q where q.id=$1 and q.organization_id=$2 and q.document_type='quote'`,[quoteId,org])).rows[0];if(!q||q.client_id!==clientId)return reply.code(400).send({error:'INVALID_QUOTE'});quoteTotal=Number(q.total_ttc||0);quoteItems=Array.isArray(q.items)?q.items:[];}
    const client=clientId?(await query('select address,intervention_address from clients where id=$1 and organization_id=$2',[clientId,org])).rows[0]:null;const resolvedAddress=source==='postal'?(client?.address||''):source==='intervention'?(client?.intervention_address||''):String(b.locationAddress||'').trim();if(source!=='free'&&!resolvedAddress)return reply.code(400).send({error:'ADDRESS_MISSING',message:'L’adresse sélectionnée n’est pas renseignée dans la fiche client.'});if(source==='free'&&!resolvedAddress)return reply.code(400).send({error:'ADDRESS_MISSING',message:'Saisissez l’adresse du rendez-vous.'});
    const x=await query('update appointments set title=coalesce($1,title),starts_at=$2,ends_at=$3,client_id=$4,quote_id=$5,address_source=$6,quote_total_ttc=$7,quote_items=$8::jsonb,location_address=$9,status=coalesce($10,status) where id=$11 and organization_id=$12 returning *',[b.title,start,end,clientId,quoteId,source,quoteTotal,JSON.stringify(quoteItems),resolvedAddress,b.status||null,id,org]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    await query("delete from notification_jobs where appointment_id=$1 and status='pending'",[id]);
    const st=new Date(x.rows[0].starts_at),en=new Date(x.rows[0].ends_at);
    await query(`insert into notification_jobs(organization_id,appointment_id,kind,run_at) values($1,$2,'before',$3),($1,$2,'after',$4)`,[org,id,new Date(st.getTime()-86400000),new Date(en.getTime()+86400000)]);
    const calendar=await syncAppointment(org,await loadAppointment(org,id),'update');
    return {...x.rows[0],calendar};
  });
  app.get('/appointments/:id.pdf',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const a=(await query(`select a.*,c.name client_name,c.email client_email,q.number quote_number from appointments a left join clients c on c.id=a.client_id left join quotes q on q.id=a.quote_id where a.id=$1 and a.organization_id=$2`,[id,org])).rows[0];if(!a)return reply.code(404).send({error:'NOT_FOUND'});const {default:PDFDocument}=await import('pdfkit');const doc=new PDFDocument({size:'A4',margin:48});const chunks:Buffer[]=[];doc.on('data',(b:Buffer)=>chunks.push(b));doc.on('end',()=>{reply.header('Content-Type','application/pdf').header('Content-Disposition',`inline; filename="fiche-rendez-vous-${id}.pdf"`).send(Buffer.concat(chunks))});doc.font('Helvetica-Bold').fontSize(22).text('FICHE RENDEZ-VOUS').moveDown();doc.font('Helvetica').fontSize(11).text(`Objet : ${a.title||'—'}`).text(`Client : ${a.client_name||'—'}`).text(`Début : ${new Date(a.starts_at).toLocaleString('fr-FR')}`).text(`Fin : ${a.ends_at?new Date(a.ends_at).toLocaleString('fr-FR'):'—'}`).text(`Adresse : ${a.location_address||'—'}`).text(`Source adresse : ${a.address_source==='postal'?'Adresse postale':a.address_source==='intervention'?'Adresse d’intervention':'Adresse libre'}`).text(`Devis : ${a.quote_number||'—'}`).text(`Prix client TTC : ${a.quote_total_ttc!=null?Number(a.quote_total_ttc).toFixed(2)+' €':'—'}`).moveDown().text('Pièces nécessaires :');for(const item of (Array.isArray(a.quote_items)?a.quote_items:[]))doc.text(`• ${item.quantity||0} × ${item.label||''}`);doc.end();});
  app.delete('/appointments/:id',async(r,reply)=>{
    const org=r.auth!.organizationId,id=(r.params as any).id;const a=await loadAppointment(org,id);if(!a)return reply.code(404).send({error:'NOT_FOUND'});
    const calendar=await syncAppointment(org,a,'cancel');
    await query('delete from appointments where id=$1 and organization_id=$2',[id,org]);return {ok:true,calendar};
  });
  app.post('/appointments',async(r,reply)=>{
    const b:any=r.body,org=r.auth!.organizationId;if(!b?.title||!b?.startsAt)return reply.code(400).send({error:'INVALID_INPUT'});
    const aid=await ensureActivity(r,activityId(r,b));if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    const d=new Date(b.startsAt);if(Number.isNaN(d.getTime()))return reply.code(400).send({error:'INVALID_INPUT'});
    const id=crypto.randomUUID();const end=b.endsAt?new Date(b.endsAt):new Date(d.getTime()+3600000);if(Number.isNaN(end.getTime())||end<d)return reply.code(400).send({error:'INVALID_INPUT',message:'L’heure de fin ne peut pas être antérieure à l’heure de début.'});
    const clientId=b.clientId||null,source=['postal','intervention','free'].includes(String(b.addressSource))?String(b.addressSource):'free';let quoteId=b.quoteId||null,quoteTotal=null,quoteItems:any[]=[];
    if(quoteId){const q=(await query(`select q.id,q.client_id,q.activity_id,q.total_ttc,coalesce((select json_agg(json_build_object('label',i.label,'quantity',i.quantity,'unitPrice',i.unit_price) order by i.position) from quote_items i where i.quote_id=q.id),'[]'::json) items from quotes q where q.id=$1 and q.organization_id=$2 and q.document_type='quote'`,[quoteId,org])).rows[0];if(!q||q.client_id!==clientId||q.activity_id!==aid)return reply.code(400).send({error:'INVALID_QUOTE'});quoteTotal=Number(q.total_ttc||0);quoteItems=Array.isArray(q.items)?q.items:[];}
    const client=clientId?(await query('select address,intervention_address from clients where id=$1 and organization_id=$2',[clientId,org])).rows[0]:null;const resolvedAddress=source==='postal'?(client?.address||''):source==='intervention'?(client?.intervention_address||''):String(b.locationAddress||'').trim();if(source!=='free'&&!resolvedAddress)return reply.code(400).send({error:'ADDRESS_MISSING',message:'L’adresse sélectionnée n’est pas renseignée dans la fiche client.'});if(source==='free'&&!resolvedAddress)return reply.code(400).send({error:'ADDRESS_MISSING',message:'Saisissez l’adresse du rendez-vous.'});
    await query('insert into appointments(id,organization_id,activity_id,client_id,quote_id,address_source,quote_total_ttc,quote_items,title,starts_at,ends_at,location_address) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)',[id,org,aid,clientId,quoteId,source,quoteTotal,JSON.stringify(quoteItems),b.title,d,end,resolvedAddress]);
    await query(`insert into notification_jobs(organization_id,appointment_id,kind,run_at) values($1,$2,'before',$3),($1,$2,'after',$4)`,[org,id,new Date(d.getTime()-86400000),new Date(end.getTime()+86400000)]);
    const calendar=await syncAppointment(org,await loadAppointment(org,id),'create');
    return reply.code(201).send({id,calendar});
  });

  app.delete('/parts/:id/prices/:supplierId',async(r,reply)=>{const p:any=r.params;const x=await query('delete from supplier_parts sp using parts pt where sp.part_id=pt.id and pt.organization_id=$1 and sp.part_id=$2 and sp.supplier_id=$3',[r.auth!.organizationId,p.id,p.supplierId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.patch('/devices/:id',async(r,reply)=>{const b:any=r.body;const x=await query('update devices set type=coalesce($1,type),brand=$2,model=$3,imei=$4,serial_number=$5,notes=$6,updated_at=now() where id=$7 and organization_id=$8 returning *',[b.type||null,b.brand||null,b.model||null,b.imei||null,b.serialNumber||null,b.notes||null,((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return x.rows[0]});
  app.delete('/devices/:id',async(r,reply)=>{const x=await query('delete from devices where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.patch('/warranty-policies/:id',async(r,reply)=>{const b:any=r.body;const x=await query('update warranty_policies set name=coalesce($1,name),duration_months=coalesce($2,duration_months),scope_type=coalesce($3,scope_type),updated_at=now() where id=$4 and organization_id=$5 returning *',[b.name?.trim()||null,b.durationMonths?Number(b.durationMonths):null,b.scopeType?String(b.scopeType):null,((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return x.rows[0]});
  app.delete('/warranty-policies/:id',async(r,reply)=>{const x=await query('delete from warranty_policies where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.get('/sav',async r=>{const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));if(!aid)return [];return (await query(`select s.*,c.name client_name,q.number invoice_number from sav_cases s left join clients c on c.id=s.client_id left join quotes q on q.id=s.invoice_id where s.organization_id=$1 and s.activity_id=$2 order by s.created_at desc`,[org,aid])).rows;});
  app.post('/sav',async(r,reply)=>{const b:any=r.body||{},org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));if(!aid||!b.clientId||!b.invoiceId)return reply.code(400).send({error:'INVALID_INPUT'});const inv=(await query("select id,client_id,activity_id,document_type,sent_at from quotes where id=$1 and organization_id=$2 and document_type='invoice'",[b.invoiceId,org])).rows[0];if(!inv||inv.client_id!==b.clientId||inv.activity_id!==aid||!inv.sent_at)return reply.code(400).send({error:'SAV_UNAVAILABLE',message:'Le SAV est disponible après l’envoi de la facture et pendant la garantie.'});const warranty=(await query("select id from warranties where quote_id=$1 and organization_id=$2 and ends_at>now() limit 1",[b.invoiceId,org])).rows[0];if(!warranty)return reply.code(400).send({error:'SAV_UNAVAILABLE',message:'La garantie associée à cette facture est terminée.'});const savType=b.savType==='free_intervention'?'free_intervention':'financial';const items=Array.isArray(b.items)?b.items.map((x:any)=>({label:String(x.label||'').trim(),quantity:Math.max(0,Number(x.quantity||0)),unitPrice:Math.max(0,Number(x.unitPrice||0))})).filter((x:any)=>x.label&&x.quantity>0):[];const positive=items.reduce((n:any,x:any)=>n+x.quantity*x.unitPrice,0);const amount=savType==='financial'?-Math.round(positive*100)/100:0;const interventionCostHt=savType==='free_intervention'?Math.max(0,Number(b.interventionCostHt||0)):0;if(amount>0.005)return reply.code(400).send({error:'INVALID_INPUT'});const id=crypto.randomUUID();await query('insert into sav_cases(id,organization_id,activity_id,client_id,invoice_id,amount_ttc,items,note,sav_type,intervention_cost_ht) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,org,aid,b.clientId,b.invoiceId,amount,JSON.stringify(items),b.note?String(b.note).slice(0,2000):null,savType,interventionCostHt]);await query('insert into accounting_entries(organization_id,activity_id,entry_type,amount,entry_date,source_id,label) values($1::uuid,$2::uuid,$3::varchar(30),$4::numeric,current_date,$5::uuid,$6::varchar(240))',[org,aid,'sav',amount,id,`SAV facture ${inv.id}`]);return reply.code(201).send({id,amountTtc:amount});});
  app.get('/sav/:id',async(r,reply)=>{const x=await query('select s.*,c.name client_name,q.number invoice_number from sav_cases s left join clients c on c.id=s.client_id left join quotes q on q.id=s.invoice_id where s.id=$1 and s.organization_id=$2',[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return x.rows[0]});
  app.patch('/sav/:id',async(r,reply)=>{const b:any=r.body||{},id=String((r.params as any).id),org=r.auth!.organizationId;const current=(await query('select * from sav_cases where id=$1 and organization_id=$2',[id,org])).rows[0];if(!current)return reply.code(404).send({error:'NOT_FOUND'});const savType=b.savType==='free_intervention'?'free_intervention':(current.sav_type||'financial');const items=Array.isArray(b.items)?b.items.map((x:any)=>({label:String(x.label||'').trim(),quantity:Math.max(0,Number(x.quantity||0)),unitPrice:Math.max(0,Number(x.unitPrice||0))})).filter((x:any)=>x.label&&x.quantity>0):current.items||[];const amount=savType==='financial'?-Math.round(items.reduce((n:any,x:any)=>n+x.quantity*x.unitPrice,0)*100)/100:0;const interventionCostHt=savType==='free_intervention'?Math.max(0,Number(b.interventionCostHt??current.intervention_cost_ht??0)):0;if(amount>0.005)return reply.code(400).send({error:'INVALID_INPUT'});await query('update sav_cases set sav_type=$1,items=$2::jsonb,amount_ttc=$3::numeric,intervention_cost_ht=$4::numeric,note=$5,updated_at=now() where id=$6 and organization_id=$7',[savType,JSON.stringify(items),amount,interventionCostHt,b.note?String(b.note).slice(0,2000):null,id,org]);await query('update accounting_entries set amount=$1::numeric,label=$2::varchar(240) where source_id=$3 and organization_id=$4',[amount,`SAV facture ${current.invoice_id}`,id,org]);return {id,amountTtc:amount};});
  app.delete('/sav/:id',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const x=await query('delete from sav_cases where id=$1 and organization_id=$2 returning id',[id,org]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});await query('delete from accounting_entries where source_id=$1 and organization_id=$2',[id,org]);return {ok:true};});
  app.get('/dashboard/summary',async r=>{
    const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));
    const t=await query(`select count(*)::int n from support_tickets where organization_id=$1 and status not in ('resolved','duplicate','closed')`,[org]);
    if(!aid)return {tickets:Number(t.rows[0]?.n||0),unpaidCount:0,unpaidTotal:0,forecastEntries:0};
    const u=await query(`select count(*)::int n,coalesce(sum(greatest(0,total_ttc-coalesce(amount_paid,0))),0)::numeric total,min(coalesce(due_at,created_at)) first_date from quotes where organization_id=$1 and activity_id=$2 and document_type='invoice' and payment_status<>'paid'`,[org,aid]);
    const f=await query(`select coalesce(sum(total_ttc),0)::numeric total from quotes where organization_id=$1 and activity_id=$2 and document_type='quote' and status<>'canceled'`,[org,aid]);
    const r4=await query(`select count(*)::int n,min(coalesce(next_reminder_at,due_at,created_at)) first_date from quotes where organization_id=$1 and activity_id=$2 and document_type='invoice' and payment_status<>'paid' and reminder_count=3`,[org,aid]);
    const historyMonths=Math.min(120,Math.max(1,Number((r.query as any)?.forecastMonths||6)));
    const paid=(await query(`select coalesce(sum(p.amount),0)::numeric total from invoice_payments p join quotes q on q.id=p.quote_id where q.organization_id=$1 and q.activity_id=$2 and q.document_type='invoice' and p.paid_at>=now()-($3||' months')::interval`,[org,aid,historyMonths])).rows[0];
    const historicalAverage=Number(paid?.total||0)/Math.max(1,historyMonths);
    const open=Number(f.rows[0]?.total||0);
    const nextMonth=open;
    const currentMonthPaid=Number((await query(`select coalesce(sum(p.amount),0)::numeric total from invoice_payments p join quotes q on q.id=p.quote_id where q.organization_id=$1 and q.activity_id=$2 and q.document_type='invoice' and p.paid_at>=date_trunc('month',now())`,[org,aid])).rows[0]?.total||0);
    const accountingYear=new Date().getFullYear();const yearAccounting=await monthlyAccounting(org,aid,accountingYear);const monthHt=Number(yearAccounting.find(m=>{const d=new Date(m.month);return d.getFullYear()===accountingYear&&d.getMonth()===new Date().getMonth()})?.revenueHt||0);
    const forecast={month:currentMonthPaid,monthHt,month1:nextMonth,months3:nextMonth+historicalAverage*2,months6:nextMonth+historicalAverage*5,year:currentMonthPaid+nextMonth+historicalAverage*10,monthlyAverage:historicalAverage,historyMonths,method:`Prévision = devis ouverts + tendance moyenne des encaissements sur ${historyMonths} mois. Les devis annulés sont exclus; les SAV financiers sont comptabilisés séparément.`};
    const warr=(await query(`select count(*)::int n,min(ends_at) next_end from warranties where organization_id=$1 and ends_at>now()`,[org])).rows[0];
    const appointments=(await query(`select title,starts_at,client_id from appointments where organization_id=$1 and activity_id=$2 and starts_at>now() order by starts_at asc limit 5`,[org,aid])).rows;
    const clientIds=appointments.map((a:any)=>a.client_id).filter(Boolean);
    const clientsById=new Map<string,string>();
    const sub=(await query('select trial_ends_at,current_period_end from subscriptions where organization_id=$1',[org])).rows[0]||null;
    if(clientIds.length){
      const cr=await query(`select id,name from clients where organization_id=$1 and id=any($2::uuid[])`,[org,clientIds]);
      for(const c of cr.rows)clientsById.set(c.id,c.name);
    }
    const trialDaysLeft=sub?.trial_ends_at?Math.max(0,Math.ceil((new Date(sub.trial_ends_at).getTime()-Date.now())/86400000)):0;
    const journal:any[]=[];
    if(trialDaysLeft>0)journal.push({kind:'trial',severity:'yellow',sortAt:sub?.trial_ends_at||null,title:'Période d’essai',detail:`${trialDaysLeft} jour${trialDaysLeft>1?'s':''} restant${trialDaysLeft>1?'s':''}`});
    if(Number(u.rows[0]?.n||0)>0)journal.push({kind:'unpaid',severity:'red',sortAt:u.rows[0]?.first_date||null,title:'Factures en attente',detail:`${Number(u.rows[0]?.n||0)} facture${Number(u.rows[0]?.n||0)>1?'s':''} · ${Number(u.rows[0]?.total||0).toFixed(2)} €`});
    if(warr?.next_end)journal.push({kind:'warranty',severity:'yellow',sortAt:warr.next_end,title:'Garantie à surveiller',detail:`Échéance ${new Date(warr.next_end).toLocaleDateString('fr-FR')}`});
    if(Number(r4.rows[0]?.n||0)>0)journal.push({kind:'reminder',severity:'red',sortAt:r4.rows[0]?.first_date||null,title:'Relance urgente',detail:'Une facture nécessite une 4e relance.'});
    if(sub?.current_period_end)journal.push({kind:'subscription',severity:'yellow',sortAt:sub.current_period_end,title:'Abonnement',detail:`Échéance ${new Date(sub.current_period_end).toLocaleDateString('fr-FR')}`});
    for(const a of appointments)journal.push({kind:'appointment',severity:'yellow',sortAt:a.starts_at,title:`Rendez-vous · ${a.title||'Sans titre'}`,detail:`${new Date(a.starts_at).toLocaleString('fr-FR')}${a.client_id&&clientsById.has(a.client_id)?` · ${clientsById.get(a.client_id)}`:''}`});
    let mailReady=false;
    try{mailReady=await mailConfigured(org)}catch{mailReady=false}
    if(!mailReady)journal.push({kind:'mail',severity:'yellow',sortAt:null,title:'Messagerie',detail:'Connectez votre messagerie (une seule fois) pour envoyer vos devis et factures et mettre votre agenda à jour.',action:'settings'});
    journal.sort((a:any,b:any)=>{const rank=(x:any)=>x.severity==='red'?0:1;const pr=rank(a)-rank(b);if(pr!==0)return pr;const at=a.sortAt?new Date(a.sortAt).getTime():Number.POSITIVE_INFINITY;const bt=b.sortAt?new Date(b.sortAt).getTime():Number.POSITIVE_INFINITY;return at-bt;});
    return {tickets:Number(t.rows[0]?.n||0),unpaidCount:Number(u.rows[0]?.n||0),unpaidTotal:Number(u.rows[0]?.total||0),forecastEntries:open,fourthReminderCount:Number(r4.rows[0]?.n||0),forecast,subscription:sub,warranty:{count:Number(warr?.n||0),nextEnd:warr?.next_end||null},trialDaysLeft,journal};
  });
  app.get('/accounting/summary',async r=>{
    const aid=await ensureActivity(r,activityId(r));
    const year=Number((r.query as any)?.year)||new Date().getFullYear();const org=r.auth!.organizationId;
    const months=await monthlyAccounting(org,aid!,year);
    const totals=months.reduce((t,m)=>({revenue_ht:t.revenue_ht+m.revenueHt,vat:t.vat+m.vat,purchases:t.purchases+m.purchases,purchase_vat:t.purchase_vat+(m.purchaseVat||0),social:t.social+m.social,mileage_total:t.mileage_total+Number(m.mileage||0)}),{revenue_ht:0,vat:0,purchases:0,purchase_vat:0,social:0,mileage_total:0});
    const count=Number((await query(`select count(distinct q.id)::int n from quotes q join invoice_payments p on p.quote_id=q.id where q.organization_id=$1 and q.activity_id=$2 and q.document_type='invoice' and p.paid_at>=make_date($3,1,1) and p.paid_at<make_date($3+1,1,1)`,[org,aid,year])).rows[0]?.n||0);
    const invoices={...totals,count};
    return{year,months:months.map(m=>({month:m.month,revenue:m.revenueHt,purchases:m.purchases,social:m.social,mileage:m.mileage,vat:m.vat,invoiceCount:m.invoiceCount})),invoices};
  });
  app.get('/treasury/summary',async r=>{
    const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));
    if(!aid)return {forecastEntries:0,forecastOutputs:0,forecastNet:0,expenses:0,rows:[]};
    const rows=(await query(`select q.id,q.number,q.document_type,q.status,q.created_at,q.total_ttc,q.part_cost,q.shipping_cost,q.mileage_km,q.mileage_total,q.mileage_mode,q.mileage_internal_rate,q.labor_internal_cost_ht,q.urssaf_rate,q.contribution_snapshot,q.vat_rate,q.purchase_vat_mode,q.purchase_vat_rate,q.coefficient_basis,q.coefficient_unit,q.coefficient_value,q.part_coefficient_percent,coalesce((select sum(i.quantity) from quote_items i where i.quote_id=q.id),1)::numeric part_quantity from quotes q where q.organization_id=$1 and q.activity_id=$2 and ((q.document_type='quote' and q.status<>'canceled') or (q.document_type='invoice' and q.payment_status<>'paid')) order by q.created_at desc`,[org,aid])).rows;
    const savTotal=Number((await query(`select coalesce(sum(amount_ttc),0)::numeric total from sav_cases where organization_id=$1 and activity_id=$2`,[org,aid])).rows[0]?.total||0);
    const forecastIn=rows.filter((x:any)=>x.document_type==='quote').reduce((n,x)=>n+Number(x.total_ttc||0),0);
    const forecastOut=rows.reduce((n,x)=>{
      const mileageCost=x.mileage_mode==='margin'
        ?(Number(x.mileage_internal_rate||0)>0
          ?Number(x.mileage_km||0)*Number(x.mileage_internal_rate||0)
          :Number(x.mileage_total||0))
        :0;
      const coefficientMarkup=String(x.coefficient_basis||'purchase')==='purchase'?(String(x.coefficient_unit||'percent')==='euro'?Number(x.coefficient_value||0)*Math.max(1,Number(x.part_quantity||1)):Number(x.part_cost||0)*Number(x.coefficient_value??x.part_coefficient_percent??0)/100):0;const p=Number(x.part_cost||0)+coefficientMarkup+Number(x.shipping_cost||0)+Number(x.labor_internal_cost_ht||0)+mileageCost;
      const purchaseVatRate=x.purchase_vat_mode==='exempt'?0:(x.purchase_vat_rate!=null?Number(x.purchase_vat_rate):Number(x.vat_rate||0));const vat=p*purchaseVatRate/100;const caHt=Number(x.total_ttc||0)/(1+Number(x.vat_rate||0)/100);const rates=Array.isArray(x.contribution_snapshot)?x.contribution_snapshot.filter((c:any)=>String(c?.basis||'ca_ht')==='ca_ht').reduce((t:any,c:any)=>t+Number(c?.rate||0),0):Number(x.urssaf_rate||0);const social=caHt*rates/100;return n+p+vat+social},0);
    const forecastExpenses=rows.reduce((n,x)=>{const coefficientMarkup=String(x.coefficient_basis||'purchase')==='purchase'?(String(x.coefficient_unit||'percent')==='euro'?Number(x.coefficient_value||0)*Math.max(1,Number(x.part_quantity||1)):Number(x.part_cost||0)*Number(x.coefficient_value??x.part_coefficient_percent??0)/100):0;return n+Number(x.part_cost||0)+coefficientMarkup+Number(x.shipping_cost||0)+Number(x.labor_internal_cost_ht||0)},0);
    return {forecastEntries:forecastIn+savTotal,forecastOutputs:forecastOut,forecastNet:forecastIn+savTotal-forecastOut,expenses:forecastExpenses,savDeduction:savTotal,rows};
  });
  app.get('/accounting/report.csv',async(r,reply)=>{
    const aid=await ensureActivity(r,activityId(r));if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    const year=Number((r.query as any)?.year)||new Date().getFullYear();
    const buffer=await accountingReportCsv(r.auth!.organizationId,aid,year);
    return reply.header('Content-Type','text/csv; charset=utf-8').header('Cache-Control','no-store').header('Content-Disposition',`attachment; filename="export-comptable-${year}.csv"`).send(buffer);
  });

}
