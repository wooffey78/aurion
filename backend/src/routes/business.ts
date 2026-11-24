import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, db, beginTenant, withTenant, sqlExecutor, adminQuery as platformAdminQuery } from '../db.js';
import crypto from 'node:crypto';
import { renderDocument } from '../services/document-renderer.js';
import { readFile, unlink } from 'node:fs/promises';
import { profileFor, defaultCgvFor, listProfiles, PROFILE_CODES } from '../services/profiles.js';
import { computePricing } from '../services/pricing.js';
import { AurionError } from '../services/errors.js';
import { sendOrgMail, mailConfigured } from '../services/mail.js';
import { loadAppointment, syncAppointment } from '../services/calendar.js';
import { clientSummary } from '../services/clients.js';
import { monthlyAccounting } from '../services/accounting.js';
import { documentForecastEntries } from '../services/document-forecast.js';
import { accountingReportCsv } from '../services/accounting-report.js';
import { signatureForEmail, emailBodyHtml } from '../services/signature.js';
import { lookupFrenchCompany, searchFrenchCompaniesByName, normalizeSiret, normalizeSiren } from '../services/public-registry.js';
import { savePrivateUpload, readPrivateObject, deletePrivateObject } from '../services/storage.js';
import { buildStructuredInvoice } from '../services/electronic-invoice.js';
import { detectFiscalSettings, detectLegalFormFromProfile, isOwnerLegalFormAllowed, OWNER_LEGAL_FORM_REFUSAL, OWNER_LEGAL_FORMS } from '../services/fiscal-detection.js';
import { MICRO_CATEGORIES, MICRO_CATEGORY_CODES, loadReferentialVersions, referentialForDate, splitByCategory, categoryAccounting, normalizeCategoryInput, BUILTIN_REFERENTIAL_2026 } from '../services/micro-referential.js';
import { proposeCategoryFromNaf, proposeProfileFromNaf, proposeProfilesFromSignals } from '../services/micro-detection.js';
import { urssafDeadlines, thresholdStatuses, recordThresholdAlerts, recordUpcomingFiscalDeadlines, loadThresholdsRef, type MicroCategoryForThreshold } from '../services/fiscal-calendar.js';
import { profileCatalogStatus, PROFILE_CATALOG_VERSION } from '../services/profile-catalog.js';
import { buildFec, revenueBookCsv, simplifiedLedgerCsv, contributionsTableCsv, revenueJournal, purchasesJournal } from '../services/accounting-export.js';
import { allocateInstallmentPayments, buildInstallmentPlan, calculateInvoicePayment, calculateReminderPenalty, isValidDateOnly, normalizePaymentDate, reminderTotal } from '../services/invoice-workflow.js';
import { createStockMovement, releaseQuoteReservations, releaseAppointmentReservations, StockError } from '../services/stock.js';
import { publishInTransaction } from '../services/events-outbox.js';
import { seedCatalogFromProfile, emitCatalogEnrichedEvent } from '../services/catalog-detection.js';
import { paymentsConfigured } from '../services/payments/index.js';
import { config } from '../config.js';
import { createInvoiceWarranty } from '../services/warranty.js';
import { syncPrimaryActivityFromOrganization } from '../services/configuration-sync.js';
import type { PenaltyMode } from '../services/invoice-workflow.js';
// 15.4.51/53 — branchements d'émission (PROMPT B1/B2/B3 + C2) : fiabilité client, garde-fou de
// dérive, chaîne d'intégrité à l'émission et porte des mentions obligatoires.
import { clientReliability } from '../services/payment-reliability.js';
import { detectDeviation, type DeviationRubric } from '../services/deviation-guard.js';
import { computeMentions } from '../services/mentions.js';
import { blockingMentionGaps, mentionReminders } from '../services/mention-gate.js';
import { canonicalInvoiceContent, sha256Hex, recordDocumentIntegrity } from '../services/integrity-chain.js';
import { companyDisplayName } from '../services/company.js';

type QuoteItem={label:string;quantity:number;unitCost:number;unitPrice?:number|null;partId:string|null;saleCoefficientPercent?:number|null;activityCategory?:string|null};
type SqlExecutor={query:(text:string,values?:unknown[])=>Promise<any>};
const numericInput = z.union([z.number().finite(), z.string().max(80), z.null()]).optional();
const optionalUuid = z.union([z.string().uuid(), z.literal(''), z.null()]).optional();
const quoteLineInputSchema = z.object({
  label: z.string().max(500).optional(), name: z.string().max(500).optional(),
  quantity: numericInput, unitCost: numericInput, unitPrice: numericInput,
  partId: optionalUuid, saleCoefficientPercent: numericInput,
  // Bloc 8 — catégorie d'activité de la ligne (activité mixte) : vide = non renseigné,
  // valeur inconnue refusée explicitement (normalizeCategoryInput).
  activityCategory: z.string().max(30).nullable().optional(),
}).passthrough();
const forecastAssumptionsInputSchema = z.object({
  potentialClientsPerMonth: z.number().int().min(0).max(10000),
  averageTicketTtc: z.number().finite().min(0).max(1000000),
  variableCostPerRepair: z.number().finite().min(0).max(1000000),
  fixedMonthlyCosts: z.number().finite().min(0).max(10000000),
  reservePercent: z.number().finite().min(0).max(100),
}).strict();
const clientCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(240),
  email: z.string().trim().email().max(254).or(z.literal('')).nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  interventionAddress: z.string().max(1000).nullable().optional(),
  siret: z.string().max(40).nullable().optional(),
  estimatedMinutes: numericInput,
  activityId: optionalUuid,
  // Bloc 5 — classification e-reporting déclarée par l'utilisateur (jamais déduite) :
  // catégorie d'acheteur, code pays ISO 3166-1 alpha-2 et numéro de TVA intracommunautaire
  // (ou identifiant fiscal étranger). Valeur vide = non renseigné (la matrice signale un écart).
  buyerCategory: z.string().max(20).nullable().optional(),
  countryCode: z.string().max(2).nullable().optional(),
  vatNumber: z.string().max(32).nullable().optional(),
}).passthrough();
const clientPatchInputSchema = z.object({
  baseUpdatedAt: z.string().max(40).optional(), // Bloc 5 — base de concurrence optimiste (présence = contrôle actif)
  name: z.string().trim().min(1).max(240).optional(),
  email: z.string().trim().email().max(254).or(z.literal('')).nullable().optional(),
  phone: z.string().max(80).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  interventionAddress: z.string().max(1000).nullable().optional(),
  siret: z.string().max(40).nullable().optional(),
  estimatedMinutes: numericInput,
  activityId: optionalUuid,
  buyerCategory: z.string().max(20).nullable().optional(),
  countryCode: z.string().max(2).nullable().optional(),
  vatNumber: z.string().max(32).nullable().optional(),
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
  activityCategory: z.string().max(30).nullable().optional(),
  model: z.string().max(160).nullable().optional(),
  variant: z.string().max(160).nullable().optional(),
  color: z.string().max(100).nullable().optional(),
  quality: z.string().max(100).nullable().optional(),
  reference: z.string().max(160).nullable().optional(),
  stock: stockInput,
  sellingPrice: numericInput,
  saleCoefficientPercent: numericInput,
  // Bloc 10 — attributs de réapprovisionnement : unité, seuil d'alerte, emplacement de rangement.
  unit: z.string().max(20).nullable().optional(),
  minStockThreshold: numericInput,
  storageLocation: z.string().max(160).nullable().optional(),
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
const supplierPatchInputSchema = supplierCreateInputSchema.partial().extend({ baseUpdatedAt: z.string().max(40).optional() }); // Bloc 5

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
const interventionCreateInputSchema = z.object({
  activityId: optionalUuid,
  name: z.string().trim().min(1).max(240),
  description: z.string().max(4000).nullable().optional(),
  durationMinutes: numericInput,
  defaultPrice: numericInput,
  activityCategory: z.string().max(30).nullable().optional(),
}).passthrough();
const interventionPatchInputSchema = interventionCreateInputSchema.partial();
const deviceCreateInputSchema = z.object({
  activityId: optionalUuid,
  clientId: z.string().uuid(),
  type: z.string().trim().min(1).max(80),
  brand: z.string().max(160).nullable().optional(),
  model: z.string().max(160).nullable().optional(),
  imei: z.string().max(80).nullable().optional(),
  serialNumber: z.string().max(160).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
}).passthrough();
const devicePatchInputSchema = deviceCreateInputSchema.omit({ activityId: true, clientId: true }).partial();
const warrantyPolicyCreateInputSchema = z.object({
  activityId: optionalUuid,
  name: z.string().trim().min(1).max(240),
  scopeType: z.enum(['parts','labor','both','activity']).optional(),
  scopeKey: z.string().max(160).nullable().optional(),
  durationMonths: numericInput,
}).passthrough();
const warrantyPolicyPatchInputSchema = warrantyPolicyCreateInputSchema.omit({ activityId: true }).partial();



const quoteCreateInputSchema = z.object({
  clientId: optionalUuid, activityId: optionalUuid, intervention: z.string().max(240).optional(),
  // Bloc 8 — catégorie d'activité par défaut du document (chaque ligne peut la redéfinir).
  activityCategory: z.string().max(30).nullable().optional(),
  documentType: z.enum(['quote','invoice']).optional(), imei: z.string().max(80).nullable().optional(), serialNumber: z.string().max(160).nullable().optional(), items: z.array(quoteLineInputSchema).max(500).nullable().optional(),
  currentItems: z.array(quoteLineInputSchema).max(500).nullable().optional(),
  vatRate: numericInput, urssafRate: numericInput, shippingCost: numericInput, purchaseVatRate: numericInput,
  reminderIntervalDays: numericInput, latePenaltyValue: numericInput, mileageKm: numericInput,
  mileageRate: numericInput, mileageInternalRate: numericInput, mileageClientRate: numericInput,
  coefficientValue: numericInput, laborSellingHt: numericInput, laborInternalCostHt: numericInput,
  finalPriceTtc: numericInput, partCost: numericInput, partQuantity: numericInput,
  allowLoss: z.boolean().optional(), catalogPricing: z.boolean().optional(), sendEmail: z.boolean().optional(),
  invoiceAddressSource: z.enum(['client','intervention','free']).optional(), billingAddress: z.string().max(1000).optional(),
  contributions: z.array(z.object({ name: z.string().max(160).optional(), rate: numericInput, basis: z.string().max(120).optional(), mandatory: z.boolean().optional(), variable: z.boolean().optional() }).passthrough()).max(100).optional(),
  // Bloc 4 — mentions électroniques du 1er septembre 2026 (factures) : catégorie d'opération
  // (BT-23 : LB biens / PS services / LBPS mixte), SIREN du client, option TVA sur les débits
  // (le cas échéant) et adresse de livraison si différente de la facturation.
  einvoiceOperationCategory: z.string().max(8).nullable().optional(),
  // Bloc 11 — création directe SANS client préexistant : la fiche client est créée avec le
  // document DANS LA MÊME TRANSACTION (annulation = aucune création partielle). Seules les
  // coordonnées disponibles sont enregistrées — jamais une donnée inventée.
  newClient: z.object({
    name: z.string().trim().min(1).max(240),
    email: z.string().trim().email().max(254).or(z.literal('')).nullable().optional(),
    phone: z.string().max(80).nullable().optional(),
    address: z.string().max(1000).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    siret: z.string().max(40).nullable().optional(),
    interventionAddress: z.string().max(1000).nullable().optional(),
  }).passthrough().nullable().optional(),
  einvoiceBuyerSiren: z.string().max(40).nullable().optional(),
  einvoiceVatOnPayment: z.boolean().nullable().optional(),
  einvoiceDeliveryAddress: z.string().max(500).nullable().optional(),
  // Bloc 5 — exonération e-reporting déclarée sur la facture (instantané du document historique) :
  // motif obligatoire lorsque l'exonération est déclarée (export, LIC, art. 261 à 261 E du CGI…).
  ereportingExempt: z.boolean().nullable().optional(),
  ereportingExemptReason: z.string().max(200).nullable().optional(),
}).passthrough();
const quotePatchInputSchema = quoteCreateInputSchema.partial();
const invoiceConversionInputSchema = z.object({
  dueAt: z.string().max(40).optional(), reminderIntervalDays: numericInput,
  invoiceAddressSource: z.enum(['client','intervention','free']).optional(), billingAddress: z.string().max(1000).optional(),
  sendEmail: z.boolean().optional(),
  // 15.4.51 (PROMPT B2) — rubriques comparées et justification du garde-fou de dérive :
  // l'interface transmet les rubriques devis/facture qu'elle affiche ; le serveur recalcule la
  // dérive lui-même (source de vérité) et exige une justification au-delà du seuil documenté.
  quoteRubrics: z.array(z.object({ label: z.string().max(160), amountHt: z.number() })).max(300).optional(),
  invoiceRubrics: z.array(z.object({ label: z.string().max(160), amountHt: z.number() })).max(300).optional(),
  deviationJustification: z.string().max(1000).optional(),
}).passthrough();
const invoicePaymentInputSchema = z.object({
  amount: numericInput, paymentMethod: z.enum(['transfer','card','cash','cheque','crypto']).optional(),
  paidAt: z.string().max(40).optional(), reference: z.string().max(160).optional(), note: z.string().max(2000).optional(),
}).passthrough();
const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
// Bloc 4 — normalisation des mentions électroniques (jamais de valeur inventée : un champ
// invalide est refusé explicitement, laissable vide hors factures électroniques).
function einvoiceCategoryInput(v:any):string|null{
  if(v===undefined||v===null||v==='')return null;
  const s=String(v).trim().toUpperCase();
  if(!['LB','PS','LBPS'].includes(s))throw new AurionError('INVALID_INPUT','Catégorie de l’opération électronique invalide (LB : livraison de biens, PS : prestation de services, LBPS : mixte).');
  return s;
}
function einvoiceSirenInput(v:any):string|null{
  if(v===undefined||v===null||v==='')return null;
  const s=String(v).replace(/[\s.]/g,'');
  if(!/^\d{9}$/.test(s))throw new AurionError('INVALID_INPUT','Le SIREN du client doit comporter exactement 9 chiffres (mention électronique obligatoire).');
  return s;
}
// Bloc 5 — normalisation des déclarations e-reporting (jamais de valeur inventée : un champ
// invalide est refusé explicitement ; vide = non renseigné, la matrice signale alors un écart).
const BUYER_CATEGORY_VALUES=['assujetti_fr','assujetti_etranger','non_assujetti'] as const;
function buyerCategoryInput(v:any):string|null{
  if(v===undefined||v===null||v==='')return null;
  const s=String(v).trim().toLowerCase();
  if(!BUYER_CATEGORY_VALUES.includes(s as any))throw new AurionError('INVALID_INPUT','Catégorie d\'acheteur invalide (assujetti_fr : assujetti établi en France, assujetti_etranger : assujetti non établi en France, non_assujetti : particulier ou non-assujetti).');
  return s;
}
function countryCodeInput(v:any):string|null{
  if(v===undefined||v===null||v==='')return null;
  const s=String(v).trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(s))throw new AurionError('INVALID_INPUT','Le code pays doit comporter deux lettres (ISO 3166-1 alpha-2, ex. FR, DE, BE).');
  return s;
}
function vatNumberInput(v:any):string|null{
  if(v===undefined||v===null||v==='')return null;
  const s=String(v).trim().toUpperCase();
  if(!/^[A-Z0-9]{4,32}$/.test(s))throw new AurionError('INVALID_INPUT','Le numéro de TVA intracommunautaire (ou identifiant fiscal étranger) doit comporter de 4 à 32 caractères alphanumériques.');
  return s;
}
function ereportingExemptReasonInput(exempt:boolean,v:any):string|null{
  const s=(v===undefined||v===null?'':String(v)).trim().slice(0,200)||null;
  if(exempt&&(!s||!s.length))throw new AurionError('INVALID_INPUT','Le motif d\'exonération e-reporting est obligatoire lorsque l\'exonération est déclarée (export, livraison intracommunautaire, article 261 à 261 E du CGI…).');
  return s;
}
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
    saleCoefficientPercent:x?.saleCoefficientPercent===null||x?.saleCoefficientPercent===undefined||x?.saleCoefficientPercent===''?null:Number(String(x.saleCoefficientPercent).replace(',','.')),
    // Bloc 8 — catégorie d'activité de la ligne (activité mixte) : conservée telle quelle,
    // validée par normalizeCategoryInput en amont (vide = non renseigné).
    activityCategory:x?.activityCategory===null||x?.activityCategory===undefined||x?.activityCategory===''?null:String(x.activityCategory)
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
    await beginTenant(client);
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
// Bloc 11 — verrou de période clôturée : aucune écriture comptable métier nouvelle (paiement,
// SAV financier, correction) sur une année clôturée. La clôture reste réversible par une action
// humaine explicite (rouverture), jamais contournée silencieusement.
async function assertPeriodOpen(org:string,date:Date,client?:SqlExecutor):Promise<void>{
  const exec=client??{query:(text:string,values?:unknown[])=>query(text,values)};
  const year=date.getUTCFullYear();
  const row=(await exec.query(`select 1 from accounting_closed_periods where organization_id=$1 and period_year=$2 and reopened_at is null`,[org,year])).rows[0];
  if(row)throw new AurionError('PERIOD_CLOSED',`L'exercice ${year} est clôturé : enregistrez le règlement sur la période en cours ou rouvrez explicitement la période.`,409);
}
/** Vérifie qu'un règlement n'est pas rapproché avant correction (garde applicative bloc 11). */
async function paymentReconciled(org:string,paymentId:string):Promise<boolean>{
  return Boolean((await query(`select 1 from bank_transactions where matched_payment_id=$1 and organization_id=$2 limit 1`,[paymentId,org])).rowCount);
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
    await executor.query('insert into quote_items(quote_id,position,label,quantity,unit_cost,part_id,sale_coefficient_percent,unit_price,photo_key,activity_category) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[quoteId,position,item.label,item.quantity,item.unitCost,item.partId,coefficient,unitPrice,part?.photo_key||null,item.activityCategory?String(item.activityCategory):null]);
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
// Bloc 11 — fiche client créée AVEC le document (même transaction, jamais partielle).
function composeClientAddress(nc:any){
  const line=[String(nc?.address||'').trim(),[String(nc?.postalCode||'').trim(),String(nc?.city||'').trim()].filter(Boolean).join(' ')].filter(Boolean);
  return line.join('\n')||null;
}
async function createClientForDocument(executor:SqlExecutor,org:string,aid:string,nc:any){
  const id=crypto.randomUUID();
  const address=composeClientAddress(nc);
  await executor.query(
    `insert into clients(id,organization_id,activity_id,name,email,phone,address,intervention_address,siret) values($1,$2,$3,$4,nullif($5,''),nullif($6,''),$7,nullif($8,''),nullif($9,''))`,
    [id,org,aid,String(nc.name).trim(),String(nc.email||'').trim(),String(nc.phone||'').trim(),address,String(nc.interventionAddress||'').trim(),String(nc.siret||'').replace(/\s/g,'')],
  );
  return id;
}
// Bloc 10 — marges d'alerte configurables (défaut 80/90/100 %) lues dans configuration_data.
async function fiscalAlertMargins(orgId:string){
  const row=(await query('select configuration_data from organizations where id=$1',[orgId])).rows[0];
  const m=(row?.configuration_data||{}).fiscalAlertMargins;
  return Array.isArray(m)&&m.length?m.map(Number).filter(Number.isFinite).sort((a,b)=>a-b):[0.8,0.9,1];
}
// Bloc 9 — situation fiscale DÉCLARÉE : versement libératoire et périodicité URSSAF.
// Distinction explicite entre éligibilité théorique (règle impots.gouv), option effectivement
// exercée (déclarée par l'utilisateur) et information non vérifiée (aucune source extérieure,
// jamais déduite du SIRET). Aucune valeur n'est inventée : « inconnu » est la valeur par défaut.
async function orgFiscalOptions(orgId:string){
  const row=(await query('select vl_option,vl_verified,vl_effective_from,urssaf_periodicity,urssaf_periodicity_effective_from from organizations where id=$1',[orgId])).rows[0]||{};
  const vl=String(row.vl_option||'inconnu');
  return {
    vlOption:vl,
    vlVerified:Boolean(row.vl_verified),
    vlEffectiveFrom:row.vl_effective_from?String(row.vl_effective_from).slice(0,10):null,
    vlEligibilityNote: vl==='oui'
      ? (row.vl_verified?'Option déclarée comme effectivement exercée (confirmée par vous).':'Option déclarée exercée mais NON vérifiée auprès d’une source officielle.')
      : vl==='non'
        ? 'Option déclarée non exercée. Éligibilité théorique (impots.gouv) : pour en bénéficier en 2026, le revenu fiscal de référence 2024 ne devait pas excéder 29 315 € par part — vérifiez auprès de votre service des impôts.'
        : 'Option inconnue : aucune déclaration enregistrée. Aurion ne déduit JAMAIS cette option du SIRET.',
    urssafPeriodicity:row.urssaf_periodicity||null,
    urssafPeriodicityEffectiveFrom:row.urssaf_periodicity_effective_from?String(row.urssaf_periodicity_effective_from).slice(0,10):null,
  };
}
// Bloc 8 — instantané du référentiel appliqué au document (version, source, catégories réellement
// utilisées) : rend les calculs historiques reproductibles et rend visible toute catégorie « non renseignée ».
function buildCategorySnapshot(aid:string,items:QuoteItem[],docCategory:string|null){
  const lines=items.map(i=>({amountHt:i.quantity*Number(i.unitPrice??(i.unitCost||0)),category:i.activityCategory}));
  const split=splitByCategory(lines,docCategory,[BUILTIN_REFERENTIAL_2026],new Date().toISOString().slice(0,10));
  return {version:split.version,effectiveFrom:split.effectiveFrom,source:split.source,activityId:aid,docCategory:docCategory||null,categories:split.rows.map(r=>({category:r.category,caHt:r.caHt}))};
}
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
  // Prompt 03 — remise TTC traçable : déduite du prix cible par le moteur (l'instantané du
  // document conserve listPriceTtc et discountTtc via le résultat complet).
  const discountTtc=optionalNumber(effective('discountTtc','discount_ttc'),'Remise TTC',0,1e9)??0;
  const p=computePricing({
    partCost:rawPart,
    partQuantity,
    shippingCost,
    consumablesCostHt:optionalNumber(effective('consumablesCostHt','consumables_cost_ht'),'Consommables',0,1e9)??0,
    discountTtc,
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
async function nextNumber(org:string,prefix:string,executor:SqlExecutor={query}){
  const year=new Date().getFullYear();
  const prefixes=prefix==='FAC'?[`FAC-${year}-%`,`FA-${year}-%`]:[`${prefix}-${year}-%`];
  const r=await executor.query(
    `with existing as (
       select coalesce(max(substring(number from '([0-9]+)$')::bigint),0)+1 next_value
         from quotes where organization_id=$1 and number like any($4::text[])
     ), allocated as (
       insert into document_number_sequences(organization_id,prefix,year,last_value)
       select $1::uuid,$2::varchar(10),$3::integer,next_value from existing
       on conflict(organization_id,prefix,year) do update
         set last_value=greatest(document_number_sequences.last_value+1,excluded.last_value),updated_at=now()
       returning last_value
     ) select last_value from allocated`,
    [org,prefix,year,prefixes],
  );
  return `${prefix}-${year}-${String(r.rows[0].last_value).padStart(4,'0')}`;
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
    const d=await renderDocument(org,id,type);const pdf=await readPrivateObject(d.keys.pdf);const label=type==='invoice'?'facture':'devis';const body=`Bonjour ${c.name||''},\n\nVeuillez trouver votre ${label} ${number} en pièce jointe.`;const sig=await signatureForEmail(org,d.row.activity_id,type);
    await sendOrgMail(org,{to:c.email,subject:`${type==='invoice'?'Facture':'Devis'} ${number}`,text:body+sig.text,html:emailBodyHtml(body,sig.html),attachments:[...(sig.inlineAttachments||[]),{filename:`${number}.pdf`,content:pdf}]});
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
async function saveActivityProfileOverride(org:string,activityId:string,profileCode:string,origin:'confirmed'|'manual'='manual',chosenFrom:string|null=null){
  // V2 — écriture de la sélection retenue : appelée UNIQUEMENT depuis une action
  // utilisateur explicite (création avec profil choisi, mise à jour avec profil choisi,
  // route profile-choice). Aucune détection automatique n'appelle ce helper : c'est
  // l'invariant de conservation des choix manuels, démontré par contrat (balayage des
  // routes). L'origine du choix est conservée et journalisée ('confirmed' si la
  // sélection confirme une proposition du moteur, 'manual' sinon).
  if(!PROFILE_CODES.includes(profileCode))throw new Error('INVALID_ACTIVITY_PROFILE');
  // Non-régression de l'origine (V2) : ré-enregistrer ou re-confirmer le MÊME métier ne
  // rétrograde jamais l'origine ni la date de décision ('confirmed' reste confirmé) ;
  // choisir un métier DIFFÉRENT crée une nouvelle décision (origine demandée, datée).
  // Prompt 02 — la décision référence la version du catalogue en vigueur à la décision
  // (104) ; les décisions antérieures à 15.4.49 conservent NULL (aucune réécriture).
  await query(`insert into activity_profile_overrides(activity_id,profile_code,origin,chosen_from_proposal,chosen_at,profile_version)
    select id,$3,$4,$5,now(),$6::varchar from activities where id=$1 and organization_id=$2
    on conflict(activity_id) do update set
      profile_code=excluded.profile_code,
      origin=case when activity_profile_overrides.profile_code=excluded.profile_code
                   and activity_profile_overrides.origin in ('confirmed','manual')
                   and excluded.origin='manual'
                  then activity_profile_overrides.origin else excluded.origin end,
      chosen_from_proposal=case when activity_profile_overrides.profile_code=excluded.profile_code
                   and activity_profile_overrides.origin in ('confirmed','manual')
                   and excluded.origin='manual'
                  then activity_profile_overrides.chosen_from_proposal else excluded.chosen_from_proposal end,
      chosen_at=case when activity_profile_overrides.profile_code=excluded.profile_code
                   and activity_profile_overrides.origin in ('confirmed','manual')
                   and excluded.origin='manual'
                  then activity_profile_overrides.chosen_at else now() end,
      profile_version=excluded.profile_version,
      updated_at=now()`,[activityId,org,profileCode,origin,chosenFrom,PROFILE_CATALOG_VERSION.version]);
  // Journal du choix (correctif 15.4.45, trouvé par la recette navigateur) : les colonnes
  // étaient échangées (organization_id recevait l'id d'activité → violation de la clé
  // étrangère 094) et $4 était inférable dans aucun type (jsonb_build_object). L'échec
  // arrivait APRÈS l'upsert : l'origine était persistée mais la requête échouait et le
  // journal perdait l'événement de choix.
  await query(`insert into profile_proposal_events(organization_id,activity_id,kind,profile_code,proposal)
    select $2,id,case when $3::text='confirmed' then 'confirmed' else 'manual_change' end,$4::text,jsonb_build_object('profile',$4::text,'origin',$3::text,'chosenFrom',$5::text)
    from activities where id=$1 and organization_id=$2`,[activityId,org,origin,profileCode,chosenFrom]);
}

export async function businessRoutes(app:FastifyInstance){
  app.addHook('preHandler',app.requireAuth);
  app.get('/activities',async r=>{await syncPrimaryActivityFromOrganization(r.auth!.organizationId);return (await query(`select id,code,name,description,legal_form,cgv_text,active,urssaf_rate,vat_rate,configuration_defined,default_part_coefficient_percent,default_labor_coefficient_percent,payment_terms,insurance_info,mediator_info,legal_notes,quote_validity_days,margin_min_percent,social_regime,vat_regime,social_auto_detected,vat_auto_detected,(select profile_code from activity_profile_overrides o where o.activity_id=activities.id and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$1)) profile_code,(select origin from activity_profile_overrides o where o.activity_id=activities.id and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$1)) profile_origin,(select chosen_at from activity_profile_overrides o where o.activity_id=activities.id and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$1)) profile_chosen_at,(select chosen_from_proposal from activity_profile_overrides o where o.activity_id=activities.id and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$1)) profile_chosen_from,coalesce((select json_agg(json_build_object('name',ac.name,'rate',ac.rate,'basis',ac.basis,'mandatory',ac.mandatory,'variable',ac.variable,'source',ac.source) order by ac.position,ac.name) from activity_contributions ac where ac.activity_id=activities.id),'[]'::json) contributions from activities where organization_id=$1 order by active desc,name`,[r.auth!.organizationId])).rows});
  app.get('/profiles',async()=>listProfiles());
  // Prompt 02 — versionnage du catalogue : version en vigueur (code + table 104), provenance
  // et date d'effet, historique des versions connues. Les clients existants ignorent ces
  // champs ; aucune évolution du catalogue ne réécrit les décisions passées.
  app.get('/profiles/version',async()=>profileCatalogStatus());
  // Bloc 7 : le compte de l'entrepreneur est exclusivement une entreprise individuelle (micro ou réel).
  app.get('/legal-forms',async()=>OWNER_LEGAL_FORMS);
  // Bloc 8 — référentiel daté des taux micro par catégorie d'activité (lecture seule).
  app.get('/micro/referential',async(r,reply)=>{
  const versions=await loadReferentialVersions();const current=referentialForDate(versions,new Date().toISOString().slice(0,10));
  const body={version:current?.version||null,effectiveFrom:current?.effectiveFrom||null,effectiveTo:current?.effectiveTo||null,source:current?.source||null,verifiedOn:current?.verifiedOn||null,history:versions.map(v=>({version:v.version,effectiveFrom:v.effectiveFrom,effectiveTo:v.effectiveTo,source:v.source,verifiedOn:v.verifiedOn})),categories:MICRO_CATEGORY_CODES.map(c=>({code:c,label:MICRO_CATEGORIES[c]})),rates:current?.rates||[]};
  // Bloc 7 — référentiel daté versionné : le client peut vérifier la fraîcheur sans retélécharger.
  const etag='W/"'+crypto.createHash('sha256').update(String(body.version)+'|'+String((body.rates||[]).length)+'|'+String(body.history?.length??0)).digest('hex').slice(0,24)+'"';
  if((r.headers['if-none-match']||'')===etag)return reply.code(304).header('ETag',etag).send();
  return reply.header('ETag',etag).send(body);});
  // Bloc 8 — proposition de catégorie à partir du code APE/NAF (indiquée, jamais appliquée
  // silencieusement ; l'utilisateur applique ou ignore champ par champ).
  app.get('/micro/category-proposal',async r=>{const naf=String((r.query as any)?.naf||'');const proposal=proposeCategoryFromNaf(naf);if(!proposal)return {naf:naf,proposal:null,message:'Code APE/NAF non reconnu : renseignez la catégorie d\'activité manuellement.'};return {naf,proposal:{...proposal,categoryLabel:MICRO_CATEGORIES[proposal.category]}};});
  // Bloc 8 — comptabilité par catégorie d'activité (activité mixte) : CA HT, cotisations
  // (micro-social + CFP) et versement libératoire estimés avec la version du référentiel
  // en vigueur à la date de chaque facture. Impôt et cotisations restent distincts.
  app.get('/accounting/by-category',async r=>{const aid=await ensureActivity(r,activityId(r));const year=Number((r.query as any)?.year)||new Date().getFullYear();const fiscalOptions=await orgFiscalOptions(r.auth!.organizationId);if(!aid)return {year,categories:[],caHt:0,socialTotal:0,cfpTotal:0,contributionsTotal:0,taxTotal:0,unassignedHt:0,version:null,source:null,fiscalOptions};return {year,...await categoryAccounting(r.auth!.organizationId,aid,year),fiscalOptions};});
  // Bloc 10 — calendrier fiscal et alertes de seuils : échéances URSSAF (périodicité déclarée
  // au bloc 9) + seuils micro/franchise TVA avec alertes à 80/90/100 % (marges configurables).
  // Les alertes sont factuelles, inscrites une seule fois au journal de bord, ne bloquent
  // JAMAIS la facturation et n'envoient aucun e-mail sans consentement.
  app.get('/fiscal-calendar',async r=>{
    const org=r.auth!.organizationId;
    const year=Number((r.query as any)?.year)||new Date().getFullYear();
    const aid=await ensureActivity(r,activityId(r));
    const fiscal=await orgFiscalOptions(org);
    const byCat=aid?await categoryAccounting(org,aid,year):null;
    const caVent=byCat?.rows.filter(x=>['vente_bic','specific'].includes(String(x.category))).reduce((t,x)=>t+x.caHt,0)||0;
    const caServices=byCat?.rows.filter(x=>['services_bic','services_bnc','services_bnc_cipav'].includes(String(x.category))).reduce((t,x)=>t+x.caHt,0)||0;
    const marginsCfg=await fiscalAlertMargins(org);
    // Prompt 04 — seuils VERSIONNÉS : la version en vigueur à la date du jour est lue dans
    // regulatory_thresholds (105) avec repli déterministe sur les constantes documentées.
    const thresholds=await loadThresholdsRef(`${year}-12-31`);
    const statuses=thresholdStatuses([{kind:'vente' as MicroCategoryForThreshold,caHt:caVent},{kind:'services' as MicroCategoryForThreshold,caHt:caServices}],year,marginsCfg,thresholds);
    try{await recordThresholdAlerts(org,year,statuses)}catch(e:any){r.log.warn({err:String(e?.message||e)},'fiscal alerts journal skipped')}
    return {
      year,
      periodicity:fiscal.urssafPeriodicity,
      periodicityNote:fiscal.urssafPeriodicity?null:'Déclarez votre périodicité URSSAF (mensuelle ou trimestrielle) dans Paramètres → Entreprise : les échéances personnalisées apparaîtront ensuite.',
      deadlines:urssafDeadlines(year,(fiscal.urssafPeriodicity as any)||null),
      referential:{version:thresholds.version,verifiedOn:thresholds.verifiedOn,source:thresholds.source},
      thresholds:statuses,
      disclaimer:'Informations factuelles sans conseil fiscal. Pour toute question de régime ou d’option, consultez l’URSSAF, le portail autoentrepreneur ou votre expert-comptable.',
    };
  });
  app.put('/fiscal-calendar/margins',async(r,reply)=>{
    // Marges d'alerte configurables (persistées dans configuration_data, jamais une bascule de régime).
    const b:any=r.body||{};const margins=Array.isArray(b.margins)?(b.margins as any[]).map(x=>Number(x)).filter(x=>Number.isFinite(x)&&x>0&&x<=1).sort((a:number,b:number)=>a-b):null;
    if(!margins||!margins.length)return reply.code(400).send({error:'INVALID_INPUT',message:'Fournissez des marges entre 0 et 1 (ex. 0.8, 0.9, 1).'});
    await query("update organizations set configuration_data=jsonb_set(coalesce(configuration_data,'{}'::jsonb),'{fiscalAlertMargins}',$1::jsonb,true),updated_at=now() where id=$2",[JSON.stringify(margins),r.auth!.organizationId]);
    return {ok:true,margins};
  });
  // Bloc 14 — exports comptables : FEC officiel (18 champs), livre des recettes, journaux,
  // grand livre simplifié, tableau cotisations/TVA. Reproductibles : mêmes données + même
  // période = même contenu ; le rôle comptable (lecture seule) y a accès, journalisé (bloc 14).
  app.get('/accounting/fec',async(r,reply)=>{
    const aid=await ensureActivity(r,activityId(r));
    const year=Number((r.query as any)?.year)||new Date().getFullYear();
    const org=(await query('select siren from organizations where id=$1',[r.auth!.organizationId])).rows[0];
    const fec=await buildFec({orgId:r.auth!.organizationId,activityId:aid||null,year,siren:String(org?.siren||'')});
    if(fec.debitTotal!==fec.creditTotal)return reply.code(500).send({error:'FEC_UNBALANCED',message:'Équilibre débit/crédit rompu : export refusé (vérifiez les données).'});
    return reply.header('Content-Type','text/tab-separated-values; charset=utf-8').header('Content-Disposition',`attachment; filename="FEC_${String(org?.siren||'AURION')}_${year}.txt"`).send(fec.content);
  });
  app.get('/accounting/exports/:kind.csv',async(r,reply)=>{
    const kind=String((r.params as any).kind||'');
    const aid=await ensureActivity(r,activityId(r));
    const year=Number((r.query as any)?.year)||new Date().getFullYear();
    const org=(await query('select siren from organizations where id=$1',[r.auth!.organizationId])).rows[0];
    const fecOpts={orgId:r.auth!.organizationId,activityId:aid||null,year,siren:String(org?.siren||'')};
    let content:string,fileName:string;
    if(kind==='livre-recettes'){content=await revenueBookCsv(fecOpts.orgId,fecOpts.activityId,year);fileName=`livre-recettes-${year}.csv`;}
    else if(kind==='journal-ventes'){const rev=await revenueJournal(fecOpts.orgId,fecOpts.activityId,year);content=['Date;Facture;Client;SIRET client;Mode;HT;TVA;TTC'].concat(rev.map(x=>[x.date,x.invoice,x.client,x.clientSiret,x.method,x.ht.toFixed(2),x.vat.toFixed(2),x.amount.toFixed(2)].join(';'))).join('\n')+'\n';fileName=`journal-ventes-${year}.csv`;}
    else if(kind==='journal-achats'){const pur=await purchasesJournal(fecOpts.orgId,fecOpts.activityId,year);content=['Date;Type;Libellé;Montant'].concat(pur.map(x=>[x.date,x.type,x.label,x.amount.toFixed(2)].join(';'))).join('\n')+'\n';fileName=`journal-achats-${year}.csv`;}
    else if(kind==='grand-livre'){content=await simplifiedLedgerCsv(fecOpts);fileName=`grand-livre-${year}.csv`;}
    else if(kind==='cotisations-tva'){content=await contributionsTableCsv(fecOpts.orgId,fecOpts.activityId,year);fileName=`cotisations-tva-${year}.csv`;}
    else return reply.code(404).send({error:'NOT_FOUND',message:'Export inconnu : livre-recettes, journal-ventes, journal-achats, grand-livre, cotisations-tva.'});
    return reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition',`attachment; filename="${fileName}"`).send(content);
  });
  // Bloc 14 — rôle « expert-comptable » : invitation par le chef d'entreprise, lecture seule,
  // révocable, journalisée, limitée à l'organisation invitante (garde globale dans app.ts).
  app.post('/organization/accountant-invite',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(r,reply)=>{
    if(r.auth!.role!=='owner')return reply.code(403).send({error:'OWNER_ONLY',message:'Seul le chef d\'entreprise peut inviter un expert-comptable.'});
    const email=String((r.body as any)?.email||'').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return reply.code(400).send({error:'INVALID_EMAIL',message:'Indiquez un e-mail valide.'});
    const existing=(await query('select user_id from organization_members where organization_id=$1 and user_id=(select id from users where email=$2)',[r.auth!.organizationId,email])).rowCount;
    if(existing)return reply.code(409).send({error:'ALREADY_MEMBER',message:'Cet e-mail a déjà accès à l\'organisation.'});
    const inv=(await query(`insert into accountant_invitations(organization_id,email,invited_by) values($1,$2,$3)
      on conflict (organization_id,email) do update set token=gen_random_uuid(),invited_by=$3,expires_at=now()+interval '7 days',accepted_at=null,revoked_at=null returning id,token,expires_at`,
      [r.auth!.organizationId,email,r.auth!.userId])).rows[0];
    // Bloc 15 — livraison de l'invitation par e-mail (même mécanisme que les invités admin,
    // migration 087) : le jeton n'est plus exposé dans les listes ; sans messagerie configurée,
    // la transmission manuelle reste possible (statut honnête « skipped »).
    let emailStatus:'sent'|'failed'|'skipped'='skipped',emailError:string|null=null;
    try{
      if(await mailConfigured(r.auth!.organizationId)){
        const orgName=(await query('select name from organizations where id=$1',[r.auth!.organizationId])).rows[0]?.name||'votre organisation';
        const body=`Bonjour,\n\nVous êtes invité(e) comme expert-comptable sur Aurion pour « ${orgName} ».\n\nPour accepter : connectez-vous à Aurion avec l'adresse ${email}, puis validez le jeton d'invitation suivant :\n\n${inv.token}\n\nL'accès est en lecture seule, limité à cette organisation et révocable à tout moment.`;
        await sendOrgMail(r.auth!.organizationId,{to:email,subject:`Invitation comptable · ${orgName}`,text:body,html:emailBodyHtml(body.replace(/\n/g,'<br>'),(await signatureForEmail(r.auth!.organizationId,await ensureActivity(r,activityId(r)),'professional')).html)});
        emailStatus='sent';
      }
    }catch(e:any){emailStatus='failed';emailError=String(e?.message||e).slice(0,400);}
    await query(`update accountant_invitations set email_status=$2,email_sent_at=case when $2='sent' then now() else null end,email_error=$3 where id=$1`,[inv.id,emailStatus,emailError]);
    return reply.code(201).send({id:inv.id,token:inv.token,expiresAt:inv.expires_at,email,emailStatus,
      note:'Le jeton n\'est affiché que cette fois.'+(emailStatus==='sent'?' Il vient d\'être transmis par e-mail.':emailStatus==='failed'?' L\'envoi a échoué : transmettez-le manuellement.':' Connectez une messagerie pour l\'envoi automatique ; transmettez-le manuellement en attendant.')});
  });
  app.get('/organization/accountant-invitations',async(r,reply)=>{
    if(!['owner','admin'].includes(r.auth!.role))return reply.code(403).send({error:'FORBIDDEN'});
    // Bloc 15 — le jeton n'est plus renvoyé dans les listes : seul l'état de livraison l'est.
    return (await query(`select id,email,email_status as "emailStatus",email_sent_at as "emailSentAt",expires_at as "expiresAt",accepted_at as "acceptedAt",revoked_at as "revokedAt",created_at as "createdAt"
      from accountant_invitations where organization_id=$1 order by created_at desc`,[r.auth!.organizationId])).rows;
  });
  app.delete('/organization/accountant-invitations/:id',async(r,reply)=>{
    if(r.auth!.role!=='owner')return reply.code(403).send({error:'OWNER_ONLY',message:'Seul le chef d\'entreprise peut révoquer un accès comptable.'});
    const x=await query(`update accountant_invitations set revoked_at=now() where id=$1 and organization_id=$2 and revoked_at is null returning id`,[(r.params as any).id,r.auth!.organizationId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    // Révocation immédiate : le rôle comptable du membre (déjà accepté) est retiré.
    const inv=(await query('select email from accountant_invitations where id=$1',[ (r.params as any).id])).rows[0];
    if(inv?.email)await query(`delete from organization_members where organization_id=$1 and user_id=(select id from users where email=$2) and role='accountant'`,[r.auth!.organizationId,inv.email]);
    return {ok:true};
  });
  app.post('/auth/accountant-accept',{preHandler:app.requireAuth},async(r,reply)=>{
    const token=String((r.body as any)?.token||'');
    // L'invitation appartient à l'organisation INVITANTE (RLS bloc 2) : la consultation par le
    // candidat comptable passe par le pool d'administration explicitement journalisé.
    const inv=(await platformAdminQuery(`select id,organization_id,email,expires_at,accepted_at,revoked_at from accountant_invitations where token=$1`,[token])).rows[0];
    if(!inv||inv.revoked_at||inv.accepted_at||new Date(inv.expires_at).getTime()<Date.now())return reply.code(400).send({error:'INVALID_TOKEN',message:'Invitation invalide, expirée, déjà utilisée ou révoquée.'});
    const user=(await query('select email from users where id=$1',[r.auth!.userId])).rows[0];
    if(!user||String(user.email).toLowerCase()!==inv.email)return reply.code(403).send({error:'EMAIL_MISMATCH',message:'Connectez-vous avec le compte correspondant à l\'invitation pour l\'accepter.'});
    await withTenant(inv.organization_id, () => query(`insert into organization_members(organization_id,user_id,role) values($1,$2,'accountant')
      on conflict (organization_id,user_id) do update set role='accountant'`,[inv.organization_id,r.auth!.userId]));
    await platformAdminQuery('update accountant_invitations set accepted_at=now() where id=$1',[inv.id]);
    return {ok:true,note:'Accès comptable accordé (lecture seule). Reconnectez-vous pour que le rôle soit actif dans votre session.'};
  });
  app.post('/activities/detect-fiscal',async(r,reply)=>{const b:any=r.body||{};if(!b.legalForm)return reply.code(400).send({error:'INVALID_INPUT'});const p=profileFor(String(b.name||''),String(b.description||''),b.profileCode);const detected=detectFiscalSettings(String(b.legalForm),p.code,String(b.name||''),String(b.description||''),{annualRevenueHt:b.annualRevenueHt??null,vatRegime:b.vatRegime??null,nafCode:b.nafCode??null});return {...detected,cgvText:defaultCgvFor(p.code,p.title,String(b.legalForm||''))};});
  app.post('/activities/detect-legal-form',async(r,reply)=>{const b:any=r.body||{};return detectLegalFormFromProfile(String(b.name||''),String(b.description||''));});
  app.post('/activities/detect-profile',async(r,reply)=>{const b:any=r.body||{};
    // V2 (chantier 2) — moteur de propositions : plusieurs profils classés par pertinence,
    // niveaux de confiance explicites et raisons sourcées ; correspondance incertaine =
    // demande de confirmation (requiresConfirmation). Rien n'est appliqué ici : la
    // réponse ne fait que proposer, la sélection retenue reste inchangée. Les champs
    // historiques (code/title/modules/…) restent calculés comme avant : les anciens
    // clients ignorent les champs ajoutés.
    const ranked=proposeProfilesFromSignals({nafCode:b.nafCode??null,name:b.name??null,description:b.description??null,services:b.services??null,parts:b.parts??null,secondaryActivities:b.secondaryActivities??null});
    const proposals=ranked.proposals.map(p=>{const prof=profileFor(p.profile);return {...p,title:prof.title};});
    if(b.activityId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(b.activityId))){
      // Traçabilité V2 : la proposition calculée et affichée est datée (le journal ne
      // touche jamais la sélection retenue) ; le contenu affiché est conservé tel quel.
      // L'activité doit appartenir à l'organisation (échec fermé, style 074).
      await query(`insert into profile_proposal_events(organization_id,activity_id,kind,confidence,reasons,proposal)
        select $1,$2,'proposed',$3,$4::jsonb,$5::jsonb where exists(select 1 from activities where id=$2 and organization_id=$1)`,
        [r.auth!.organizationId,String(b.activityId),proposals[0]?.confidence||'faible',
         JSON.stringify(proposals.flatMap(p=>p.reasons.map(rr=>({profile:p.profile,reason:rr})))),
         JSON.stringify({proposals,requiresConfirmation:ranked.requiresConfirmation})]);}
    const p=profileFor(String(b.name||''),String(b.description||''),b.profileCode);
    const nafHint=proposeProfileFromNaf(b.nafCode||'');
    // L'indice NAF affine la suggestion : le métier précis du code APE détecté est proposé
    // en priorité (jamais imposé) ; la note explique la source de la proposition.
    const code=nafHint&&PROFILE_CODES.includes(nafHint.profile)?nafHint.profile:p.code;
    const chosen=code===p.code?p:profileFor(code);
    return {code:chosen.code,title:chosen.title,modules:chosen.modules,calc:chosen.calc,suggestedParts:chosen.suggestedParts.length,warranty:chosen.warranty,nafHint:nafHint?{source:'Code APE/NAF (INSEE)',note:nafHint.note,matched:nafHint.profile===chosen.code}:null,proposals,requiresConfirmation:ranked.requiresConfirmation,source:ranked.source};});
  app.get('/activities/:id/profile',async(r,reply)=>{const x=await query('select id,name,description from activities where id=$1 and organization_id=$2',[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    // V2 — le triplet attendu par la conception : métier retenu, son origine, la date de
    // décision et la proposition d'origine. Le champ principal reste le profil résolu.
    const ov=(await query('select profile_code,origin,chosen_at,chosen_from_proposal,profile_version from activity_profile_overrides o where o.activity_id=$1 and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$2)',[(r.params as any).id,r.auth!.organizationId])).rows[0];
    return {...profileFor(x.rows[0].name,x.rows[0].description||'',ov?.profile_code||null),retainedCode:ov?.profile_code||null,retainedTitle:ov?.profile_code?profileFor(ov.profile_code).title:null,origin:ov?.origin||null,chosenAt:ov?.chosen_at||null,chosenFromProposal:ov?.chosen_from_proposal||null,profileVersion:ov?.profile_version||null};});
  // V2 — seule écriture volontaire de la sélection retenue : confirmer une proposition
  // (confirmProposalId), choisir un métier dans la liste complète (profileCode), ou
  // retirer (remove). Actions explicites, validées contre PROFILE_CODES et journalisées.
  app.post('/activities/:id/profile-choice',async(r,reply)=>{const params=activityParamsSchema.safeParse(r.params);if(!params.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=r.body||{};const id=params.data.id,org=r.auth!.organizationId;
    const own=await query('select id from activities where id=$1 and organization_id=$2',[id,org]);if(!own.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    if(b.remove===true){
      await query('delete from activity_profile_overrides o where o.activity_id=$1 and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$2)',[id,org]);
      await query(`insert into profile_proposal_events(organization_id,activity_id,kind) values($1,$2,'removed')`,[org,id]);
      return {removed:true,retainedCode:null,origin:null};}
    if(!b.profileCode||!PROFILE_CODES.includes(b.profileCode))return reply.code(400).send({error:'INVALID_ACTIVITY_PROFILE'});
    await saveActivityProfileOverride(org,id,String(b.profileCode),b.confirmProposalId?'confirmed':'manual',b.confirmProposalId?String(b.confirmProposalId).slice(0,64):null);
    const ov=(await query('select profile_code,origin,chosen_at from activity_profile_overrides where activity_id=$1',[id])).rows[0];
    return {retainedCode:ov.profile_code,origin:ov.origin,chosenAt:ov.chosen_at};});
  app.post('/activities',async(r,reply)=>{
    const parsed=activityCreateInputSchema.safeParse(r.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data;
    // Bloc 7 : la forme juridique de l'activité de l'entrepreneur reste une entreprise individuelle.
    if(String(b.legalForm||'').trim()&&!isOwnerLegalFormAllowed(String(b.legalForm)))return reply.code(422).send({error:'LEGAL_FORM_OUT_OF_SCOPE',message:OWNER_LEGAL_FORM_REFUSAL});
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
      const detected=detectFiscalSettings(String(b.legalForm||''),profile.code,b.name.trim(),b.description||'',{annualRevenueHt:b.annualRevenueHt??null,vatRegime:b.vatRegime??null,nafCode:b.nafCode??null});
      if(b.legalForm&&b.autoFiscalDetect!==false){
        await query('update activities set urssaf_rate=$1,vat_rate=coalesce($2,vat_rate),social_regime=$3,vat_regime=$4,social_auto_detected=true,vat_auto_detected=true where id=$5 and organization_id=$6',[detected.socialRate,detected.vatRate,detected.socialRegime,detected.vatRegime,id,r.auth!.organizationId]);
        await saveContributionPresets(r.auth!.organizationId,id,detected.contributions);
      }
      const defaultCgv=defaultCgvFor(profile.code,profile.title,String(b.legalForm||''));
      await query('update activities set cgv_text=coalesce(cgv_text,$1) where id=$2 and organization_id=$3',[defaultCgv,id,r.auth!.organizationId]);
      // 15.4.52 — amorçage du catalogue via le service dédié : dédoublonné (insensible à la
      // casse/accents), compté réellement, et les montants sont renvoyés à l'interface.
      const seeded=await seedCatalogFromProfile(r.auth!.organizationId,id,profile,{detectFromHistory:false});
      await saveLegalFields(id,r.auth!.organizationId,{...b,quoteValidityDays});
      return reply.code(201).send({id,profile,catalogSeeded:seeded.added,catalogTotals:seeded.totals});
    }catch(e:any){
      if(e?.code==='23505')return reply.code(409).send({error:'INVALID_INPUT'});
      throw e;
    }
  });
  app.delete('/activities/:id',async(r,reply)=>{const id=(r.params as any).id;const count=await query('select count(*)::int n from activities where organization_id=$1 and active=true',[r.auth!.organizationId]);if(Number(count.rows[0].n)<=1)return reply.code(400).send({error:'LAST_ACTIVITY',message:'Il faut conserver au moins une activité.'});const used=await query('select ((select count(*) from clients where activity_id=$1)+(select count(*) from quotes where activity_id=$1)+(select count(*) from appointments where activity_id=$1))::int n',[id]);if(Number(used.rows[0].n)>0)return reply.code(409).send({error:'ACTIVITY_NOT_EMPTY',message:'Cette activité contient encore des clients, devis ou rendez-vous : supprimez-les d’abord.'});const x=await query('delete from activities where id=$1 and organization_id=$2',[id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  // 15.4.52 — « Suggestions métier » : enrichissement DÉDOUBLONNÉ du catalogue (profil + détection
  // automatique dans les documents émis) avec comptes exhaustifs {added, alreadyPresent, totals}.
  // L'événement de journal porte les MÊMES chiffres que la réponse : notif et compteur du
  // catalogue racontent la même chose (correction de l'incohérence constatée par l'éditeur).
  app.post('/activities/:id/seed-catalog',async(r,reply)=>{
    const id=(r.params as any).id,org=r.auth!.organizationId;
    const a=await query('select id,name,description from activities where id=$1 and organization_id=$2',[id,org]);
    if(!a.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    const ov=(await query('select profile_code from activity_profile_overrides o where o.activity_id=$1 and exists(select 1 from activities own where own.id=o.activity_id and own.organization_id=$2)',[id,org])).rows[0]?.profile_code;
    const profile=profileFor(a.rows[0].name,a.rows[0].description||'',ov);
    const outcome=await seedCatalogFromProfile(org,id,profile,{detectFromHistory:true});
    await emitCatalogEnrichedEvent(org,id,String(a.rows[0].name||''),outcome,profile.code);
    return {added:outcome.added,alreadyPresent:outcome.alreadyPresent,totals:outcome.totals,profile:profile.code};
  });
  app.patch('/activities/:id',async(r,reply)=>{
    const parsed=activityPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    // Bloc 7 : la forme juridique attachée à l'activité de l'entrepreneur reste une entreprise individuelle.
    const activityLegalForm=String((parsed.data as any).legalForm||'').trim();
    if(activityLegalForm&&!isOwnerLegalFormAllowed(activityLegalForm))return reply.code(422).send({error:'LEGAL_FORM_OUT_OF_SCOPE',message:OWNER_LEGAL_FORM_REFUSAL});
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
    const x=await query('update activities set name=coalesce($1,name),description=case when $13::boolean then $2 else description end,legal_form=case when $14::boolean then $3 else legal_form end,cgv_text=case when $15::boolean then $4 else cgv_text end,urssaf_rate=case when $16::boolean then $5 else urssaf_rate end,vat_rate=coalesce($6,vat_rate),margin_min_percent=greatest(0,coalesce($7,margin_min_percent)),default_part_coefficient_percent=greatest(0,coalesce($8,default_part_coefficient_percent)),default_labor_coefficient_percent=greatest(0,coalesce($9,default_labor_coefficient_percent)),active=coalesce($10,active),configuration_defined=true,updated_at=now() where id=$11 and organization_id=$12 returning *',[b.name?.trim(),b.description??null,b.legalForm??null,b.cgvText??null,urssafRate,vatRate,marginMinPercent,partCoefficient,laborCoefficient,b.active,id,r.auth!.organizationId,b.description!==undefined,b.legalForm!==undefined,b.cgvText!==undefined,b.urssafRate!==undefined]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    // V2 — conservation des choix manuels (invariant fondamental) : l'absence ou la
    // vacuité de profileCode NE supprime JAMAIS la sélection retenue, ni lors d'une
    // actualisation du SIRET/NAF/description, ni lors d'une simple mise à jour. Seul le
    // profil explicite choisi par l'utilisateur écrit ici ; le retrait volontaire passe
    // par POST /activities/:id/profile-choice (action dédiée et journalisée).
    if(b.profileCode&&PROFILE_CODES.includes(b.profileCode))await saveActivityProfileOverride(r.auth!.organizationId,id,b.profileCode);
    if(b.autoFiscalDetect===false)await query('update activities set social_auto_detected=false,vat_auto_detected=false where id=$1 and organization_id=$2',[id,r.auth!.organizationId]);
    if(b.legalForm&&b.autoFiscalDetect!==false){
      const a=x.rows[0],p=profileFor(a.name,a.description||'',b.profileCode);
      const detected=detectFiscalSettings(String(b.legalForm),p.code,a.name,a.description||'',{annualRevenueHt:b.annualRevenueHt??null,vatRegime:b.vatRegime??null,nafCode:b.nafCode??null});
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

  app.get('/clients',async r=>{
    const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));
    // Prompt 06 — les fiches ARCHIVÉES sont exclues de la liste courante (réversibles via
    // /clients/:id/unarchive, jamais détruites) ; includeArchived=1 les réaffiche.
    const includeArchived=String((r.query as any)?.includeArchived||'')==='1';
    return (await query(`select id,name,email,phone,address,intervention_address,siret,estimated_minutes,activity_id,buyer_category,country_code,vat_number,(archived_at is not null) as archived,archived_at,merged_into,created_at from clients where organization_id=$1 and ($2::uuid is null or activity_id=$2) and ($3::boolean or archived_at is null) order by name`,[org,aid,includeArchived])).rows;
  });
  // Bloc 11 — recherche de doublons AVANT validation d'un document avec un nouveau client :
  // propositions de réutilisation, sans fusion automatique incertaine (l'utilisateur choisit).
  app.get('/clients/matches',async r=>{
    const q=String((r.query as any)?.q||'').trim();
    const org=r.auth!.organizationId;
    if(q.length<2)return {matches:[]};
    const aid=await ensureActivity(r,activityId(r));
    const digits=q.replace(/[\s.]/g,'');
    const rows=(await query(
      `select id,name,email,siret,address from clients
       where organization_id=$1 and ($2::uuid is null or activity_id=$2::uuid)
         and (aurion_unaccent(trim(name))=aurion_unaccent($3) or aurion_unaccent(name) like aurion_unaccent('%'||$3||'%') or lower(coalesce(siret,''))=lower($3) or lower(coalesce(email,''))=lower($3) or ($4<>'' and siret=$4))
       order by (aurion_unaccent(trim(name))=aurion_unaccent($3))::int desc, name limit 5`,
      [org,aid,q,digits],
    )).rows;
    return {matches:rows.map(x=>({id:x.id,name:x.name,siret:x.siret,email:x.email,address:x.address}))};
  });
  app.post('/clients',async(r,reply)=>{
    const parsed=clientCreateInputSchema.safeParse(r.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data;
    const aid=await ensureActivity(r,activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    let manual=0;
    try{manual=optionalNumber(b.estimatedMinutes,'Temps manuel',0,1e7)??0}catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const id=crypto.randomUUID(),org=r.auth!.organizationId;
    // Bloc 5 — correction d'un défaut démontré en recette : l'index unique
    // idx_client_time_active_user (012 : une session ouverte par utilisateur) rendait la création
    // d'un deuxième client impossible (23505 -> 500) car la session ouverte à la première
    // création n'était jamais close. La session précédente est close ici avec la SÉMANTIQUE
    // EXACTE de l'arrêt du chronomètre existant (running : durée accumulée ; paused : clôture
    // simple) — aucun autre comportement du chronomètre n'est modifié.
    await query(`update client_time_sessions set duration_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),accumulated_seconds=accumulated_seconds+greatest(0,extract(epoch from(now()-started_at))::int),ended_at=now(),status='completed',paused_at=null where organization_id=$1 and user_id=$2 and ended_at is null and status='running'`,[org,r.auth!.userId]);
    await query(`update client_time_sessions set ended_at=now(),status='completed' where organization_id=$1 and user_id=$2 and ended_at is null and status='paused'`,[org,r.auth!.userId]);
    await query('insert into clients(id,organization_id,activity_id,name,email,phone,address,intervention_address,siret,estimated_minutes,buyer_category,country_code,vat_number) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,org,aid,b.name.trim(),b.email||null,b.phone||null,b.address||null,b.interventionAddress||null,(String(b.siret||'').replace(/\D/g,'')||null),manual,buyerCategoryInput(b.buyerCategory),countryCodeInput(b.countryCode),vatNumberInput(b.vatNumber)]);
    if(String(b.interventionAddress||'').trim())await query(`insert into client_intervention_addresses(id,organization_id,client_id,label,address,is_default) values($1,$2,$3,$4,$5,true)`,[crypto.randomUUID(),org,id,'Adresse principale',String(b.interventionAddress).trim()]);
    await query('insert into client_time_sessions(id,organization_id,user_id,client_id,activity_id,manual_minutes,started_at) values($1,$2,$3,$4,$5,$6,now())',[crypto.randomUUID(),org,r.auth!.userId,id,aid,manual]);
    return reply.code(201).send({id});
  });
  // Prompt 06 — suppression encadrée : une fiche liée à des documents émis (envoyés au
  // client) est conservée — l'obligation de conservation prime ; l'ARCHIVAGE réversible
  // (/clients/:id/archive) reste disponible. Sans document envoyé, la suppression historique
  // est inchangée (aucun retrait de capacité).
  app.delete('/clients/:id',async(r,reply)=>{
    const id=(r.params as any).id,org=r.auth!.organizationId;
    const sent=await query(`select 1 from quotes where client_id=$1 and organization_id=$2 and document_type='invoice' and sent_at is not null limit 1`,[id,org]);
    if(sent.rowCount)return reply.code(409).send({error:'CLIENT_HAS_SENT_DOCUMENTS',message:'Cette fiche client est liée à des factures envoyées : elles doivent rester rattachées (obligations de conservation). Archivez la fiche plutôt que de la supprimer.'});
    const x=await query('delete from clients where id=$1 and organization_id=$2',[id,org]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  // Prompt 06 — archivage réversible : la fiche disparaît des listes courantes, toutes les
  // références métier (documents, rendez-vous) restent intactes.
  app.post('/clients/:id/archive',async(r,reply)=>{
    const id=(r.params as any).id,org=r.auth!.organizationId;
    const x=await query(`update clients set archived_at=coalesce(archived_at,now()),archived_by=$3,updated_at=now() where id=$1 and organization_id=$2 and archived_at is null returning id`,[id,org,r.auth!.userId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return {ok:true,archived:true,note:'Fiche archivée : elle disparaît des listes courantes et reste rattachée à ses documents.'};
  });
  app.post('/clients/:id/unarchive',async(r,reply)=>{
    const id=(r.params as any).id,org=r.auth!.organizationId;
    const x=await query(`update clients set archived_at=null,archived_by=null,updated_at=now() where id=$1 and organization_id=$2 and archived_at is not null returning id`,[id,org]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return {ok:true,archived:false};
  });
  // Prompt 06 — fusion de doublons UNIQUEMENT contrôlée et auditée : décision humaine
  // explicite (confirm:true + motif), re-pointage transactionnel de toutes les références,
  // fiche absorbée CONSERVÉE (merged_into) et piste d'audit complète (client_merges).
  app.post('/clients/:id/merge',async(r,reply)=>{
    const survivorId=(r.params as any).id,org=r.auth!.organizationId,b:any=r.body||{};
    const absorbedId=String(b.duplicateId||'');
    const reason=String(b.reason||'').trim().slice(0,400);
    if(b.confirm!==true)return reply.code(400).send({error:'CONFIRM_REQUIRED',message:'La fusion requiert une confirmation explicite (confirm:true) : elle n\u2019est jamais automatique.'});
    if(!reason||reason.length<3)return reply.code(400).send({error:'REASON_REQUIRED',message:'Indiquez le motif de la fusion : il est conservé dans l\u2019audit.'});
    if(!absorbedId||!/^[0-9a-f-]{36}$/i.test(absorbedId))return reply.code(400).send({error:'INVALID_INPUT',message:'Fiche à absorber invalide.'});
    if(absorbedId===survivorId)return reply.code(400).send({error:'INVALID_INPUT',message:'Les deux fiches doivent être distinctes.'});
    const result=await withTransaction(async client=>{
      const survivor=(await client.query('select id,name,email,phone,address from clients where id=$1 and organization_id=$2 for update',[survivorId,org])).rows[0];
      const absorbed=(await client.query('select id,name,email,phone,address,merged_into from clients where id=$1 and organization_id=$2 for update',[absorbedId,org])).rows[0];
      if(!survivor||!absorbed)return {ok:false as const,status:404,error:'NOT_FOUND',message:'Fiche client introuvable.'};
      if(absorbed.merged_into)return {ok:false as const,status:409,error:'ALREADY_MERGED',message:'Cette fiche a déjà été absorbée par une autre fusion.'};
      // Re-pointage de toutes les références métier vers la fiche conservatrice.
      await client.query('update quotes set client_id=$1 where client_id=$2 and organization_id=$3',[survivorId,absorbedId,org]);
      await client.query('update appointments set client_id=$1 where client_id=$2 and organization_id=$3',[survivorId,absorbedId,org]);
      await client.query('update devices set client_id=$1 where client_id=$2 and organization_id=$3',[survivorId,absorbedId,org]);
      await client.query('update sav_cases set client_id=$1 where client_id=$2 and organization_id=$3',[survivorId,absorbedId,org]);
      await client.query('update warranties set client_id=$1 where client_id=$2 and organization_id=$3',[survivorId,absorbedId,org]);
      await client.query('update client_time_sessions set client_id=$1 where client_id=$2 and organization_id=$3',[survivorId,absorbedId,org]);
      await client.query('update client_intervention_addresses set client_id=$1 where client_id=$2 and organization_id=$3',[survivorId,absorbedId,org]);
      await client.query(`update document_links set entity_id=$1 where entity_type='client' and entity_id=$2 and organization_id=$3`,[survivorId,absorbedId,org]);
      await client.query('update clients set merged_into=$1,archived_at=coalesce(archived_at,now()),archived_by=$2,updated_at=now() where id=$3 and organization_id=$4',[survivorId,r.auth!.userId,absorbedId,org]);
      await client.query(`insert into client_merges(organization_id,survivor_id,absorbed_id,reason,actor_id,payload) values($1,$2,$3,$4,$5,$6::jsonb)`,
        [org,survivorId,absorbedId,reason,r.auth!.userId,JSON.stringify({survivor,absorbed})]);
      await publishInTransaction(client,org,{type:'client_merged',idempotencyKey:`client-merged:${absorbedId}`,actorId:r.auth!.userId,sourceEntityType:'client',sourceEntityId:survivorId,payload:{title:'Fiches client fusionnées',description:`La fiche « ${absorbed.name||absorbedId} » a été absorbée dans « ${survivor.name||survivorId} » (motif conservé dans l\u2019audit).`}});
      return {ok:true as const,survivorId,absorbedId};
    });
    if(!result.ok)return reply.code(result.status).send({error:result.error,message:result.message});
    return {ok:true,survivorId:result.survivorId,absorbedId:result.absorbedId,note:'Fusion audité : la fiche absorbée est conservée (merged_into) avec sa piste d\u2019audit complète.'};
  });
  app.patch('/clients/:id',async(r,reply)=>{
    const parsed=clientPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,id=(r.params as any).id,hasManual=b.estimatedMinutes!==undefined;
    // Bloc 5 — concurrence multi-appareils : si la décision porte une base de référence
    // (baseUpdatedAt) et que le serveur connaît une version plus récente, refus déterministe
    // 409 avec les DEUX valeurs (serveur visible pour comparaison champ par champ). Sans
    // baseUpdatedAt, le comportement historique « dernière écriture gagnante » est conservé.
    if(b.baseUpdatedAt!==undefined){
      const cur=(await query('select name,email,phone,address,to_char(updated_at,\'YYYY-MM-DD\"T\"HH24:MI:SS\') as updated_at from clients where id=$1 and organization_id=$2',[id,r.auth!.organizationId])).rows[0];
      if(!cur)return reply.code(404).send({error:'NOT_FOUND'});
      if(String(b.baseUpdatedAt)!==String(cur.updated_at))return reply.code(409).send({error:'CONFLICT_VERSION',message:'Ce client a été modifié depuis un autre appareil. Comparez les valeurs puis confirmez la version à conserver.',server:{name:cur.name,email:cur.email,phone:cur.phone,address:cur.address,updated_at:cur.updated_at},client:{updated_at:String(b.baseUpdatedAt)}});
    }
    const requestedActivityId=b.activityId?await ensureActivity(r,b.activityId):undefined;
    if(b.activityId&&!requestedActivityId)return reply.code(400).send({error:'INVALID_ACTIVITY'});
    let manual:number|null=null;
    try{manual=hasManual?(optionalNumber(b.estimatedMinutes,'Temps manuel',0,1e7)??0):null}catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    // Bloc 5 — les champs de classification e-reporting suivent une sémantique de PRÉSENCE :
    // seuls les champs transmis sont modifiés (une valeur enregistrée n'est jamais remplacée
    // par un vide), comme les mentions électroniques sur les factures.
    const x=await query('update clients set name=coalesce($1,name),email=$2,phone=$3,address=$4,intervention_address=$5,siret=$6,activity_id=coalesce($7,activity_id),estimated_minutes=coalesce($8,estimated_minutes),buyer_category=case when $9::boolean then $10::varchar(20) else buyer_category end,country_code=case when $11::boolean then $12::varchar(2) else country_code end,vat_number=case when $13::boolean then $14::varchar(32) else vat_number end,updated_at=now() where id=$15 and organization_id=$16 returning id',[b.name?.trim(),b.email||null,b.phone||null,b.address||null,b.interventionAddress||null,(String(b.siret||'').replace(/\D/g,'')||null),requestedActivityId||null,manual,b.buyerCategory!==undefined,buyerCategoryInput(b.buyerCategory),b.countryCode!==undefined,countryCodeInput(b.countryCode),b.vatNumber!==undefined,vatNumberInput(b.vatNumber),id,r.auth!.organizationId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    if(b.interventionAddress!==undefined){
      const addr=String(b.interventionAddress||'').trim();
      const current=(await query(`select id from client_intervention_addresses where organization_id=$1 and client_id=$2 and is_active=true and is_default=true limit 1`,[r.auth!.organizationId,id])).rows[0];
      if(addr){if(current)await query(`update client_intervention_addresses set address=$1,updated_at=now() where id=$2 and organization_id=$3 and client_id=$4`,[addr,current.id,r.auth!.organizationId,id]);else await query(`insert into client_intervention_addresses(id,organization_id,client_id,label,address,is_default) values($1,$2,$3,'Adresse principale',$4,true)`,[crypto.randomUUID(),r.auth!.organizationId,id,addr]);}
      else if(current)await query(`update client_intervention_addresses set is_active=false,is_default=false,updated_at=now() where id=$1 and organization_id=$2 and client_id=$3`,[current.id,r.auth!.organizationId,id]);
    }
    return x.rows[0];
  });

  app.get('/clients/:id/summary',async(r,reply)=>{const x=await clientSummary(r.auth!.organizationId,(r.params as any).id);if(!x)return reply.code(404).send({error:'NOT_FOUND'});return x});
  // 15.4.51 (PROMPT B1) — fiabilité de paiement du client : moteur déterministe 15.4.50
  // (services/payment-reliability.ts) enfin branché. Statistiques sur l'historique RÉEL,
  // aucune prédiction ; la fiche client affiche l'encart correspondant (clientsheet.js).
  app.get('/clients/:id/reliability',async(r,reply)=>{
    const id=String((r.params as any).id),org=r.auth!.organizationId;
    if(!/^[0-9a-f-]{36}$/i.test(id))return reply.code(400).send({error:'INVALID_INPUT'});
    const exists=(await query('select 1 from clients where id=$1 and organization_id=$2',[id,org])).rowCount;
    if(!exists)return reply.code(404).send({error:'NOT_FOUND'});
    return await clientReliability(sqlExecutor,org,id);
  });
  // 15.4.53 (PROMPT C3) + 15.4.54 — pré-vérification AVANT la fenêtre d'émission : `gaps` liste
  // les seules mentions BLOQUANTES (identité, assurance travaux) ; `reminders` signale les
  // mentions manquantes NON bloquantes (médiateur de la consommation) comme simple rappel.
  // La modal « Facturer » affiche les champs à compléter et renvoie vers Paramètres ; la source
  // de vérité reste le contrôle serveur du POST d'émission (même moteur, jamais de cache UI).
  app.get('/mentions/blocking',async(r,reply)=>{
    const documentId=String((r.query as any)?.documentId||'');
    if(!/^[0-9a-f-]{36}$/i.test(documentId))return reply.code(400).send({error:'INVALID_INPUT'});
    const q=(await query('select activity_id,document_type from quotes where id=$1 and organization_id=$2',[documentId,r.auth!.organizationId])).rows[0];
    if(!q)return reply.code(404).send({error:'NOT_FOUND'});
    if(q.document_type==='invoice')return reply.code(409).send({error:'ALREADY_INVOICE',message:'Ce document est déjà une facture.'});
    const mentions=computeMentions(await invoiceMentionContext(r.auth!.organizationId,q.activity_id));
    return {kind:'invoice',mentions,gaps:blockingMentionGaps(mentions).map(m=>({key:m.key,note:m.note})),reminders:mentionReminders(mentions).map(m=>({key:m.key,note:m.note}))};
  });
  app.get('/suppliers',async r=>(await query('select * from suppliers where organization_id=$1 and activity_id=$2 order by name',[r.auth!.organizationId,activityId(r)])).rows);
  // Détection SIRET/SIREN ou par NOM (au clic, une requête par action, débit limité, journalisation sans identifiant).
  app.get('/suppliers/lookup',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(r,reply)=>{
    const id=String((r.query as any)?.identifier||'').trim();
    const digits=id.replace(/[\s.]/g,'');
    try{
      if(/^\d+$/.test(digits)){
        const result=await lookupFrenchCompany(digits);
        return {company:result,status:result?(result.closed?'closed':result.establishmentClosed?'establishment_closed':'found'):'not_found'};
      }
      // Recherche par nom : plusieurs entreprises possibles, l'utilisateur choisit la sienne côté interface.
      const results=await searchFrenchCompaniesByName(id);
      return {results,status:results.length?'found':'not_found'};
    }
    catch(e:any){const code=String(e?.code||'');if(code==='REGISTRY_INVALID_IDENTIFIER')return reply.code(400).send({error:'INVALID_IDENTIFIER',status:'invalid',message:String(e.message)});if(code==='REGISTRY_RATE_LIMITED')return reply.code(429).send({error:'REGISTRY_RATE_LIMITED',status:'unavailable',message:'Le registre public limite temporairement les requêtes. Réessayez dans quelques secondes.'});r.log.warn({code:code||'REGISTRY_UNAVAILABLE'},'registry lookup failed');return reply.code(503).send({error:'REGISTRY_UNAVAILABLE',status:'unavailable',message:'Le registre public est momentanément indisponible. Vous pouvez saisir les informations manuellement.'});}
  });

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
      await beginTenant(client);
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
    // Bloc 5 — concurrence optimiste (même contrat que les clients).
    if((r.body as any)?.baseUpdatedAt!==undefined){
      const cur=(await query('select name,email,phone,to_char(updated_at,\'YYYY-MM-DD\"T\"HH24:MI:SS\') as updated_at from suppliers where id=$1 and organization_id=$2',[String((r.params as any).id),r.auth!.organizationId])).rows[0];
      if(!cur)return reply.code(404).send({error:'NOT_FOUND'});
      if(String((r.body as any).baseUpdatedAt)!==String(cur.updated_at))return reply.code(409).send({error:'CONFLICT_VERSION',message:'Ce fournisseur a été modifié depuis un autre appareil. Comparez les valeurs puis confirmez la version à conserver.',server:{name:cur.name,email:cur.email,phone:cur.phone,updated_at:cur.updated_at},client:{updated_at:String((r.body as any).baseUpdatedAt)}});
    }
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
  // Bloc 15 — recherche insensible aux accents/ligatures/apostrophe typographique via
  // aurion_unaccent (IMMUTABLE) : « reparation » retrouve « Réparation », « electricite »
  // retrouve « Électricité ». Les valeurs d'origine restent inchangées dans les données
  // et dans l'interface, les documents, les PDF et les exports.
  app.get('/search/all',async r=>{const q=String((r.query as any)?.q||'').trim();const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));if(!aid)return {clients:[],suppliers:[],quotes:[],invoices:[],sav:[]};const like=`%${q}%`;const [clients,suppliers,docs,sav]=await Promise.all([query(`select id,name,email,phone,siret from clients where organization_id=$1 and activity_id=$2 and ($3='' or aurion_unaccent(name) like aurion_unaccent($3) or aurion_unaccent(email) like aurion_unaccent($3) or siret ilike $3) order by name limit 50`,[org,aid,like]),query(`select id,name,siret,legal_name from suppliers where organization_id=$1 and activity_id=$2 and ($3='' or aurion_unaccent(name) like aurion_unaccent($3) or aurion_unaccent(legal_name) like aurion_unaccent($3) or siret ilike $3) order by name limit 50`,[org,aid,like]),// Correction bloc 15 (bug préexistant) : la requête historique référençait quotes.client_name,
// colonne inexistante (la recherche globale renvoyait 500). Le nom du client vient du JOIN.
query(`select q.id,q.number,q.document_type,c.name client_name,q.total_ttc,q.created_at from quotes q left join clients c on c.id=q.client_id where q.organization_id=$1 and q.activity_id=$2 and ($3='' or aurion_unaccent(c.name) like aurion_unaccent($3) or q.number ilike $3 or cast(q.total_ttc as text) ilike $3 or cast(q.created_at as text) ilike $3) order by q.created_at desc limit 100`,[org,aid,like]),query(`select s.id,s.invoice_id quote_id,s.amount_ttc amount,s.created_at,c.name client_name from sav_cases s left join clients c on c.id=s.client_id where s.organization_id=$1 and s.activity_id=$2 and ($3='' or aurion_unaccent(c.name) like aurion_unaccent($3) or cast(s.amount_ttc as text) ilike $3 or cast(s.created_at as text) ilike $3) order by s.created_at desc limit 50`,[org,aid,like]).catch(()=>({rows:[]}))]);return {clients:clients.rows,suppliers:suppliers.rows,quotes:docs.rows.filter(x=>x.document_type==='quote'),invoices:docs.rows.filter(x=>x.document_type==='invoice'),sav:sav.rows};});
  app.get('/parts',async r=>(await query(`select p.*,coalesce(json_agg(json_build_object('supplierId',s.id,'supplier',s.name,'supplierReference',sp.supplier_reference,'purchasePrice',sp.purchase_price,'available',sp.available) order by sp.purchase_price) filter(where s.id is not null),'[]') suppliers from parts p left join supplier_parts sp on sp.part_id=p.id left join suppliers s on s.id=sp.supplier_id where p.organization_id=$1 and p.activity_id=$2 group by p.id order by p.name`,[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/parts',async(r,reply)=>{
    const parsed=partCreateInputSchema.safeParse(r.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,aid=await ensureActivity(r,activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    let stock=0,sellingPrice=0,saleCoefficient=0,minThreshold=0;
    try{
      stock=optionalNumber(b.stock,'Stock',0,10_000_000)??0;
      if(!Number.isInteger(stock))return reply.code(400).send({error:'INVALID_INPUT'});
      sellingPrice=optionalNumber(b.sellingPrice,'Prix de vente',0,1e9)??0;
      saleCoefficient=optionalNumber(b.saleCoefficientPercent,'Coefficient de vente',0,1e6)??0;
      minThreshold=optionalNumber(b.minStockThreshold,'Seuil de réapprovisionnement',0,1_000_000)??0;
    }catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const id=crypto.randomUUID();
    const activity=(await query('select margin_min_percent from activities where id=$1 and organization_id=$2',[aid,r.auth!.organizationId])).rows[0];
    const coefficient=Math.max(Number(activity?.margin_min_percent??0),saleCoefficient);
    // Bloc 10 — tout stock initial passe par un mouvement traçable « initial » (aucune écriture
    // libre de la quantité) : la création reste atomique (insert + mouvement dans la même transaction).
    await withTransaction(async client=>{
      await client.query(`insert into parts(id,organization_id,activity_id,name,category,model,variant,color,quality,reference,stock,selling_price,sale_coefficient_percent,notes,activity_category,unit,min_stock_threshold,storage_location) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[id,r.auth!.organizationId,aid,b.name.trim(),b.category||null,b.model||null,b.variant||null,b.color||null,b.quality||null,b.reference||null,stock,sellingPrice,coefficient,b.notes||null,normalizeCategoryInput(b.activityCategory),b.unit?String(b.unit).slice(0,20):null,minThreshold,b.storageLocation?String(b.storageLocation).slice(0,160):null]);
      if(stock>0)await createStockMovement(client,r.auth!.organizationId,{partId:id,type:'initial',quantity:stock,reason:'Stock initial à la création de l\'article',actorId:r.auth!.userId,opType:'part_create',opId:id});
    });
    return reply.code(201).send({id});
  });app.get('/parts/:id/photo',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const x=(await query('select photo_key from parts where id=$1 and organization_id=$2',[id,org])).rows[0];if(!x||!x.photo_key)return reply.code(404).send({error:'NOT_FOUND'});try{const buf=await readPrivateObject(x.photo_key);const ext=String(x.photo_key).toLowerCase();const type=ext.endsWith('.png')?'image/png':ext.endsWith('.webp')?'image/webp':'image/jpeg';return reply.header('Content-Type',type).header('Cache-Control','private, max-age=3600').send(buf)}catch{return reply.code(404).send({error:'NOT_FOUND'})}});
  app.post('/parts/:id/photo',async(request,reply)=>{const part=await request.file();if(!part||!['image/png','image/jpeg','image/webp'].includes(part.mimetype))return reply.code(400).send({error:'INVALID_IMAGE'});const id=String((request.params as any).id),org=request.auth!.organizationId;const ok=await query('select id from parts where id=$1 and organization_id=$2',[id,org]);if(!ok.rowCount)return reply.code(404).send({error:'NOT_FOUND'});const saved=await savePrivateUpload(org,part,5*1024*1024);await query('update parts set photo_key=$1,updated_at=now() where id=$2 and organization_id=$3',[`private/${org}/${saved.safe}`,id,org]);return {ok:true,photoKey:`private/${org}/${saved.safe}`};});  app.patch('/parts/:id',async(r,reply)=>{
    const parsed=partPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,id=String((r.params as any).id),org=r.auth!.organizationId;
    const current=(await query('select * from parts where id=$1 and organization_id=$2',[id,org])).rows[0];
    if(!current)return reply.code(404).send({error:'NOT_FOUND'});
    let stock=Number(current.stock||0),sellingPrice=Number(current.selling_price||0),saleCoefficient=Number(current.sale_coefficient_percent||0),minThreshold=Number(current.min_stock_threshold||0);
    try{
      if(b.stock!==undefined){stock=optionalNumber(b.stock,'Stock',0,10_000_000)??0;if(!Number.isInteger(stock))return reply.code(400).send({error:'INVALID_INPUT'});}
      if(b.sellingPrice!==undefined)sellingPrice=optionalNumber(b.sellingPrice,'Prix de vente',0,1e9)??0;
      if(b.saleCoefficientPercent!==undefined)saleCoefficient=optionalNumber(b.saleCoefficientPercent,'Coefficient de vente',0,1e6)??0;
      if(b.minStockThreshold!==undefined)minThreshold=optionalNumber(b.minStockThreshold,'Seuil de réapprovisionnement',0,1_000_000)??0;
    }catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const keepOrClear=(key:string,oldValue:unknown)=>b[key]===undefined?oldValue:(b[key]||null);
    // Bloc 10 — la saisie manuelle du stock est désormais un AJUSTEMENT TRACÉ : la variation
    // crée un mouvement (motif conservé, acteur identifié) et réévalue le seuil. La valeur
    // finale est identique à l'ancien comportement, seule la traçabilité s'ajoute.
    let updated:any=null;
    await withTransaction(async client=>{
      updated=(await client.query(`update parts p set name=coalesce($1,p.name),category=$2,model=$3,variant=$4,color=$5,quality=$6,reference=$7,stock=$8,selling_price=$9,sale_coefficient_percent=greatest(0::numeric,$10::numeric),notes=$11,activity_category=$14,unit=$15,min_stock_threshold=$16,storage_location=$17,updated_at=now() where p.id=$12 and p.organization_id=$13 returning p.*`,[b.name?.trim(),keepOrClear('category',current.category),keepOrClear('model',current.model),keepOrClear('variant',current.variant),keepOrClear('color',current.color),keepOrClear('quality',current.quality),keepOrClear('reference',current.reference),Number(current.stock||0),sellingPrice,saleCoefficient,keepOrClear('notes',current.notes),id,org,b.activityCategory===undefined?undefined:normalizeCategoryInput(b.activityCategory),b.unit===undefined?current.unit:(b.unit?String(b.unit).slice(0,20):null),minThreshold,keepOrClear('storageLocation',current.storage_location)])).rows[0];
      const delta=Math.round((stock-Number(current.stock||0))*100)/100;
      if(delta!==0){
        await createStockMovement(client,org,{partId:id,type:'adjustment',quantity:delta,reason:'Ajustement manuel du stock depuis le catalogue',origin:'saisie manuelle',destination:'catalogue',actorId:r.auth!.userId,opType:'part_patch',opId:id});
      }else{
        // Seuil modifié sans variation de stock : réévalue l'alerte de réapprovisionnement.
        const part=(await client.query('select name,stock,coalesce(min_stock_threshold,0) as threshold from parts where id=$1 and organization_id=$2',[id,org])).rows[0];
        const { evaluateThreshold } = await import('../services/stock.js');
        const reserved=Number((await client.query(`select coalesce(sum(quantity),0) reserved from part_reservations where organization_id=$1 and part_id=$2 and status='active'`,[org,id])).rows[0]?.reserved||0);
        await evaluateThreshold(client,org,id,Number(part.stock||0)-reserved,Number(part.threshold||0),Number(part.stock||0),String(part.name??updated?.name??''));
      }
    });
    const fresh=(await query('select * from parts where id=$1 and organization_id=$2',[id,org])).rows[0];
    return fresh;
  });app.delete('/parts/:id',async(r,reply)=>{const x=await query('delete from parts where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.post('/parts/:id/prices',async(r,reply)=>{
    const parsed=partPriceInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT',message:'Les informations du prix fournisseur sont invalides.'});
    const b:any=parsed.data;
    let purchasePrice=0;
    try{purchasePrice=optionalNumber(b.purchasePrice,'Prix d’achat',0,1e9)??0}catch{return reply.code(400).send({error:'INVALID_INPUT',message:'Le prix d’achat doit être un nombre positif ou nul.'})}
    const part=await query('select id,activity_id from parts where id=$1 and organization_id=$2',[String((r.params as any).id),r.auth!.organizationId]);
    if(!part.rowCount)return reply.code(404).send({error:'NOT_FOUND',message:'Pièce détachée introuvable.'});
    const supplier=await query('select id from suppliers where id=$1 and organization_id=$2 and activity_id=$3',[b.supplierId,r.auth!.organizationId,part.rows[0].activity_id]);
    if(!supplier.rowCount)return reply.code(400).send({error:'INVALID_INPUT',message:'Le fournisseur sélectionné n’appartient pas à l’activité de cette pièce.'});
    const partId=String(part.rows[0].id);
    const client=await db.connect();
    try{
      await beginTenant(client);
      await client.query('select pg_advisory_xact_lock(hashtext($1),hashtext($2))',[`aurion-part-price:${partId}`,String(b.supplierId)]);
      const updated=await client.query('update supplier_parts set supplier_reference=$1,purchase_price=$2,available=$3,updated_at=now() where supplier_id=$4 and part_id=$5',[b.supplierReference||null,purchasePrice,b.available!==false,b.supplierId,partId]);
      if(!updated.rowCount){
        await client.query('insert into supplier_parts(supplier_id,part_id,supplier_reference,purchase_price,available,updated_at) values($1,$2,$3,$4,$5,now())',[b.supplierId,partId,b.supplierReference||null,purchasePrice,b.available!==false]);
      }
      await client.query('commit');
      return {ok:true};
    }catch(e:any){
      await client.query('rollback').catch(()=>{});
      r.log.error({err:e,partId,supplierId:b.supplierId},'supplier part price save failed');
      return reply.code(500).send({error:'SUPPLIER_PART_PRICE_SAVE_FAILED',message:'Le prix fournisseur n’a pas pu être enregistré. Vérifiez le fournisseur et réessayez.'});
    }finally{client.release()}
  });

app.get('/interventions',async r=>(await query('select * from interventions where organization_id=$1 and activity_id=$2 order by name',[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/interventions',async(r,reply)=>{
    const parsed=interventionCreateInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,aid=await ensureActivity(r,activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    let duration:number|null=null,price=0;
    try{
      if(b.durationMinutes!==undefined&&b.durationMinutes!==null&&b.durationMinutes!==''){
        const n=optionalNumber(b.durationMinutes,'Durée',1,100000);
        if(n===null||!Number.isInteger(n))return reply.code(400).send({error:'INVALID_INPUT'});
        duration=n;
      }
      price=optionalNumber(b.defaultPrice,'Prix habituel',0,1e9)??0;
    }catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const id=crypto.randomUUID();
    await query('insert into interventions(id,organization_id,activity_id,name,description,default_duration_minutes,default_price,activity_category) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,r.auth!.organizationId,aid,b.name.trim(),b.description||null,duration,price,normalizeCategoryInput(b.activityCategory)]);
    return reply.code(201).send({id});
  });
  app.patch('/interventions/:id',async(r,reply)=>{
    const parsed=interventionPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const params=activityParamsSchema.safeParse(r.params);
    if(!params.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data;
    let duration:number|null=null,price=0;
    try{
      if(b.durationMinutes!==undefined&&b.durationMinutes!==null&&b.durationMinutes!==''){
        const n=optionalNumber(b.durationMinutes,'Durée',1,100000);
        if(n===null||!Number.isInteger(n))return reply.code(400).send({error:'INVALID_INPUT'});
        duration=n;
      }
      price=b.defaultPrice===undefined?0:(optionalNumber(b.defaultPrice,'Prix habituel',0,1e9)??0);
    }catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const x=await query('update interventions set name=coalesce($1,name),description=$2,default_duration_minutes=$3,default_price=$4,activity_category=$7,updated_at=now() where id=$5 and organization_id=$6 returning *',[b.name?.trim(),b.description||null,duration,price,params.data.id,r.auth!.organizationId,b.activityCategory===undefined?undefined:normalizeCategoryInput(b.activityCategory)]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return x.rows[0];
  });
  app.delete('/interventions/:id',async(r,reply)=>{const x=await query('delete from interventions where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});

  app.get('/devices',async r=>(await query('select d.*,c.name client_name from devices d join clients c on c.id=d.client_id where d.organization_id=$1 and d.activity_id=$2 order by d.created_at desc',[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/devices',async(r,reply)=>{
    const parsed=deviceCreateInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,aid=await ensureActivity(r,activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    const client=await query('select id from clients where id=$1 and organization_id=$2 and activity_id=$3',[b.clientId,r.auth!.organizationId,aid]);
    if(!client.rowCount)return reply.code(400).send({error:'INVALID_CLIENT'});
    const id=crypto.randomUUID();
    await query('insert into devices(id,organization_id,activity_id,client_id,type,brand,model,imei,serial_number,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,r.auth!.organizationId,aid,b.clientId,b.type.trim(),b.brand||null,b.model||null,b.imei||null,b.serialNumber||null,b.notes||null]);
    return reply.code(201).send({id});
  });
  app.get('/devices/search',async r=>{const q=String((r.query as any)?.q||'').trim();return (await query(`select d.*,c.name client_name from devices d join clients c on c.id=d.client_id where d.organization_id=$1 and d.activity_id=$2 and ($3='' or d.imei ilike '%'||$3||'%' or c.name ilike '%'||$3||'%') order by d.created_at desc`,[r.auth!.organizationId,activityId(r),q])).rows});

  app.get('/warranties',async r=>(await query('select w.*,d.imei,c.name client_name from warranties w left join devices d on d.id=w.device_id left join clients c on c.id=w.client_id where w.organization_id=$1 and w.activity_id=$2 order by w.ends_at desc',[r.auth!.organizationId,activityId(r)])).rows);
  app.get('/warranty-policies',async r=>(await query('select * from warranty_policies where organization_id=$1 and activity_id=$2 order by name',[r.auth!.organizationId,activityId(r)])).rows);
  app.post('/warranty-policies',async(r,reply)=>{
    const parsed=warrantyPolicyCreateInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data,aid=await ensureActivity(r,activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    let duration=12;
    try{
      duration=optionalNumber(b.durationMonths,'Durée de garantie',1,1200)??12;
      if(!Number.isInteger(duration))return reply.code(400).send({error:'INVALID_INPUT'});
    }catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const id=crypto.randomUUID();
    await query('insert into warranty_policies(id,organization_id,activity_id,name,scope_type,scope_key,duration_months) values($1,$2,$3,$4,$5,$6,$7)',[id,r.auth!.organizationId,aid,b.name.trim(),b.scopeType||'activity',b.scopeKey||null,duration]);
    return reply.code(201).send({id});
  });

  app.post('/pricing/suggestions',async(r,reply)=>{const b:any=r.body||{},org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r,b));if(!aid)return {servicePrice:null,partPrices:{},recommendedPartSignatures:[],relevantParts:[]};const norm=(v:any)=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');const sig=norm(b.service||b.intervention);const service=(await query(`select price_ttc from document_price_memory where organization_id=$1 and activity_id=$2 and kind='service' and signature=$3 order by use_count desc,last_used_at desc limit 1`,[org,aid,sig])).rows[0];const partPrices:any={};for(const x of Array.isArray(b.parts)?b.parts:[]){const ps=norm([x.name,x.model,x.variant,x.color,x.quality,x.reference].join('|'));const row=(await query(`select price_ttc from document_price_memory where organization_id=$1 and activity_id=$2 and kind='part' and signature=$3 order by use_count desc,last_used_at desc limit 1`,[org,aid,ps])).rows[0];if(row)partPrices[x.id||ps]=Number(row.price_ttc)}const patterns=(await query(`select part_signature from recommendation_patterns where organization_id=$1 and service_signature=$2 and use_count>=2 order by use_count desc,last_used_at desc limit 30`,[org,sig])).rows.map(x=>x.part_signature);const relevantRows=(await query(`select p.*,coalesce((select max(rp.use_count) from recommendation_patterns rp where rp.organization_id=$1 and rp.service_signature=$2 and rp.part_signature=lower(regexp_replace(trim(concat_ws('|',p.name,p.model,p.variant,p.color,p.quality,p.reference)),'\\s+',' ','g'))),0) learned_count from parts p where p.organization_id=$1 and p.activity_id=$3 order by learned_count desc,p.updated_at desc limit 100`,[org,sig,aid])).rows;return {servicePrice:service?Number(service.price_ttc):null,partPrices,recommendedPartSignatures:patterns,relevantParts:relevantRows};});
  app.post('/pricing/learn',async(r,reply)=>{const b:any=r.body||{},org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r,b));if(!aid)return {ok:true};const norm=(v:any)=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');const service=norm(b.service||b.intervention);if(service&&Number(b.servicePrice)>=0)await query(`insert into document_price_memory(organization_id,activity_id,kind,signature,price_ttc) values($1,$2,'service',$3,$4) on conflict(organization_id,activity_id,kind,signature) do update set price_ttc=excluded.price_ttc,last_used_at=now(),use_count=document_price_memory.use_count+1`,[org,aid,service,Number(b.servicePrice||0)]);for(const x of Array.isArray(b.parts)?b.parts:[]){const ps=norm([x.name,x.model,x.variant,x.color,x.quality,x.reference].join('|'));if(!ps||Number(x.price)<0)continue;await query(`insert into document_price_memory(organization_id,activity_id,kind,signature,price_ttc) values($1,$2,'part',$3,$4) on conflict(organization_id,activity_id,kind,signature) do update set price_ttc=excluded.price_ttc,last_used_at=now(),use_count=document_price_memory.use_count+1`,[org,aid,ps,Number(x.price||0)]);if(service)await query(`insert into recommendation_patterns(organization_id,activity_id,service_signature,part_signature) values($1,$2,$3,$4) on conflict(organization_id,activity_id,service_signature,part_signature) do update set use_count=recommendation_patterns.use_count+1,last_used_at=now()`,[org,aid,service,ps]);}return {ok:true};});
  app.post('/pricing/calculate',async(r,reply)=>{try{return computePricing((r.body||{}) as any)}catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}});

  app.get('/electronic-invoicing/profile',async r=>{const row=(await query('select * from electronic_invoice_profiles where organization_id=$1',[r.auth!.organizationId])).rows[0]||{};return {platformName:row.platform_name||null,platformIdentifier:row.platform_identifier||null,registrationStatus:row.registration_status||'not_registered',routingIdentifier:row.routing_identifier||null,integrationStatus:'not_integrated',transmissionAvailable:false};});
  app.patch('/electronic-invoicing/profile',async(r,reply)=>{const b:any=r.body||{};const status=['not_registered','candidate','registered'].includes(b.registrationStatus)?b.registrationStatus:'not_registered';await query(`insert into electronic_invoice_profiles(organization_id,platform_name,platform_identifier,registration_status,routing_identifier,updated_at) values($1,$2,$3,$4,$5,now()) on conflict(organization_id) do update set platform_name=excluded.platform_name,platform_identifier=excluded.platform_identifier,registration_status=excluded.registration_status,routing_identifier=excluded.routing_identifier,updated_at=now()`,[r.auth!.organizationId,b.platformName||null,b.platformIdentifier||null,status,b.routingIdentifier||null]);return {ok:true,status};});
  app.get('/quotes',async r=>(await query(`select q.*,q.catalog_pricing as "catalogPricing",q.coefficient_unit as "coefficientUnit",q.coefficient_value as "coefficientValue",coalesce((select sum(ir.penalty_amount) from invoice_reminders ir where ir.quote_id=q.id),0)::numeric total_penalty_amount,coalesce((select json_agg(json_build_object('id',ir.id,'reminderNumber',ir.reminder_number,'penaltyAmount',ir.penalty_amount,'createdAt',ir.sent_at) order by ir.reminder_number) from invoice_reminders ir where ir.quote_id=q.id),'[]'::json) reminders,c.name client_name,c.email client_email,coalesce((select json_agg(json_build_object('id',i.id,'label',i.label,'quantity',i.quantity,'unitCost',i.unit_cost,'unitPrice',i.unit_price,'saleCoefficientPercent',i.sale_coefficient_percent,'photoKey',i.photo_key,'partId',i.part_id,'activityCategory',i.activity_category) order by i.position) from quote_items i where i.quote_id=q.id),'[]'::json) items,coalesce((select json_agg(json_build_object('id',w.id,'scopeType',w.scope_type,'policyName',w.policy_name,'endsAt',w.ends_at,'remainingDays',greatest(0,ceil(extract(epoch from(w.ends_at-now()))/86400.0)::int)) order by w.ends_at) from warranties w where w.quote_id=q.id and w.ends_at>now()),'[]'::json) warranties from quotes q left join clients c on c.id=q.client_id where q.organization_id=$1 and ($2::uuid is null or q.activity_id=$2) order by q.created_at desc`,[r.auth!.organizationId,activityId(r)])).rows);
  app.get('/invoices/:id/electronic-data',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const q=(await query(`select q.*,c.name client_name,c.email client_email,c.address client_address,o.name company_name,o.siren,o.siret from quotes q left join clients c on c.id=q.client_id join organizations o on o.id=q.organization_id where q.id=$1 and q.organization_id=$2 and q.document_type='invoice'`,[id,org])).rows[0];if(!q)return reply.code(404).send({error:'NOT_FOUND'});const items=(await query('select label,quantity,unit_price from quote_items where quote_id=$1 order by position',[id])).rows;const payload=buildStructuredInvoice(q,items);await query('update quotes set structured_invoice=$1,electronic_status=\'prepared_not_transmitted\' where id=$2 and organization_id=$3',[payload,id,org]);return payload;});
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
      // Bloc 5 — validation anticipée de l'exonération e-reporting (motif obligatoire si
      // exonération déclarée) : refus explicite 400 INVALID_INPUT, jamais une erreur serveur.
      if(b.ereportingExempt!==undefined||b.ereportingExemptReason!==undefined){
        ereportingExemptReasonInput(b.ereportingExempt===true,b.ereportingExemptReason);
      }
      // Bloc 8 — catégorie d'activité du document et des lignes : valeur inconnue refusée
      // explicitement, vide = non renseigné (jamais de catégorie inventée).
      b.activityCategory=normalizeCategoryInput(b.activityCategory);
      if(Array.isArray(b.items))for(const it of b.items)it.activityCategory=normalizeCategoryInput(it.activityCategory);
      if(Array.isArray(b.currentItems))for(const it of b.currentItems)it.activityCategory=normalizeCategoryInput(it.activityCategory);
    }catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}
    if(!b.intervention||!String(b.intervention).trim())return reply.code(400).send({error:'INVALID_INPUT',message:'La prestation est obligatoire.'});
    const aid=await ensureActivity(r,activityId(r,b));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    let prepared:any;
    try{prepared=await prepareQuoteCalculation(org,aid,b)}catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}
    const {items,basis,unit,selectedValue,partCoefficient,laborCoefficient,rawPart,shippingCost,mileageKm,mileageInternalRate,mileageClientRate,mileageTotal,mileageMode,laborSellingHt,laborInternalCostHt,contributions,targetTtc,catalogPricing,p}=prepared;
    const client=b.clientId?await query('select id from clients where id=$1 and organization_id=$2 and (activity_id=$3 or activity_id is null)',[b.clientId,org,aid]):{rowCount:1};
    if(!client.rowCount)return reply.code(400).send({error:'INVALID_INPUT',message:'Client invalide pour ce devis.'});
    // Bloc 11 — création SANS client préexistant : la fiche est créée dans la MÊME transaction
    // que le document (annulation = aucune création partielle). Adresse de facturation composée
    // des seules coordonnées disponibles — jamais une donnée inventée.
    const withNewClient=Boolean(b.newClient&&!b.clientId);
    if(withNewClient){
      b.clientId=null; // résolu à la création, dans la transaction
    }
    let interventionAddressId:string|null=null, interventionAddressSnapshot:string|null=null;
    if(withNewClient){
      interventionAddressSnapshot=String(b.newClient.interventionAddress||composeClientAddress(b.newClient)||'')||null;
    }
    else if(b.clientId){
      const selected=String(b.interventionAddressId||'').trim();
      let addressRow:any=null;
      if(selected){addressRow=(await query(`select id,address from client_intervention_addresses where id=$1 and organization_id=$2 and client_id=$3 and is_active=true`,[selected,org,b.clientId])).rows[0];if(!addressRow)return reply.code(400).send({error:'INVALID_INTERVENTION_ADDRESS',message:'Choisissez une adresse d’intervention active appartenant à ce client.'});}
      else addressRow=(await query(`select id,address from client_intervention_addresses where organization_id=$1 and client_id=$2 and is_active=true order by is_default desc,created_at,id limit 1`,[org,b.clientId])).rows[0];
      if(addressRow){interventionAddressId=addressRow.id;interventionAddressSnapshot=String(addressRow.address||'');}
      else interventionAddressSnapshot=(await query(`select intervention_address from clients where id=$1 and organization_id=$2`,[b.clientId,org])).rows[0]?.intervention_address||null;
    }
    if(!b.allowLoss&&p.belowMinimumPrice)return reply.code(400).send({error:'MARGIN_GUARD',message:'Le prix est inférieur au minimum calculé à partir des coûts directs et du coefficient.',minimumTotalHt:p.minimumSellingHt});

    const documentType=b.documentType==='invoice'?'invoice':'quote';
    const number=await nextNumber(org,documentType==='invoice'?'FAC':'DEV');
    const id=crypto.randomUUID();
    const cgv=(await query('select cgv_text from activities where id=$1 and organization_id=$2',[aid,org])).rows[0]?.cgv_text||null;
    const status=documentType==='invoice'?'issued':'draft';
    const invoiceAddressSource=['client','intervention','free'].includes(String(b.invoiceAddressSource))?String(b.invoiceAddressSource):'client';
    const billingAddress=invoiceAddressSource==='free'
      ?String(b.billingAddress||'').trim()||null
      :(withNewClient
        ?composeClientAddress(b.newClient)
        :(b.clientId
          ?(invoiceAddressSource==='intervention'
            ?(await query('select intervention_address from clients where id=$1 and organization_id=$2',[b.clientId,org])).rows[0]?.intervention_address||null
            :(await query('select address from clients where id=$1 and organization_id=$2',[b.clientId,org])).rows[0]?.address||null)
        :null));
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
        if(withNewClient){
          // Bloc 11 : fiche client + document dans la même transaction — jamais de création partielle.
          b.clientId=await createClientForDocument(clientDb,org,aid,b.newClient);
        }
        await clientDb.query(`insert into quotes(
          id,organization_id,activity_id,client_id,number,document_type,status,intervention,product,
          part_cost,shipping_cost,mileage_km,mileage_rate,mileage_total,mileage_mode,labor_cost,margin,
          vat_rate,urssaf_rate,total_ht,total_tva,total_ttc,final_price_ttc,warranty_text,cgv_snapshot,
          margin_coefficient_percent,coefficient_value,coefficient_unit,coefficient_basis,payment_status,
          invoice_address_source,billing_address_snapshot,due_at,reminder_interval_days,late_penalty_mode,
          late_penalty_value,next_reminder_at,catalog_pricing,structured_invoice,part_coefficient_percent,
          labor_coefficient_percent,mileage_internal_rate,mileage_client_rate,labor_selling_ht,labor_internal_cost_ht,
          purchase_vat_mode,purchase_vat_rate,contribution_snapshot,calculation_snapshot,calculation_version,imei,serial_number,
          einvoice_operation_category,einvoice_vat_on_payment,einvoice_delivery_address,einvoice_buyer_siren,
          ereporting_exempt,ereporting_exempt_reason,activity_category,category_snapshot
        ) values(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
          $26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,
          $53,$54,$55,$56,$57,$58,$59,$60
        )`,[
          id,org,aid,b.clientId,number,documentType,status,String(b.intervention).trim(),summarize(items)||b.product||null,
          rawPart,shippingCost,mileageKm,mileageClientRate,mileageTotal,mileageMode,p.laborHt,p.grossMargin,
          b.vatRate,b.urssafRate,p.totalHt,p.vat,p.totalTtc,targetTtc,b.warrantyText||null,cgv,
          unit==='percent'?selectedValue:0,selectedValue,unit,basis,'unpaid',invoiceAddressSource,billingAddress,b.dueAt||null,
          reminderInterval,['fixed','percent'].includes(String(b.latePenaltyMode))?String(b.latePenaltyMode):'none',Math.max(0,Number(b.latePenaltyValue||0)),null,
          catalogPricing===true,structured,partCoefficient,laborCoefficient,mileageInternalRate,mileageClientRate,laborSellingHt??p.laborSellingHt,laborInternalCostHt,
          purchaseVatMode,b.purchaseVatRate===''||b.purchaseVatRate===undefined?null:Number(b.purchaseVatRate),JSON.stringify(contributions),JSON.stringify(snapshot),2,
          (typeof b.imei==='string'?b.imei.trim().slice(0,80):'')||null,(typeof b.serialNumber==='string'?b.serialNumber.trim().slice(0,160):'')||null,
          einvoiceCategoryInput(b.einvoiceOperationCategory),Boolean(b.einvoiceVatOnPayment),
          (typeof b.einvoiceDeliveryAddress==='string'?b.einvoiceDeliveryAddress.trim().slice(0,500):'')||null,
          einvoiceSirenInput(b.einvoiceBuyerSiren),
          b.ereportingExempt===true,
          ereportingExemptReasonInput(b.ereportingExempt===true,b.ereportingExemptReason),
          b.activityCategory,
          JSON.stringify(buildCategorySnapshot(aid,items,b.activityCategory))
        ]);
        await saveItems(clientDb,id,org,aid,items,partCoefficient,basis,unit,selectedValue);
        await clientDb.query(`update quotes set intervention_address_id=$1::uuid,intervention_address_snapshot=$2 where id=$3 and organization_id=$4`,[interventionAddressId,interventionAddressSnapshot,id,org]);
        // Prompt 06 — instantanés client écrits À LA CRÉATION du document : les corrections
        // ultérieures de la fiche client ne réécrivent jamais un document existant (le rendu
        // lit l'instantané d'abord, repli fiche courante pour les documents antérieurs).
        if(b.clientId){
          const cl=(await clientDb.query('select name,email,phone from clients where id=$1 and organization_id=$2',[b.clientId,org])).rows[0];
          await clientDb.query(`update quotes set client_name_snapshot=$1,client_email_snapshot=$2,client_phone_snapshot=$3 where id=$4 and organization_id=$5`,[cl?.name||null,cl?.email||null,cl?.phone||null,id,org]);
        }
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
      // Bloc 8 — catégories du document et des lignes : valeur inconnue refusée explicitement.
      b.activityCategory=normalizeCategoryInput(b.activityCategory);
      if(Array.isArray(b.items))for(const it of b.items)it.activityCategory=normalizeCategoryInput(it.activityCategory);
    }catch(e:any){return reply.code(400).send({error:'INVALID_INPUT',message:String(e?.message||e)})}

    const cur=(await query('select id,activity_id,client_id,intervention_address_id,intervention_address_snapshot,margin_coefficient_percent,coefficient_value,coefficient_unit,coefficient_basis,payment_status,document_type,catalog_pricing,sent_at,mileage_mode,mileage_km,mileage_rate,mileage_total,mileage_internal_rate,mileage_client_rate,labor_internal_cost_ht,labor_selling_ht,vat_rate,urssaf_rate,shipping_cost,part_cost,final_price_ttc,total_ttc,warranty_text,due_at,purchase_vat_mode,purchase_vat_rate,contribution_snapshot,activity_category from quotes where id=$1 and organization_id=$2',[id,org])).rows[0];
    if(!cur)return reply.code(404).send({error:'NOT_FOUND'});
    // Prompt 07 — immuabilité du document émis AVEC règlements enregistrés : modifier les
    // montants/lignes d'une facture partiellement ou totalement réglée romprait l'allocution
    // des paiements et la comptabilité — refus déterministe ; les corrections passent par les
    // voies auditées existantes (correction de règlement 097). La modification d'une facture
    // envoyée mais NON réglée reste possible (fonctionnalité step14 conservée).
    if(cur.document_type==='invoice'&&cur.payment_status!=='unpaid'){
      return reply.code(409).send({error:'DOCUMENT_LOCKED',message:'Cette facture a des règlements enregistrés : elle n’est plus modifiable. Corrigez via une correction de règlement audité, ou annulez le document (après correction) et rédigez un nouveau document.'});
    }
    if(!b.intervention&&b.intervention!==undefined)return reply.code(400).send({error:'INVALID_INPUT',message:'La prestation est obligatoire.'});
    const currentItems= b.items===undefined
      ?(await query('select label,quantity,unit_cost as "unitCost",unit_price as "unitPrice",part_id as "partId",sale_coefficient_percent as "saleCoefficientPercent",activity_category as "activityCategory" from quote_items where quote_id=$1 order by position',[id])).rows
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
    let nextInterventionAddressId:string|null=cur.intervention_address_id||null,nextInterventionAddressSnapshot:string|null=cur.intervention_address_snapshot||null;
    if(b.interventionAddressId!==undefined||b.clientId!==undefined){
      nextInterventionAddressId=null;nextInterventionAddressSnapshot=null;
      if(clientId){
        const requested=String(b.interventionAddressId||'').trim();
        if(requested){
          const selected=(await query(`select id,address from client_intervention_addresses where id=$1 and organization_id=$2 and client_id=$3 and is_active=true`,[requested,org,clientId])).rows[0];
          if(selected){nextInterventionAddressId=selected.id;nextInterventionAddressSnapshot=String(selected.address||'');}
          else if(cur.client_id===clientId&&requested===String(cur.intervention_address_id||'')){nextInterventionAddressId=cur.intervention_address_id||null;nextInterventionAddressSnapshot=cur.intervention_address_snapshot||null;}
          else return reply.code(400).send({error:'INVALID_INTERVENTION_ADDRESS',message:'Choisissez une adresse d’intervention active appartenant à ce client.'});
        }else{
          const chosen=(await query(`select id,address from client_intervention_addresses where organization_id=$1 and client_id=$2 and is_active=true order by is_default desc,created_at,id limit 1`,[org,clientId])).rows[0];
          if(chosen){nextInterventionAddressId=chosen.id;nextInterventionAddressSnapshot=String(chosen.address||'');}
          else nextInterventionAddressSnapshot=(await query('select intervention_address from clients where id=$1 and organization_id=$2',[clientId,org])).rows[0]?.intervention_address||null;
        }
      }
    }
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
          purchase_vat_mode=$35,purchase_vat_rate=$36,contribution_snapshot=$37,calculation_snapshot=$38,calculation_version=2,
           imei=case when $39::boolean then $40::varchar(80) else imei end,
           serial_number=case when $41::boolean then $42::varchar(160) else serial_number end,
           einvoice_operation_category=case when $43::boolean then $44::varchar(8) else einvoice_operation_category end,
           einvoice_vat_on_payment=case when $45::boolean then $46::boolean else einvoice_vat_on_payment end,
           einvoice_delivery_address=case when $47::boolean then $48::varchar(500) else einvoice_delivery_address end,
           einvoice_buyer_siren=case when $49::boolean then $50::varchar(9) else einvoice_buyer_siren end,
           ereporting_exempt=case when $51::boolean then $52::boolean else ereporting_exempt end,
           ereporting_exempt_reason=case when $53::boolean then $54::varchar(200) else ereporting_exempt_reason end,
           activity_category=case when $57::boolean then $58::varchar(30) else activity_category end,
           category_snapshot=case when $59::boolean then $60::jsonb else category_snapshot end,
           updated_at=now()
          where id=$55::uuid and organization_id=$56::uuid returning *`,[
          b.intervention!==undefined?(String(b.intervention).trim()||null):null,
          summarize(items)||b.product||null,rawPart,shippingCost,mileageKm,mileageClientRate,mileageTotal,mileageMode,p.grossMargin,
          Number(b.vatRate??cur.vat_rate??0),Number(b.urssafRate??cur.urssaf_rate??0),p.totalHt,p.vat,p.totalTtc,targetTtc,b.warrantyText||null,
          unit==='percent'?selectedValue:0,selectedValue,unit,basis,invoiceAddressSource,billingAddress,b.dueAt??cur.due_at??null,reminderInterval,latePenaltyMode,
          b.latePenaltyValue===undefined?null:Number(b.latePenaltyValue||0),clientId,b.catalogPricing===undefined?null:Boolean(catalogPricing),partCoefficient,laborCoefficient,
          mileageInternalRate,mileageClientRate,laborSellingHt??p.laborSellingHt,laborInternalCostHt,purchaseVatMode,purchaseVatRate,JSON.stringify(contributions),JSON.stringify(snapshot),
          b.imei!==undefined,b.imei===undefined?null:(String(b.imei??'').trim().slice(0,80)||null),
          b.serialNumber!==undefined,b.serialNumber===undefined?null:(String(b.serialNumber??'').trim().slice(0,160)||null),
          b.einvoiceOperationCategory!==undefined,einvoiceCategoryInput(b.einvoiceOperationCategory),
          b.einvoiceVatOnPayment!==undefined,Boolean(b.einvoiceVatOnPayment),
          b.einvoiceDeliveryAddress!==undefined,(b.einvoiceDeliveryAddress===undefined?null:(String(b.einvoiceDeliveryAddress??'').trim().slice(0,500)||null)),
          b.einvoiceBuyerSiren!==undefined,einvoiceSirenInput(b.einvoiceBuyerSiren),
          b.ereportingExempt!==undefined,b.ereportingExempt===true,
          b.ereportingExempt!==undefined,ereportingExemptReasonInput(b.ereportingExempt===true,b.ereportingExemptReason),id,org,
          b.activityCategory!==undefined,b.activityCategory,
          b.activityCategory!==undefined||b.items!==undefined,JSON.stringify(buildCategorySnapshot(cur.activity_id,items,b.activityCategory!==undefined?b.activityCategory:cur.activity_category||null))
        ]);
        if(!result.rowCount)throw new AurionError('NOT_FOUND','Document introuvable.');
        await saveItems(clientDb,id,org,cur.activity_id,items,partCoefficient,basis,unit,selectedValue);
        return result.rows[0];
      });
    }catch(e:any){r.log.error({err:e,quoteId:id,documentType:cur.document_type},'quote/invoice update failed');return reply.code(500).send({error:'QUOTE_SAVE_FAILED',message:String(e?.message||'Le devis ou la facture n’a pas pu être enregistré.')});}
    if(b.interventionAddressId!==undefined||b.clientId!==undefined){
      await query('update quotes set intervention_address_id=$1::uuid,intervention_address_snapshot=$2 where id=$3 and organization_id=$4',[nextInterventionAddressId,nextInterventionAddressSnapshot,id,org]);
    }
    return updated;
  });
  app.delete('/quotes/:id',async(r,reply)=>{
    const org=r.auth!.organizationId,id=(r.params as any).id;
    const client=await db.connect();
    let gen:any[]=[];
    try{
      await beginTenant(client);
      const exists=await client.query('select id from quotes where id=$1 and organization_id=$2 for update',[id,org]);
      if(!exists.rowCount){await client.query('rollback');return reply.code(404).send({error:'NOT_FOUND'});}
      // Prompt 08 — la disparition de la cause libère les réservations actives liées au
      // document (réserver n'est pas consommer : les quantités retournent au disponible).
      await releaseQuoteReservations(client,org,id,'Document supprimé');
      gen=(await client.query('select docx_key,odt_key,pdf_key from generated_documents where quote_id=$1 and organization_id=$2',[id,org])).rows;
      // Les métadonnées doivent disparaître avant la facture/le devis (FK ON DELETE SET NULL).
      await client.query('delete from generated_documents where quote_id=$1 and organization_id=$2',[id,org]);
      await client.query('delete from quotes where id=$1 and organization_id=$2',[id,org]);
      await client.query('commit');
    }catch(e){await client.query('rollback').catch(()=>{});throw e;}
    finally{client.release();}
    for(const g of gen)for(const k of [g.docx_key,g.odt_key,g.pdf_key])if(k){try{await deletePrivateObject(k)}catch{}}
    return {ok:true};
  });
  // Prompt 07 — décisions explicites du cycle commercial : acceptation, refus, annulation.
  // Chaque décision est transactionnelle, verrouillée, horodatée sur le document, écrite
  // dans l'historique des statuts (106) et idempotente par refus déterministe (409) si la
  // décision est déjà prise. Aucune transition silencieuse.
  async function recordStatusHistory(exec:SqlExecutor,org:string,documentId:string,fromStatus:string|null,toStatus:string,reason:string|null,actorId:string|null){
    await exec.query(`insert into document_status_history(organization_id,document_id,from_status,to_status,reason,actor_id) values($1,$2,$3,$4,$5,$6)`,[org,documentId,fromStatus,toStatus,reason,actorId]);
  }
  app.post('/quotes/:id/accept',async(r,reply)=>{
    const id=(r.params as any).id,org=r.auth!.organizationId;
    const outcome=await withTransaction(async client=>{
      const q=(await client.query(`select id,status,document_type,accepted_at from quotes where id=$1 and organization_id=$2 for update`,[id,org])).rows[0];
      if(!q)return {ok:false as const,status:404,error:'NOT_FOUND',message:'Document introuvable.'};
      if(q.document_type!=='quote')return {ok:false as const,status:409,error:'NOT_A_QUOTE',message:'Seul un devis peut être accepté.'};
      if(q.accepted_at||['accepted','rejected','expired','canceled','cancelled','annulé','annule','void','deleted'].includes(String(q.status||'').toLowerCase()))return {ok:false as const,status:409,error:'ALREADY_CLOSED',message:'Ce devis est déjà clos (accepté, refusé, expiré ou annulé).'};
      await client.query(`update quotes set status='accepted',accepted_at=now(),updated_at=now() where id=$1 and organization_id=$2`,[id,org]);
      await recordStatusHistory(client,org,id,q.status??null,'accepted',null,r.auth!.userId);
      return {ok:true as const,status:'accepted'};
    });
    if(!outcome.ok)return reply.code(outcome.status).send({error:outcome.error,message:outcome.message});
    return {ok:true,status:'accepted',note:'Devis accepté : la conversion en facture reste une action explicite.'};
  });
  app.post('/quotes/:id/reject',async(r,reply)=>{
    const id=(r.params as any).id,org=r.auth!.organizationId;
    const reason=String((r.body as any)?.reason||'').trim().slice(0,400)||null;
    const outcome=await withTransaction(async client=>{
      const q=(await client.query(`select id,status,document_type,rejected_at from quotes where id=$1 and organization_id=$2 for update`,[id,org])).rows[0];
      if(!q)return {ok:false as const,status:404,error:'NOT_FOUND',message:'Document introuvable.'};
      if(q.document_type!=='quote')return {ok:false as const,status:409,error:'NOT_A_QUOTE',message:'Seul un devis peut être refusé.'};
      if(q.rejected_at||['accepted','rejected','expired','canceled','cancelled','annulé','annule','void','deleted'].includes(String(q.status||'').toLowerCase()))return {ok:false as const,status:409,error:'ALREADY_CLOSED',message:'Ce devis est déjà clos (accepté, refusé, expiré ou annulé).'};
      await client.query(`update quotes set status='rejected',rejected_at=now(),rejection_reason=$3,updated_at=now() where id=$1 and organization_id=$2`,[id,org,reason]);
      await recordStatusHistory(client,org,id,q.status??null,'rejected',reason,r.auth!.userId);
      return {ok:true as const,status:'rejected'};
    });
    if(!outcome.ok)return reply.code(outcome.status).send({error:outcome.error,message:outcome.message});
    return {ok:true,status:'rejected',note:'Devis refusé : il est exclu des totaux de devis ouverts, l\u2019historique est conservé.'};
  });
  app.post('/quotes/:id/cancel',async(r,reply)=>{
    const id=(r.params as any).id,org=r.auth!.organizationId;
    const reason=String((r.body as any)?.reason||'').trim().slice(0,400)||null;
    const outcome=await withTransaction(async client=>{
      const q=(await client.query(`select id,status,document_type,payment_status,amount_paid,canceled_at from quotes where id=$1 and organization_id=$2 for update`,[id,org])).rows[0];
      if(!q)return {ok:false as const,status:404,error:'NOT_FOUND',message:'Document introuvable.'};
      if(q.canceled_at||['canceled','cancelled','annulé','annule','void','deleted'].includes(String(q.status||'').toLowerCase()))return {ok:false as const,status:409,error:'ALREADY_CANCELED',message:'Ce document est déjà annulé.'};
      // Une facture avec règlements enregistrés n'est jamais annulée silencieusement :
      // les corrections passent par la correction de règlement audité (bloc 11).
      if(q.document_type==='invoice'&&(Number(q.amount_paid||0)>0||q.payment_status!=='unpaid')){
        return {ok:false as const,status:409,error:'HAS_PAYMENTS',message:'Cette facture a des règlements enregistrés : annulez d\u2019abord les règlements via une correction auditée, puis annulez le document.'};
      }
      if(q.document_type==='quote'&&['accepted'].includes(String(q.status||'').toLowerCase())){
        return {ok:false as const,status:409,error:'QUOTE_ACCEPTED',message:'Ce devis est accepté : convertissez-le en facture ou rouvrez la décision avant annulation.'};
      }
      await client.query(`update quotes set status='canceled',canceled_at=now(),canceled_reason=$3,updated_at=now() where id=$1 and organization_id=$2`,[id,org,reason]);
      await recordStatusHistory(client,org,id,q.status??null,'canceled',reason,r.auth!.userId);
      await releaseQuoteReservations(client,org,id,'Document annulé');
      if(q.document_type==='invoice'){
        await client.query(`update payment_links set status='cancelled',updated_at=now() where invoice_id=$1 and organization_id=$2 and status in ('active','partially_paid')`,[id,org]);
      }
      return {ok:true as const,status:'canceled',documentType:q.document_type};
    });
    if(!outcome.ok)return reply.code(outcome.status).send({error:outcome.error,message:outcome.message});
    return {ok:true,status:'canceled',note:'Document annulé : réservations liées libérées, liens de paiement invalidés le cas échéant, historique conservé.'};
  });
  // 15.4.53 (PROMPT C2) — contexte de mentions d'une facture : même construction que l'aperçu
  // paramètres (routes/settings.ts) et le rendu PDF (document-renderer), pour que la porte
  // bloquante et l'affichage ne divergent jamais. La première activité sert de repli si le
  // document n'a pas d'activité (même convention que /documents/check-mentions).
  async function invoiceMentionContext(org: string, activityId: string | null) {
    const a = (await query(
      `select a.*,o.siret,o.siren,(select profile_code from activity_profile_overrides where activity_id=a.id) profile_override
       from activities a join organizations o on o.id=a.organization_id
       where a.organization_id=$1 and ($2::uuid is null or a.id=$2) order by a.created_at limit 1`,
      [org, activityId],
    )).rows[0];
    if (!a) throw new AurionError('NOT_FOUND', 'Activité introuvable : impossible de déterminer les mentions légales.');
    const profile = profileFor(a.name, a.description || '', a.profile_override);
    return { kind: 'invoice' as const, profileCode: profile.code, company: { name: await companyDisplayName(org, a.id), siret: a.siret, siren: a.siren }, activity: a };
  }

  app.post('/quotes/:id/invoice',async(r,reply)=>{
    const parsedBody=invoiceConversionInputSchema.safeParse(r.body||{});
    if(!parsedBody.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const id=(r.params as any).id,org=r.auth!.organizationId,b:any=parsedBody.data;
    const initial=(await query('select document_type,activity_id from quotes where id=$1 and organization_id=$2',[id,org])).rows[0];
    if(!initial)return reply.code(404).send({error:'NOT_FOUND'});
    if(initial.document_type==='invoice')return reply.code(409).send({error:'ALREADY_INVOICE',message:'Ce document est déjà une facture.'});
    const dueAt=b.dueAt?String(b.dueAt):null;if(!dueAt)return reply.code(400).send({error:'INVALID_INPUT',message:'Une échéance de paiement est obligatoire pour activer les relances.'});
    if(!isValidDateOnly(dueAt))return reply.code(400).send({error:'INVALID_INPUT',message:'Échéance de paiement invalide.'});
    const rawInterval=Number(String(b.reminderIntervalDays??0).replace(',','.'));
    if(!Number.isInteger(rawInterval)||rawInterval<0)return reply.code(400).send({error:'INVALID_INPUT',message:'L’intervalle de relance doit être un nombre entier positif.'});
    const reminderInterval=Math.min(365,rawInterval);
    const invoiceAddressSource=['client','intervention','free'].includes(String(b.invoiceAddressSource))?String(b.invoiceAddressSource):'client';
    const freeBillingAddress=String(b.billingAddress||'').trim()||null;
    if(invoiceAddressSource==='free'&&!freeBillingAddress)return reply.code(400).send({error:'INVALID_INPUT',message:'Saisissez une adresse de facturation libre.'});
    // 15.4.53 (PROMPT C2) + 15.4.54 — porte des mentions obligatoires : seules les mentions
    // « needs_confirmation » BLOQUANTES (SIRET/SIREN, assurance des métiers travaux) refusent
    // l'émission AVANT toute écriture. Le médiateur de la consommation n'est plus bloquant
    // (choix produit 15.4.54) : il reste configurable dans Paramètres et signalé en rappel.
    // Aurion n'invente jamais une valeur juridique : les documents émis avant 15.4.53 ne sont
    // pas re-contrôlés (grandfathering documenté).
    const mentionCtx=await invoiceMentionContext(org,initial.activity_id);
    const invoiceMentions=computeMentions(mentionCtx);
    const mentionGaps=blockingMentionGaps(invoiceMentions);
    if(mentionGaps.length)return reply.code(422).send({error:'MENTIONS_INCOMPLETES',message:'Émission impossible : des mentions obligatoires ne sont pas renseignées — Aurion ne les invente pas.',gaps:mentionGaps.map(m=>({key:m.key,note:m.note})),help:'Complétez dans Paramètres → Identité légale / Mentions légales (référentiel : docs/MENTIONS-OBLIGATOIRES.md).'});
    // 15.4.51 (PROMPT B2) — garde-fou de dérive devis→facture : si l'interface transmet les
    // rubriques comparées, la dérive est recalculée côté serveur (source de vérité, seuil 10 %)
    // ; au-delà, une justification explicite est exigée, horodatée et conservée (migration 119).
    const quoteRubrics=Array.isArray(b.quoteRubrics)?b.quoteRubrics as DeviationRubric[]:null;
    const invoiceRubrics=Array.isArray(b.invoiceRubrics)?b.invoiceRubrics as DeviationRubric[]:null;
    const justification=String(b.deviationJustification||'').trim();
    if(quoteRubrics&&invoiceRubrics){
      const deviationResult=detectDeviation(quoteRubrics,invoiceRubrics);
      if(deviationResult.requiresJustification&&!justification)return reply.code(422).send({error:'DEVIATION_JUSTIFICATION_REQUIRED',message:'La facture s’écarte du devis au-delà du seuil (10 %) : indiquez une justification avant l’émission.',deviation:deviationResult});
    }
    const mentionsSnapshot=JSON.stringify(invoiceMentions);
    const converted=await withTransaction(async client=>{
      const current=(await client.query('select id,client_id,activity_id,document_type from quotes where id=$1 and organization_id=$2 for update',[id,org])).rows[0];
      if(!current)return {ok:false as const,status:404,error:'NOT_FOUND',message:'Devis introuvable.'};
      if(current.document_type==='invoice')return {ok:false as const,status:409,error:'ALREADY_INVOICE',message:'Ce document est déjà une facture.'};
      const billingAddress=invoiceAddressSource==='free'
        ?freeBillingAddress
        :(current.client_id
          ?(await client.query(`select ${invoiceAddressSource==='intervention'?'intervention_address':'address'} from clients where id=$1 and organization_id=$2`,[current.client_id,org])).rows[0]?.[invoiceAddressSource==='intervention'?'intervention_address':'address']||null
          :null);
      const number=await nextNumber(org,'FAC',client);
      // La facture ne doit pas hériter du sent_at du devis : elle n'a pas encore été envoyée.
      // emailDocument() (ou l'action d'envoi explicite) renseignera sent_at après un envoi réel.
      const updated=await client.query("update quotes set document_type='invoice',status='issued',number=$1,payment_status='unpaid',amount_paid=0,paid_at=null,sent_at=null,invoice_address_source=$2,billing_address_snapshot=$3,due_at=$4::date,reminder_interval_days=$5::int,next_reminder_at=case when $5::int > 0 then ($4::date + interval '1 day')::timestamptz else null end,updated_at=now() where id=$6::uuid and organization_id=$7::uuid and document_type<>'invoice' returning id",[number,invoiceAddressSource,billingAddress,dueAt,reminderInterval,id,org]);
      if(!updated.rowCount)return {ok:false as const,status:409,error:'ALREADY_INVOICE',message:'Ce document a déjà été converti en facture.'};
      // 15.4.51/53 — preuves d'émission, dans la même transaction que la conversion :
      // justification de dérive horodatée (si fournie), rubriques comparées, instantané des
      // mentions appliquées (reproductibilité du document même si les paramètres évoluent).
      if(justification)await client.query('update quotes set deviation_justification=$1,deviation_justified_at=now(),deviation_rubrics=$2::jsonb where id=$3 and organization_id=$4',[justification,(quoteRubrics&&invoiceRubrics)?JSON.stringify({quote:quoteRubrics,invoice:invoiceRubrics}):null,id,org]);
      await client.query('update quotes set mentions_snapshot=$1::jsonb where id=$2 and organization_id=$3',[mentionsSnapshot,id,org]);
      return {ok:true as const,number,clientId:current.client_id,activityId:current.activity_id};
    });
    if(!converted.ok)return reply.code(converted.status).send({error:converted.error,message:converted.message});
    // 15.4.51 (PROMPT B3) — maillon de chaîne d'intégrité de la facture émise : empreinte du
    // CONTENU CANONIQUE (identifiant, numéro, client, totaux, lignes, échéance), append-only,
    // idempotent (clé unique par document). L'émission reste validée même si l'écriture du
    // maillon échoue : l'échec est signalé dans la réponse et journalisé pour exploitation.
    let integrityRecorded=true;
    try{
      const emitted=(await query(`select id,number,client_id,total_ht,total_vat,total_ttc,due_at::text as due_at from quotes where id=$1 and organization_id=$2`,[id,org])).rows[0];
      const items=(await query('select label,quantity,unit_price from quote_items where quote_id=$1 order by position',[id])).rows;
      const sha=sha256Hex(canonicalInvoiceContent({documentId:String(emitted.id),number:String(emitted.number),clientId:emitted.client_id?String(emitted.client_id):null,totalHt:emitted.total_ht,totalVat:emitted.total_vat,totalTtc:emitted.total_ttc,dueAt:emitted.due_at,items:items.map((x:any)=>({label:String(x.label||''),quantity:x.quantity,unitPrice:x.unit_price}))}));
      await recordDocumentIntegrity(sqlExecutor,org,id,'invoice',String(emitted.number),sha);
    }catch(e:any){
      integrityRecorded=false;
      r.log.error({err:String(e?.message||e),documentId:id},'integrity chain record failed after emission');
    }
    if(converted.clientId&&converted.activityId)await resumeClientTimer(org,r.auth!.userId,converted.clientId,converted.activityId);
    const emailStatus=b.sendEmail!==false?await emailDocument(org,id,'invoice',converted.number,converted.clientId):'not_requested';
    if(emailStatus==='sent'&&converted.clientId)await stopClientTimer(org,r.auth!.userId,converted.clientId);
    return {number:converted.number,emailStatus,integrityRecorded};
  });
  app.get('/invoices/:id/installments',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const q=(await query("select id,number,total_ttc from quotes where id=$1 and organization_id=$2 and document_type='invoice'",[id,org])).rows[0];if(!q)return reply.code(404).send({error:'NOT_FOUND'});return {invoice:q,installments:(await query('select id,installment_number,due_at,amount_due,amount_paid,status from invoice_installments where quote_id=$1 and organization_id=$2 order by installment_number',[id,org])).rows};});
  app.post('/invoices/:id/installments',async(r,reply)=>{
    const id=String((r.params as any).id),org=r.auth!.organizationId,b:any=r.body||{};
    const outcome=await withTransaction(async client=>{
      const q=(await client.query("select id,total_ttc,amount_paid,payment_status from quotes where id=$1 and organization_id=$2 and document_type='invoice' for update",[id,org])).rows[0];
      if(!q)return {ok:false as const,status:404,error:'NOT_FOUND',message:'Facture introuvable.'};
      // Bloc 1 — une facture entièrement réglée n'accepte plus d'échéancier actif : refus déterministe.
      if(q.payment_status==='paid')return {ok:false as const,status:409,error:'ALREADY_PAID',message:'Cette facture est déjà entièrement réglée : plus d\'échéancier à planifier.'};
      let plan:ReturnType<typeof buildInstallmentPlan>;
      try{
        plan=buildInstallmentPlan(Number(q.total_ttc||0),{
          installments:Array.isArray(b.installments)?b.installments:undefined,
          count:b.count,startDate:b.startDate,intervalDays:b.intervalDays,
        });
      }catch(error:any){
        const code=String(error?.message||'INVALID_INSTALLMENT_PLAN');
        const message=code==='INSTALLMENTS_TOTAL_MISMATCH'
          ?`L’échéancier doit totaliser ${Number(q.total_ttc||0).toFixed(2)} €.`
          :code==='INSTALLMENT_LIMIT'
            ?'Un échéancier ne peut pas dépasser 120 échéances.'
            :'Vérifiez le nombre, les dates et les montants de chaque échéance.';
        return {ok:false as const,status:400,error:code,message};
      }
      const paidPrincipal=Math.min(Number(q.total_ttc||0),Number(q.amount_paid||0));
      const allocated=allocateInstallmentPayments(plan,paidPrincipal);
      await client.query('delete from invoice_installments where quote_id=$1 and organization_id=$2',[id,org]);
      for(const row of allocated){
        await client.query('insert into invoice_installments(organization_id,quote_id,installment_number,due_at,amount_due,amount_paid,status) values($1,$2,$3,$4::date,$5,$6,$7)',[org,id,row.number,row.dueAt,row.amount,row.amountPaid,row.status]);
      }
      const installments=(await client.query('select id,installment_number,due_at,amount_due,amount_paid,status from invoice_installments where quote_id=$1 and organization_id=$2 order by installment_number',[id,org])).rows;
      return {ok:true as const,installments};
    });
    if(!outcome.ok)return reply.code(outcome.status).send({error:outcome.error,message:outcome.message});
    return {ok:true,installments:outcome.installments};
  });
  app.get('/invoices/:id/payments',async(r,reply)=>{
    const id=String((r.params as any).id),org=r.auth!.organizationId;
    const invoice=(await query("select id,number,total_ttc,payment_status,amount_paid,coalesce((select sum(penalty_amount) from invoice_reminders ir where ir.quote_id=quotes.id),0)::numeric total_penalty_amount from quotes where id=$1 and organization_id=$2 and document_type='invoice'",[id,org])).rows[0];
    if(!invoice)return reply.code(404).send({error:'NOT_FOUND'});
    const payments=(await query('select id,amount,payment_method,paid_at,reference,note from invoice_payments where quote_id=$1 and organization_id=$2 order by paid_at desc',[id,org])).rows;
    return {invoice,payments};
  });
  app.post('/invoices/:id/payments',async(r,reply)=>{
    const parsedBody=invoicePaymentInputSchema.safeParse(r.body||{});
    if(!parsedBody.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const id=String((r.params as any).id),org=r.auth!.organizationId,b:any=parsedBody.data;
    const amount=Math.round(Number(String(b.amount??'').replace(',','.'))*100)/100;
    if(!Number.isFinite(amount)||amount<=0)return reply.code(400).send({error:'INVALID_INPUT',message:'Le montant du règlement doit être supérieur à zéro.'});
    const method=String(b.paymentMethod||'');
    if(!['transfer','card','cash','cheque','crypto'].includes(method))return reply.code(400).send({error:'INVALID_INPUT',message:'Choisissez un mode de paiement valide : espèces, chèque, carte, virement ou crypto.'});
    let paidAt:Date;
    try{paidAt=normalizePaymentDate(b.paidAt)}catch{return reply.code(400).send({error:'INVALID_INPUT',message:'La date du règlement est invalide ou située dans le futur.'});}
    const reference=b.reference?String(b.reference).trim().slice(0,160)||null:null;
    const note=b.note?String(b.note).trim().slice(0,2000)||null:null;
    const paymentId=crypto.randomUUID();
    // Bloc 11 — verrou de période : aucune écriture de règlement sur un exercice clôturé.
    await assertPeriodOpen(org,paidAt);
    try{
      const outcome=await withTransaction(async client=>{
        const q=(await client.query(`select q.id,q.number,q.total_ttc,q.amount_paid,
            coalesce(q.activity_id,(select a.id from activities a where a.organization_id=q.organization_id and a.active=true order by a.created_at limit 1)) activity_id
          from quotes q where q.id=$1 and q.organization_id=$2 and q.document_type='invoice' for update of q`,[id,org])).rows[0];
        if(!q)return {ok:false as const,status:404,error:'NOT_FOUND',message:'Facture introuvable.'};
        if(!q.activity_id)return {ok:false as const,status:400,error:'INVALID_INPUT',message:'Aucune activité valide n’est associée à cette facture.'};
        const penaltyRow=(await client.query('select coalesce(sum(penalty_amount),0) total from invoice_reminders where quote_id=$1 and organization_id=$2',[id,org])).rows[0];
        let calculation:ReturnType<typeof calculateInvoicePayment>;
        try{calculation=calculateInvoicePayment(Number(q.total_ttc||0),Number(penaltyRow?.total||0),Number(q.amount_paid||0),amount)}catch(error:any){
          const code=String(error?.message||'INVALID_PAYMENT_AMOUNT');
          const alreadyPaid=code==='INVOICE_ALREADY_PAID';
          return {ok:false as const,status:alreadyPaid?409:400,error:alreadyPaid?'ALREADY_PAID':code,message:alreadyPaid?'Cette facture est déjà entièrement payée.':code==='PAYMENT_TOO_HIGH'?`Montant restant : ${Math.max(0,Number(q.total_ttc||0)+Number(penaltyRow?.total||0)-Number(q.amount_paid||0)).toFixed(2)} €.`:'Le montant du règlement est invalide.'};
        }
        await client.query('insert into invoice_payments(id,organization_id,quote_id,amount,payment_method,paid_at,reference,note) values($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::varchar(20),$6::timestamptz,$7::varchar(160),$8::text)',[paymentId,org,id,calculation.amount,method,paidAt,reference,note]);
        const installments=(await client.query('select id,amount_due,amount_paid from invoice_installments where quote_id=$1 and organization_id=$2 and amount_paid<amount_due order by installment_number for update',[id,org])).rows;
        let remainingPayment=calculation.amount;
        for(const row of installments){
          if(remainingPayment<=0)break;
          const due=Math.max(0,Number(row.amount_due)-Number(row.amount_paid));
          const applied=Math.min(due,remainingPayment);
          const nextPaid=Math.round((Number(row.amount_paid)+applied)*100)/100;
          await client.query("update invoice_installments set amount_paid=$1,status=$2,updated_at=now() where id=$3 and organization_id=$4",[nextPaid,nextPaid+0.005>=Number(row.amount_due)?'paid':'partially_paid',row.id,org]);
          remainingPayment=Math.round((remainingPayment-applied)*100)/100;
        }
        await client.query("update quotes set amount_paid=$1::numeric,payment_status=$2::varchar(20),paid_at=case when $2::varchar(20)='paid' then $3::timestamptz else paid_at end,status=case when $2::varchar(20)='paid' then 'paid' else status end,next_reminder_at=case when $2::varchar(20)='paid' then null else next_reminder_at end,updated_at=now() where id=$4::uuid and organization_id=$5::uuid",[calculation.paidAmount,calculation.status,paidAt,id,org]);
        await client.query("insert into accounting_entries(organization_id,activity_id,entry_type,amount,entry_date,source_id,label) values($1::uuid,$2::uuid,'payment',$3::numeric,($4::timestamptz)::date,$5::uuid,$6::varchar(240))",[org,q.activity_id,calculation.amount,paidAt,paymentId,`Paiement facture ${q.number}`]);
        return {ok:true as const,calculation};
      });
      if(!outcome.ok)return reply.code(outcome.status).send({error:outcome.error,message:outcome.message});
      return reply.code(201).send({id:paymentId,...outcome.calculation});
    }catch(error:any){
      r.log.error({err:error,invoiceId:id},'invoice payment transaction failed');
      return reply.code(500).send({error:'PAYMENT_SAVE_FAILED',message:'Le règlement et son écriture comptable n’ont pas pu être enregistrés.'});
    }
  });
  // Bloc 11 — correction d'un règlement : annulation TRACÉE (copie intégrale conservée dans
  // payment_corrections, motif obligatoire, acteur identifié). Jamais silencieuse : interdite
  // sur un exercice clôturé et sur un règlement rapproché (annuler d'abord le rapprochement).
  app.delete('/invoices/:id/payments/:paymentId',async(r,reply)=>{
    const id=String((r.params as any).id),paymentId=String((r.params as any).paymentId),org=r.auth!.organizationId;
    const reason=String((r.body as any)?.reason||'').trim().slice(0,400);
    if(!reason)return reply.code(400).send({error:'REASON_REQUIRED',message:'Indiquez le motif de la correction : elle est conservée dans l\'audit.'});
    if(await paymentReconciled(org,paymentId))return reply.code(409).send({error:'PAYMENT_RECONCILED',message:'Ce règlement est rapproché avec une opération bancaire : annulez d\'abord le rapprochement, puis corrigez.'});
    try{
      const outcome=await withTransaction(async client=>{
        const payment=(await client.query(`select p.*,q.number invoice_number,q.total_ttc,q.activity_id from invoice_payments p join quotes q on q.id=p.quote_id where p.id=$1 and p.quote_id=$2 and p.organization_id=$3 for update of p`,[paymentId,id,org])).rows[0];
        if(!payment)return {ok:false as const,status:404,error:'NOT_FOUND',message:'Règlement introuvable pour cette facture.'};
        const paidAt=new Date(payment.paid_at);
        const closed=(await client.query(`select 1 from accounting_closed_periods where organization_id=$1 and period_year=$2 and reopened_at is null`,[org,paidAt.getUTCFullYear()])).rows[0];
        if(closed)return {ok:false as const,status:409,error:'PERIOD_CLOSED',message:`L'exercice ${paidAt.getUTCFullYear()} est clôturé : rouvrez explicitement la période avant toute correction.`};
        const entries=(await client.query(`select id,organization_id,activity_id,entry_type,amount,entry_date,source_id,label from accounting_entries where source_id=$1 and organization_id=$2 and voided_at is null`,[paymentId,org])).rows;
        // Écritures associées retirées du périmètre actif (copie conservée dans l'audit).
        await client.query(`update accounting_entries set voided_at=now() where source_id=$1 and organization_id=$2 and voided_at is null`,[paymentId,org]);
        await client.query(`delete from invoice_payments where id=$1 and organization_id=$2`,[paymentId,org]);
        // Recalcul déterministe de l'état de la facture (même règle que l'encaissement initial).
        const remaining=(await client.query(`select coalesce(sum(amount),0) paid from invoice_payments where quote_id=$1 and organization_id=$2`,[id,org])).rows[0];
        const penalties=Number((await client.query('select coalesce(sum(penalty_amount),0) total from invoice_reminders where quote_id=$1 and organization_id=$2',[id,org])).rows[0]?.total||0);
        const paidAmount=Math.min(Number(payment.total_ttc||0),Number(remaining?.paid||0));
        const status=paidAmount+0.005>=Number(payment.total_ttc||0)+penalties?'paid':paidAmount>0?'partially_paid':'unpaid';
        const lastPaid=(await client.query(`select max(paid_at) last from invoice_payments where quote_id=$1 and organization_id=$2`,[id,org])).rows[0]?.last||null;
        await client.query(`update quotes set amount_paid=$1,payment_status=$2,paid_at=case when $2='paid' then $3 else null end,status=case when $2='paid' then 'paid' when $2='unpaid' then 'issued' else status end,next_reminder_at=case when $2='paid' then null else next_reminder_at end,updated_at=now() where id=$4 and organization_id=$5`,[paidAmount,status,status==='paid'?lastPaid:id,org]);
        // Recalcul de la ventilation des échéanciers sur les règlements restants (même logique
        // que la création : allocation chronologique du total réglé).
        const installments=(await client.query(`select id,amount_due,amount_paid from invoice_installments where quote_id=$1 and organization_id=$2 order by installment_number for update`,[id,org])).rows;
        if(installments.length){
          const allocated=allocateInstallmentPayments(installments.map((row:any,index:number)=>({number:index+1,dueAt:String(row.amount_due),amount:Number(row.amount_due)})),paidAmount);
          for(let i=0;i<allocated.length;i++){
            const row=allocated[i],dbRow=installments[i];
            await client.query(`update invoice_installments set amount_paid=$1,status=$2,updated_at=now() where id=$3 and organization_id=$4`,[row.amountPaid,row.amountPaid+0.005>=Number(dbRow.amount_due)?'paid':'partially_paid',dbRow.id,org]);
          }
        }
        await client.query(`insert into payment_corrections(organization_id,invoice_id,payment_id,payment_payload,accounting_entry_id,accounting_entry_payload,reason,actor_id)
          values($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8)`,[org,id,paymentId,JSON.stringify(payment),entries[0]?.id??null,entries.length?JSON.stringify(entries):null,reason,r.auth!.userId]);
        return {ok:true as const,paidAmount,status};
      });
      if(!outcome.ok)return reply.code(outcome.status).send({error:outcome.error,message:outcome.message});
      return {ok:true,paidAmount:outcome.paidAmount,paymentStatus:outcome.status,note:'Correction enregistrée et auditée : la copie du règlement supprimé et de son écriture est conservée (payment_corrections).'};
    }catch(error:any){
      r.log.error({err:error,invoiceId:id,paymentId},'payment correction failed');
      return reply.code(500).send({error:'PAYMENT_CORRECTION_FAILED',message:'La correction n\'a pas pu être enregistrée : aucune modification partielle n\'a été appliquée.'});
    }
  });
  // Bloc 11 — gestion du verrou de période : clôture et ROUVERTURE explicites, toutes deux
  // actions humaines auditables (la liste renvoie l'état réel de chaque exercice).
  app.get('/accounting/periods',async r=>{
    const org=r.auth!.organizationId;
    const rows=(await query(`select period_year as "periodYear",closed_at as "closedAt",closed_by as "closedBy",note,reopened_at as "reopenedAt",reopened_by as "reopenedBy" from accounting_closed_periods where organization_id=$1 order by period_year desc`,[org])).rows;
    return {periods:rows.map((p:any)=>({...p,locked:p.reopenedAt==null}))};
  });
  app.post('/accounting/periods/:year/close',async(r,reply)=>{
    const org=r.auth!.organizationId,year=Number((r.params as any).year);
    if(!Number.isInteger(year)||year<2000||year>2100)return reply.code(400).send({error:'INVALID_INPUT'});
    if(year>(new Date()).getFullYear())return reply.code(400).send({error:'INVALID_INPUT',message:'Impossible de clôturer un exercice futur.'});
    const note=String((r.body as any)?.note||'').slice(0,400)||null;
    await query(`insert into accounting_closed_periods(organization_id,period_year,closed_by,note) values($1,$2,$3,$4)
      on conflict (organization_id,period_year) do update set closed_by=$3,note=$4,reopened_at=null,reopened_by=null`,[org,year,r.auth!.userId,note]);
    // Prompt 05 — opération sensible : un événement est publié dans l'outbox (livraison au
    // journal par le worker). Clé unique par occurrence de clôture : chaque clôture après
    // rouverture est un événement distinct et légitime.
    await publishInTransaction({query},org,{type:'accounting_period_closed',idempotencyKey:`period-closed:${year}:${crypto.randomUUID()}`,actorId:r.auth!.userId,sourceEntityType:'accounting_period',sourceEntityId:null,correlationId:String(year),payload:{title:`Exercice ${year} clôturé`,description:'Toute nouvelle écriture comptable métier sur cet exercice est refusée (409 PERIOD_CLOSED). La rouverture reste une action explicite.',severity:'info'}});
    return {ok:true,periodYear:year,locked:true,note:'Toute nouvelle écriture comptable métier sur cet exercice est refusée (409 PERIOD_CLOSED).'};
  });
  app.post('/accounting/periods/:year/reopen',async(r,reply)=>{
    const org=r.auth!.organizationId,year=Number((r.params as any).year);
    if(!Number.isInteger(year)||year<2000||year>2100)return reply.code(400).send({error:'INVALID_INPUT'});
    const x=await query(`update accounting_closed_periods set reopened_at=now(),reopened_by=$3 where organization_id=$1 and period_year=$2 and reopened_at is null returning id`,[org,year,r.auth!.userId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND',message:'Aucune clôture active pour cet exercice.'});
    await publishInTransaction({query},org,{type:'accounting_period_reopened',idempotencyKey:`period-reopened:${year}:${crypto.randomUUID()}`,actorId:r.auth!.userId,sourceEntityType:'accounting_period',sourceEntityId:null,correlationId:String(year),payload:{title:`Exercice ${year} rouvert`,description:'Les corrections redeviennent possibles et restent auditées.',severity:'warning'}});
    return {ok:true,periodYear:year,locked:false,note:'Exercice rouvert : les corrections deviennent possibles et sont auditées.'};
  });
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
    const d=await renderDocument(org,id,'invoice');const pdf=await readPrivateObject(d.keys.pdf);
    const labels=['','1ère relance','2e relance','3e relance','4e relance'];const label=labels[next]||`${next}e relance`;
    const previousPenalties=Number((await query('select coalesce(sum(penalty_amount),0) total from invoice_reminders where quote_id=$1 and organization_id=$2',[id,org])).rows[0]?.total||0);
    const reminderAmount=reminderTotal(Number(q.total_ttc||0),previousPenalties,penalty);
    // Bloc 13 — lien de paiement dans la relance UNIQUEMENT si l'utilisateur le demande
    // explicitement (includePaymentLink:true) et qu'un lien actif existe ; aucune relance
    // automatique n'est envoyée sans validation utilisateur (cadence inchangée).
    let payLinkLine='';
    if(b.includePaymentLink===true){
      const payNotConfigured=!paymentsConfigured();
      if(payNotConfigured)return reply.code(503).send({error:'PAY_NOT_CONFIGURED',message:'Paiement en ligne non opérationnel (décision D3 en attente) : relance sans lien de paiement.'});
      const activeLink=(await query("select link_token from payment_links where organization_id=$1 and invoice_id=$2 and status in ('active','partially_paid') order by created_at desc limit 1",[org,id])).rows[0];
      if(activeLink)payLinkLine=`\nRèglement en ligne : ${config.APP_BASE_URL}/payments/webhook/${activeLink.link_token}`;
    }
    const text=`Bonjour ${q.client_name||''},\n\nVeuillez trouver votre facture ${q.number}, ${label.toLowerCase()}.\nMontant TTC de la relance précédente : ${Number(q.total_ttc||0)+previousPenalties > 0 ? (Number(q.total_ttc||0)+previousPenalties).toFixed(2) : Number(q.total_ttc||0).toFixed(2)} €.${penalty?`\nNouvelle majoration : ${penalty.toFixed(2)} €.\nNouveau total TTC : ${reminderAmount.toFixed(2)} €.`:''}${payLinkLine}\n\nCordialement,\n${q.company_name||'Aurion'}`;
    try{await sendOrgMail(org,{to:q.client_email,subject:`Facture ${q.number} · ${label}`,text,attachments:[{filename:`${q.number}-${next}e-relance.pdf`,content:pdf}]});}catch(e:any){return reply.code(502).send({error:'MAIL_FAILED',message:String(e?.message||e)});}
    await query('insert into invoice_reminders(organization_id,quote_id,reminder_number,penalty_amount,created_by) values($1,$2,$3,$4,$5)',[org,id,next,penalty,r.auth!.userId]);
    const intervalDays=Math.min(365,Math.max(0,Number(q.reminder_interval_days??0)));const nextAt=next<3&&intervalDays>0?new Date(Date.now()+intervalDays*86400000):null;
    await query('update quotes set reminder_count=$1,last_reminder_at=now(),next_reminder_at=$2,updated_at=now() where id=$3 and organization_id=$4',[next,nextAt,id,org]);
    return {ok:true,reminderNumber:next,penaltyAmount:penalty};
  });
  app.post('/time-metrics/reset',async(r,reply)=>{
    const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));
    // Une remise à zéro sans activité supprimait l'historique de TOUTES les activités de
    // l'organisation. Elle est désormais refusée dès qu'il existe plusieurs activités :
    // l'interface transmet l'activité affichée et la suppression reste strictement bornée.
    if(!aid){
      const count=Number((await query('select count(*)::int n from activities where organization_id=$1',[org])).rows[0]?.n||0);
      if(count>1)return reply.code(400).send({error:'ACTIVITY_REQUIRED',message:'La remise à zéro doit viser une activité précise. Sélectionnez l’activité affichée et réessayez.'});
    }
    if(aid)await query('delete from client_time_sessions where organization_id=$1 and activity_id=$2',[org,aid]);
    else await query('delete from client_time_sessions where organization_id=$1',[org]);
    return {ok:true,activityId:aid};
  });
  app.get('/time-metrics',async r=>{
    const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));
    const totals=(await query(`select coalesce(sum(manual_minutes),0) manual_minutes,
      coalesce(sum(duration_seconds),0) actual_seconds,
      count(*)::int sessions,count(distinct client_id)::int clients
      from client_time_sessions
      where organization_id=$1 and ($2::uuid is null or activity_id=$2) and status='completed' and ended_at is not null`,[org,aid])).rows[0];
    const active=(await query(`select s.id,s.client_id,c.estimated_minutes,s.started_at,c.name client_name
      from client_time_sessions s join clients c on c.id=s.client_id
      where s.organization_id=$1 and ($2::uuid is null or s.activity_id=$2)
        and s.ended_at is null and s.status='running' limit 1`,[org,aid])).rows[0]||null;
    const manual=Number(totals.manual_minutes||0),actual=Number(totals.actual_seconds||0)/60,saved=Math.max(0,manual-actual);
    const sessions=Number(totals.sessions||0);
    return {manualMinutes:manual,actualMinutes:actual,savedMinutes:saved,averageSavedMinutes:sessions?saved/sessions:0,sessions,clients:Number(totals.clients||0),active,activityId:aid};
  });
  app.get('/time-metrics/stats',async r=>{
    const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));
    const scope=`organization_id=$1 and ($2::uuid is null or activity_id=$2) and status='completed' and ended_at is not null`;
    const rows=(await query(`select date_trunc('day',ended_at)::date as day,coalesce(sum(manual_minutes),0) manual,coalesce(sum(duration_seconds),0)/60.0 actual,count(*)::int sessions from client_time_sessions where ${scope} group by 1 order by 1 desc limit 366`,[org,aid])).rows;
    return {activityId:aid,daily:rows,
      weekly:(await query(`select date_trunc('week',ended_at)::date as week,coalesce(sum(manual_minutes),0) manual,coalesce(sum(duration_seconds),0)/60.0 actual,count(*)::int sessions from client_time_sessions where ${scope} group by 1 order by 1 desc limit 104`,[org,aid])).rows,
      monthly:(await query(`select date_trunc('month',ended_at)::date as month,coalesce(sum(manual_minutes),0) manual,coalesce(sum(duration_seconds),0)/60.0 actual,count(*)::int sessions from client_time_sessions where ${scope} group by 1 order by 1 desc limit 60`,[org,aid])).rows};
  });
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
  // Prompt 09 — détection de collisions : chevauchements contre les rendez-vous de
  // l'organisation (toutes activités : la personne est une) et les indisponibilités (108).
  // Une dérogation est possible mais JAMAIS silencieuse : allowConflict:true + motif,
  // écrits dans calendar_override_audit.
  async function calendarConflicts(org:string,excludeId:string|null,startIso:string,endIso:string){
    const appointments=(await query(
      `select a.id,a.title,a.starts_at,a.ends_at,c.name client_name from appointments a left join clients c on c.id=a.client_id
       where a.organization_id=$1 and ($2::uuid is null or a.id<>$2::uuid)
         and lower(coalesce(a.status,''))<>'canceled'
         and tstzrange(a.starts_at,coalesce(a.ends_at,a.starts_at),'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)')
       order by a.starts_at limit 10`,[org,excludeId,startIso,endIso])).rows;
    const unavailabilities=(await query(
      `select id,reason,starts_at,ends_at from calendar_unavailabilities
       where organization_id=$1 and tstzrange(starts_at,coalesce(ends_at,starts_at),'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')
       order by starts_at limit 10`,[org,startIso,endIso])).rows;
    return {
      appointments:appointments.map((a:any)=>({kind:'appointment',id:String(a.id),title:a.title,clientName:a.client_name||null,startsAt:a.starts_at,endsAt:a.ends_at})),
      unavailabilities:unavailabilities.map((u:any)=>({kind:'unavailability',id:String(u.id),reason:u.reason,startsAt:u.starts_at,endsAt:u.ends_at})),
    };
  }
  app.get('/appointments',async r=>(await query(`select a.*,c.name client_name,c.email client_email,c.address client_address,c.intervention_address client_intervention_address,q.number quote_number,q.total_ttc quote_total_ttc from appointments a left join clients c on c.id=a.client_id left join quotes q on q.id=a.quote_id where a.organization_id=$1 and ($2::uuid is null or a.activity_id=$2) order by a.starts_at`,[r.auth!.organizationId,activityId(r)])).rows);
  app.patch('/appointments/:id',async(r,reply)=>{
    const b:any=r.body,org=r.auth!.organizationId,id=(r.params as any).id;
    const start=new Date(b.startsAt),end=new Date(b.endsAt||b.startsAt);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<start)return reply.code(400).send({error:'INVALID_INPUT',message:'L’heure de fin ne peut pas être antérieure à l’heure de début.'});
    // Prompt 09 — le déplacement d'un rendez-vous vérifie aussi les collisions (hors lui-même).
    const conflicts=await calendarConflicts(org,String(id),start.toISOString(),end.toISOString());
    const conflictItems=[...conflicts.appointments,...conflicts.unavailabilities];
    if(conflictItems.length&&b.allowConflict!==true)return reply.code(409).send({error:'CALENDAR_CONFLICT',message:'Ce créneau chevauche un rendez-vous ou une indisponibilité existants. Décalez le créneau, ou confirmez explicitement la dérogation (allowConflict:true + motif).',conflicts:conflictItems});
    if(conflictItems.length&&b.allowConflict===true){
      const reason=String(b.conflictReason||'').trim().slice(0,400);
      if(!reason||reason.length<3)return reply.code(400).send({error:'CONFLICT_REASON_REQUIRED',message:'Indiquez le motif de la dérogation (conflictReason) : il est conservé dans l\u2019audit.'});
      await query(`insert into calendar_override_audit(organization_id,appointment_id,conflict_items,reason,actor_id) values($1,$2,$3::jsonb,$4,$5)`,[org,id,JSON.stringify(conflictItems),reason,r.auth!.userId]);
    }
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
    // Prompt 08 — les réservations liées au rendez-vous sont libérées avec lui (réserver
    // n'est pas consommer) : les quantités retournent au disponible.
    await withTransaction(async client=>{
      await releaseAppointmentReservations(client,org,id,'Rendez-vous supprimé');
      await client.query('delete from appointments where id=$1 and organization_id=$2',[id,org]);
    });
    return {ok:true,calendar};
  });
  // Prompt 09 — temps de déplacement : AUCUNE valeur prétendue réelle sans source de
  // routage réellement configurée. Sans fournisseur configuré (aucun n'est intégré à ce
  // stade), la distance/heure est explicitement inconnue.
  app.get('/appointments/travel-time',async r=>{
    const org=r.auth!.organizationId;
    const cfg=(await query(`select configuration_data->>'routingProvider' as provider from organizations where id=$1`,[org])).rows[0];
    const provider=String(cfg?.provider||'').trim();
    if(!provider||provider==='none'){
      return {minutes:null,source:'unknown',provider:null,note:'Aucune source de routage configurée : la durée de déplacement est inconnue (estimez-la manuellement dans le créneau du rendez-vous).'};
    }
    return {minutes:null,source:'unknown',provider,note:`Fournisseur « ${provider} » déclaré mais non intégré : aucune durée réelle ne peut être calculée (valeur inconnue, jamais inventée).`};
  });
  app.post('/appointments',async(r,reply)=>{
    const b:any=r.body,org=r.auth!.organizationId;if(!b?.title||!b?.startsAt)return reply.code(400).send({error:'INVALID_INPUT'});
    const aid=await ensureActivity(r,activityId(r,b));if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    const d=new Date(b.startsAt);if(Number.isNaN(d.getTime()))return reply.code(400).send({error:'INVALID_INPUT'});
    const id=crypto.randomUUID();const end=b.endsAt?new Date(b.endsAt):new Date(d.getTime()+3600000);if(Number.isNaN(end.getTime())||end<d)return reply.code(400).send({error:'INVALID_INPUT',message:'L’heure de fin ne peut pas être antérieure à l’heure de début.'});
    // Prompt 09 — collisions : refus déterministe 409 avec la liste des éléments en conflit ;
    // dérogation explicite (allowConflict:true + motif) possible et AUDITÉE, jamais silencieuse.
    const conflicts=await calendarConflicts(org,null,d.toISOString(),end.toISOString());
    const conflictItems=[...conflicts.appointments,...conflicts.unavailabilities];
    if(conflictItems.length&&b.allowConflict!==true)return reply.code(409).send({error:'CALENDAR_CONFLICT',message:'Ce créneau chevauche un rendez-vous ou une indisponibilité existants. Décalez le créneau, ou confirmez explicitement la dérogation (allowConflict:true + motif).',conflicts:conflictItems});
    if(conflictItems.length&&b.allowConflict===true){
      const reason=String(b.conflictReason||'').trim().slice(0,400);
      if(!reason||reason.length<3)return reply.code(400).send({error:'CONFLICT_REASON_REQUIRED',message:'Indiquez le motif de la dérogation (conflictReason) : il est conservé dans l\u2019audit.'});
    }
    const clientId=b.clientId||null,source=['postal','intervention','free'].includes(String(b.addressSource))?String(b.addressSource):'free';let quoteId=b.quoteId||null,quoteTotal=null,quoteItems:any[]=[];
    if(quoteId){const q=(await query(`select q.id,q.client_id,q.activity_id,q.total_ttc,coalesce((select json_agg(json_build_object('label',i.label,'quantity',i.quantity,'unitPrice',i.unit_price) order by i.position) from quote_items i where i.quote_id=q.id),'[]'::json) items from quotes q where q.id=$1 and q.organization_id=$2 and q.document_type='quote'`,[quoteId,org])).rows[0];if(!q||q.client_id!==clientId||q.activity_id!==aid)return reply.code(400).send({error:'INVALID_QUOTE'});quoteTotal=Number(q.total_ttc||0);quoteItems=Array.isArray(q.items)?q.items:[];}
    const client=clientId?(await query('select address,intervention_address from clients where id=$1 and organization_id=$2',[clientId,org])).rows[0]:null;const resolvedAddress=source==='postal'?(client?.address||''):source==='intervention'?(client?.intervention_address||''):String(b.locationAddress||'').trim();if(source!=='free'&&!resolvedAddress)return reply.code(400).send({error:'ADDRESS_MISSING',message:'L’adresse sélectionnée n’est pas renseignée dans la fiche client.'});if(source==='free'&&!resolvedAddress)return reply.code(400).send({error:'ADDRESS_MISSING',message:'Saisissez l’adresse du rendez-vous.'});
    // Prompt 09 — origine déclarée de l'événement (internal par défaut ; external_import et
    // synchronized réservés aux sources réellement importées — aucune fausse origine).
    const origin=['internal','external_import','synchronized'].includes(String(b.origin))?String(b.origin):'internal';
    const externalUid=b.externalUid?String(b.externalUid).slice(0,255):null;
    const timezone=b.timezone?String(b.timezone).slice(0,64):null;
    const recurrenceRule=b.recurrenceRule?String(b.recurrenceRule).slice(0,200):null;
    await query('insert into appointments(id,organization_id,activity_id,client_id,quote_id,address_source,quote_total_ttc,quote_items,title,starts_at,ends_at,location_address,origin,external_uid,timezone,recurrence_rule) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16)',[id,org,aid,clientId,quoteId,source,quoteTotal,JSON.stringify(quoteItems),b.title,d,end,resolvedAddress,origin,externalUid,timezone,recurrenceRule]);
    await query(`insert into notification_jobs(organization_id,appointment_id,kind,run_at) values($1,$2,'before',$3),($1,$2,'after',$4)`,[org,id,new Date(d.getTime()-86400000),new Date(end.getTime()+86400000)]);
    if(conflictItems.length)await query(`insert into calendar_override_audit(organization_id,appointment_id,conflict_items,reason,actor_id) values($1,$2,$3::jsonb,$4,$5)`,[org,id,JSON.stringify(conflictItems),String(b.conflictReason||'').trim().slice(0,400),r.auth!.userId]);
    const calendar=await syncAppointment(org,await loadAppointment(org,id),'create');
    return reply.code(201).send({id,calendar,conflicts:conflictItems.length?conflictItems:undefined});
  });

  app.delete('/parts/:id/prices/:supplierId',async(r,reply)=>{const p:any=r.params;const x=await query('delete from supplier_parts sp using parts pt where sp.part_id=pt.id and pt.organization_id=$1 and sp.part_id=$2 and sp.supplier_id=$3',[r.auth!.organizationId,p.id,p.supplierId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.patch('/devices/:id',async(r,reply)=>{
    const parsed=devicePatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const params=activityParamsSchema.safeParse(r.params);
    if(!params.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data;
    const x=await query('update devices set type=coalesce($1,type),brand=$2,model=$3,imei=$4,serial_number=$5,notes=$6,updated_at=now() where id=$7 and organization_id=$8 returning *',[b.type?.trim()||null,b.brand||null,b.model||null,b.imei||null,b.serialNumber||null,b.notes||null,params.data.id,r.auth!.organizationId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return x.rows[0];
  });
  app.delete('/devices/:id',async(r,reply)=>{const x=await query('delete from devices where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.patch('/warranty-policies/:id',async(r,reply)=>{
    const parsed=warrantyPolicyPatchInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const params=activityParamsSchema.safeParse(r.params);
    if(!params.success)return reply.code(400).send({error:'INVALID_INPUT'});
    const b:any=parsed.data;
    let duration:number|null=null;
    try{
      duration=b.durationMonths===undefined?null:(optionalNumber(b.durationMonths,'Durée de garantie',1,1200)??null);
      if(duration!==null&&!Number.isInteger(duration))return reply.code(400).send({error:'INVALID_INPUT'});
    }catch{return reply.code(400).send({error:'INVALID_INPUT'})}
    const x=await query('update warranty_policies set name=coalesce($1,name),duration_months=coalesce($2,duration_months),scope_type=coalesce($3,scope_type),updated_at=now() where id=$4 and organization_id=$5 returning *',[b.name?.trim()||null,duration,b.scopeType||null,params.data.id,r.auth!.organizationId]);
    if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});
    return x.rows[0];
  });
  app.delete('/warranty-policies/:id',async(r,reply)=>{const x=await query('delete from warranty_policies where id=$1 and organization_id=$2',[((r.params as any).id),r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return {ok:true}});
  app.get('/sav',async r=>{const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));if(!aid)return [];return (await query(`select s.*,c.name client_name,q.number invoice_number from sav_cases s left join clients c on c.id=s.client_id left join quotes q on q.id=s.invoice_id where s.organization_id=$1 and s.activity_id=$2 order by s.created_at desc`,[org,aid])).rows;});
  app.post('/sav',async(r,reply)=>{const b:any=r.body||{},org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));if(!aid||!b.clientId||!b.invoiceId)return reply.code(400).send({error:'INVALID_INPUT'});const inv=(await query("select id,client_id,activity_id,document_type,sent_at from quotes where id=$1 and organization_id=$2 and document_type='invoice'",[b.invoiceId,org])).rows[0];if(!inv||inv.client_id!==b.clientId||inv.activity_id!==aid||!inv.sent_at)return reply.code(400).send({error:'SAV_UNAVAILABLE',message:'Le SAV est disponible après l’envoi de la facture et pendant la garantie.'});const warranty=(await query("select id from warranties where quote_id=$1 and organization_id=$2 and ends_at>now() limit 1",[b.invoiceId,org])).rows[0];if(!warranty)return reply.code(400).send({error:'SAV_UNAVAILABLE',message:'La garantie associée à cette facture est terminée.'});const savType=b.savType==='free_intervention'?'free_intervention':'financial';const items=Array.isArray(b.items)?b.items.map((x:any)=>({label:String(x.label||'').trim(),quantity:Math.max(0,Number(x.quantity||0)),unitPrice:Math.max(0,Number(x.unitPrice||0))})).filter((x:any)=>x.label&&x.quantity>0):[];const positive=items.reduce((n:any,x:any)=>n+x.quantity*x.unitPrice,0);const amount=savType==='financial'?-Math.round(positive*100)/100:0;const interventionCostHt=savType==='free_intervention'?Math.max(0,Number(b.interventionCostHt||0)):0;if(amount>0.005)return reply.code(400).send({error:'INVALID_INPUT'});const id=crypto.randomUUID();await query('insert into sav_cases(id,organization_id,activity_id,client_id,invoice_id,amount_ttc,items,note,sav_type,intervention_cost_ht) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,org,aid,b.clientId,b.invoiceId,amount,JSON.stringify(items),b.note?String(b.note).slice(0,2000):null,savType,interventionCostHt]);await assertPeriodOpen(org,new Date());await query('insert into accounting_entries(organization_id,activity_id,entry_type,amount,entry_date,source_id,label) values($1::uuid,$2::uuid,$3::varchar(30),$4::numeric,current_date,$5::uuid,$6::varchar(240))',[org,aid,'sav',amount,id,`SAV facture ${inv.id}`]);return reply.code(201).send({id,amountTtc:amount});});
  app.get('/sav/:id',async(r,reply)=>{const x=await query('select s.*,c.name client_name,q.number invoice_number from sav_cases s left join clients c on c.id=s.client_id left join quotes q on q.id=s.invoice_id where s.id=$1 and s.organization_id=$2',[(r.params as any).id,r.auth!.organizationId]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});return x.rows[0]});
  app.patch('/sav/:id',async(r,reply)=>{const b:any=r.body||{},id=String((r.params as any).id),org=r.auth!.organizationId;const current=(await query('select * from sav_cases where id=$1 and organization_id=$2',[id,org])).rows[0];if(!current)return reply.code(404).send({error:'NOT_FOUND'});const savType=b.savType==='free_intervention'?'free_intervention':(current.sav_type||'financial');const items=Array.isArray(b.items)?b.items.map((x:any)=>({label:String(x.label||'').trim(),quantity:Math.max(0,Number(x.quantity||0)),unitPrice:Math.max(0,Number(x.unitPrice||0))})).filter((x:any)=>x.label&&x.quantity>0):current.items||[];const amount=savType==='financial'?-Math.round(items.reduce((n:any,x:any)=>n+x.quantity*x.unitPrice,0)*100)/100:0;const interventionCostHt=savType==='free_intervention'?Math.max(0,Number(b.interventionCostHt??current.intervention_cost_ht??0)):0;if(amount>0.005)return reply.code(400).send({error:'INVALID_INPUT'});await query('update sav_cases set sav_type=$1,items=$2::jsonb,amount_ttc=$3::numeric,intervention_cost_ht=$4::numeric,note=$5,updated_at=now() where id=$6 and organization_id=$7',[savType,JSON.stringify(items),amount,interventionCostHt,b.note?String(b.note).slice(0,2000):null,id,org]);await query('update accounting_entries set amount=$1::numeric,label=$2::varchar(240) where source_id=$3 and organization_id=$4',[amount,`SAV facture ${current.invoice_id}`,id,org]);return {id,amountTtc:amount};});
  app.delete('/sav/:id',async(r,reply)=>{const id=String((r.params as any).id),org=r.auth!.organizationId;const x=await query('delete from sav_cases where id=$1 and organization_id=$2 returning id',[id,org]);if(!x.rowCount)return reply.code(404).send({error:'NOT_FOUND'});await query('delete from accounting_entries where source_id=$1 and organization_id=$2',[id,org]);return {ok:true};});
  app.get('/dashboard/summary',async r=>{
    const org=r.auth!.organizationId;
    // Échéance URSSAF à moins de 7 jours : alimente le journal de bord sans exposer le calendrier.
    try{await recordUpcomingFiscalDeadlines(org)}catch(e:any){r.log.warn({err:String(e?.message||e)},'fiscal deadline journal skipped')}
    const [aid,t]=await Promise.all([
      ensureActivity(r,activityId(r)),
      query(`select count(*)::int n from support_tickets where organization_id=$1 and status not in ('resolved','duplicate','closed')`,[org])
    ]);
    // Crée l’entrée de configuration pour les nouvelles organisations également, sans rouvrir une entrée que l’utilisateur a explicitement résolue.
    const configurationState=(await query(`select configuration_incomplete from organizations where id=$1`,[org])).rows[0];
    if(configurationState && configurationState.configuration_incomplete!==false){
      await query(`insert into dashboard_journal_events(organization_id,event_type,title,description,severity,source,internal_path,dedupe_key)
        values($1,'configuration_incomplete','Configuration à compléter','Certains éléments restent à renseigner ou à vérifier. Reprenez le parcours guidé ou modifiez les paramètres manuellement.','action','dashboard','/onboarding','legacy-configuration-incomplete')
        on conflict(organization_id,dedupe_key) do nothing`,[org]);
    } else {
      await query(`update dashboard_journal_events set resolved_at=coalesce(resolved_at,now()) where organization_id=$1 and event_type='configuration_incomplete' and resolved_at is null`,[org]);
    }
    if(!aid){const events=(await query(`select id,event_type,title,description,severity,internal_path,is_read,resolved_at,created_at from dashboard_journal_events where organization_id=$1 and event_type not like 'administrative_%' and event_type not like 'journey_%' and resolved_at is null and severity in ('action','warning','error') order by created_at desc`,[org])).rows;return {tickets:Number(t.rows[0]?.n||0),unpaidCount:0,unpaidTotal:0,forecastEntries:0,journal:events.map((x:any)=>({kind:'persistent',persisted:true,journalId:x.id,title:x.title,detail:x.description,severity:x.severity==='action'||x.severity==='error'?'red':x.severity==='warning'?'yellow':'blue',sortAt:x.created_at,internalPath:x.internal_path,isRead:x.is_read,eventType:x.event_type}))};}
    const historyMonths=Math.min(120,Math.max(1,Number((r.query as any)?.forecastMonths||6)));
    const accountingYear=new Date().getFullYear();
    const [u,f,r4,historicalResult,warrResult,appointmentsResult,subResult,yearAccounting,freeAccessResult,cashForecast,upcomingAppointmentsResult]=await Promise.all([
      query(`select count(*)::int n,coalesce(sum(greatest(0,total_ttc-coalesce(amount_paid,0))),0)::numeric total,min(coalesce(due_at,created_at)) first_date from quotes where organization_id=$1 and activity_id=$2 and document_type='invoice' and payment_status<>'paid' and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted')`,[org,aid]),
      query(`select coalesce(sum(total_ht),0)::numeric total from quotes where organization_id=$1 and activity_id=$2 and document_type='quote' and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','rejected','refused','expired','void','deleted')`,[org,aid]),
      query(`select count(*)::int n,min(coalesce(next_reminder_at,due_at,created_at)) first_date from quotes where organization_id=$1 and activity_id=$2 and document_type='invoice' and payment_status<>'paid' and reminder_count=3 and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted')`,[org,aid]),
      query(`
      select (
        coalesce((select sum(p.amount/nullif(1+q.vat_rate/100,0))
          from invoice_payments p join quotes q on q.id=p.quote_id
          where q.organization_id=$1 and q.activity_id=$2 and q.document_type='invoice'
            and p.paid_at>=now()-($3||' months')::interval),0)
        + coalesce((select sum(s.amount_ttc/nullif(1+coalesce(q.vat_rate,0)/100,0))
          from sav_cases s join quotes q on q.id=s.invoice_id
          where s.organization_id=$1 and s.activity_id=$2 and s.sav_type='financial'
            and s.created_at>=now()-($3||' months')::interval),0)
      )::numeric total`,[org,aid,historyMonths]),
      query(`select count(*)::int n,min(ends_at) next_end from warranties where organization_id=$1 and ends_at>now()`,[org]),
      query(`select title,starts_at,client_id from appointments where organization_id=$1 and activity_id=$2 and starts_at>now() order by starts_at asc limit 5`,[org,aid]),
      query('select trial_ends_at,current_period_end from subscriptions where organization_id=$1',[org]),
      monthlyAccounting(org,aid,accountingYear),
      query(`select exists(select 1 from organization_members om where om.organization_id=$1 and (exists(select 1 from platform_admins pa where pa.user_id=om.user_id) or exists(select 1 from vip_guest_accounts vg where vg.user_id=om.user_id))) as free`,[org]),
      documentForecastEntries(org,aid),
      // Compteur réel des rendez-vous programmés (futurs, non annulés), sans limite de
      // lignes chargées : l'encart accueil affiche le total, pas un échantillon.
      query(`select count(*)::int n from appointments where organization_id=$1 and activity_id=$2 and starts_at>now() and lower(coalesce(status,''))<>'canceled'`,[org,aid])
    ]);
    const historical=historicalResult.rows[0];
    const historicalAverage=Number(historical?.total||0)/Math.max(1,historyMonths);
    const open=Number(f.rows[0]?.total||0);
    const nextMonth=open;
    const currentDate=new Date();
    const monthHt=Number(yearAccounting.find(m=>{const d=new Date(m.month);return d.getFullYear()===accountingYear&&d.getMonth()===currentDate.getMonth()})?.revenueHt||0);
    const yearToDateHt=yearAccounting.reduce((sum,m)=>sum+Number(m.revenueHt||0),0);
    const remainingMonths=Math.max(0,11-currentDate.getMonth());
    const forecast={month:monthHt,monthHt,month1:nextMonth,months3:monthHt+historicalAverage*2+open,months6:monthHt+historicalAverage*5+open,year:yearToDateHt+historicalAverage*remainingMonths+open,monthlyAverage:historicalAverage,historyMonths,method:`Prévision en HT : encaissements historiques HT moyens, devis ouverts HT et SAV financiers ramenés en HT. Les devis annulés ou refusés sont exclus. L’année combine le réalisé depuis janvier et les mois restants estimés.`};
    const warr=warrResult.rows[0];
    const appointments=appointmentsResult.rows;
    const sub=subResult.rows[0]||null;
    const freeAccess=!!freeAccessResult.rows[0]?.free;
    const clientIds=appointments.map((a:any)=>a.client_id).filter(Boolean);
    const clientsById=new Map<string,string>();
    if(clientIds.length){
      const cr=await query(`select id,name from clients where organization_id=$1 and id=any($2::uuid[])`,[org,clientIds]);
      for(const c of cr.rows)clientsById.set(c.id,c.name);
    }
    const trialDaysLeft=sub?.trial_ends_at?Math.max(0,Math.ceil((new Date(sub.trial_ends_at).getTime()-Date.now())/86400000)):0;
    const journal:any[]=[];
    if(!freeAccess && trialDaysLeft>0)journal.push({kind:'trial',severity:'yellow',sortAt:sub?.trial_ends_at||null,title:'Période d’essai',detail:`${trialDaysLeft} jour${trialDaysLeft>1?'s':''} restant${trialDaysLeft>1?'s':''}`});
    if(Number(u.rows[0]?.n||0)>0)journal.push({kind:'unpaid',severity:'red',sortAt:u.rows[0]?.first_date||null,title:'Factures en attente',detail:`${Number(u.rows[0]?.n||0)} facture${Number(u.rows[0]?.n||0)>1?'s':''} · ${Number(u.rows[0]?.total||0).toFixed(2)} €`});
    if(warr?.next_end)journal.push({kind:'warranty',severity:'yellow',sortAt:warr.next_end,title:'Garantie à surveiller',detail:`Échéance ${new Date(warr.next_end).toLocaleDateString('fr-FR')}`});
    if(Number(r4.rows[0]?.n||0)>0)journal.push({kind:'reminder',severity:'red',sortAt:r4.rows[0]?.first_date||null,title:'Relance urgente',detail:'Une facture nécessite une 4e relance.'});
    if(!freeAccess && sub?.current_period_end)journal.push({kind:'subscription',severity:'yellow',sortAt:sub.current_period_end,title:'Abonnement',detail:`Échéance ${new Date(sub.current_period_end).toLocaleDateString('fr-FR')}`});
    for(const a of appointments)journal.push({kind:'appointment',severity:'yellow',sortAt:a.starts_at,title:`Rendez-vous · ${a.title||'Sans titre'}`,detail:`${new Date(a.starts_at).toLocaleString('fr-FR')}${a.client_id&&clientsById.has(a.client_id)?` · ${clientsById.get(a.client_id)}`:''}`});
    let mailReady=false;
    try{mailReady=await mailConfigured(org)}catch{mailReady=false}
    if(!mailReady)journal.push({kind:'mail',severity:'yellow',sortAt:null,title:'Messagerie',detail:'Connectez votre messagerie (une seule fois) pour envoyer vos devis et factures et mettre votre agenda à jour.',action:'settings'});
    const persistent=(await query(`select id,event_type,title,description,severity,internal_path,is_read,resolved_at,created_at from dashboard_journal_events where organization_id=$1 and event_type not like 'administrative_%' and event_type not like 'journey_%' and resolved_at is null and severity in ('action','warning','error') order by is_read asc,created_at desc`,[org])).rows;
    for(const x of persistent)journal.push({kind:'persistent',persisted:true,journalId:x.id,eventType:x.event_type,title:x.title,detail:x.description,severity:x.severity==='action'||x.severity==='error'?'red':x.severity==='warning'?'yellow':x.severity==='success'?'green':'blue',sortAt:x.created_at,internalPath:x.internal_path,isRead:x.is_read});
    // Bloc 10/12/13/15 — indicateurs des modules propriétaires (projection, jamais de calcul
    // parallèle) : stocks sous seuil, tâches ouvertes, demandes comptables en attente.
    let lowStockCount=0,tasksOpenCount=0,accountantOpenRequests=0;
    try{
      const [ls,tk,ar]=await Promise.all([
        query(`select count(*)::int n from parts p where p.organization_id=$1 and coalesce(p.min_stock_threshold,0)>0 and (p.stock-coalesce((select sum(r.quantity) from part_reservations r where r.organization_id=p.organization_id and r.part_id=p.id and r.status='active'),0))<p.min_stock_threshold`,[org]),
        query(`select count(*)::int n from tasks where organization_id=$1 and status='todo'`,[org]),
        query(`select count(*)::int n from accountant_requests where organization_id=$1 and state in ('open','answered')`,[org]),
      ]);
      lowStockCount=Number(ls.rows[0]?.n||0);tasksOpenCount=Number(tk.rows[0]?.n||0);accountantOpenRequests=Number(ar.rows[0]?.n||0);
    }catch(e:any){r.log.warn({err:String(e?.message||e)},'dashboard module counters skipped');}
    journal.sort((a:any,b:any)=>{const rank=(x:any)=>x.severity==='red'?0:x.persisted&&!x.isRead?1:x.severity==='yellow'?2:3;const pr=rank(a)-rank(b);if(pr!==0)return pr;const at=a.sortAt?new Date(a.sortAt).getTime():Number.POSITIVE_INFINITY;const bt=b.sortAt?new Date(b.sortAt).getTime():Number.POSITIVE_INFINITY;return at-bt;});
    return {tickets:Number(t.rows[0]?.n||0),unpaidCount:Number(u.rows[0]?.n||0),unpaidTotal:Number(u.rows[0]?.total||0),forecastEntries:cashForecast.entries,fourthReminderCount:Number(r4.rows[0]?.n||0),upcomingAppointments:Number(upcomingAppointmentsResult.rows[0]?.n||0),lowStockCount,tasksOpenCount,accountantOpenRequests,forecast,subscription:freeAccess?null:sub,warranty:{count:Number(warr?.n||0),nextEnd:warr?.next_end||null},trialDaysLeft:freeAccess?0:trialDaysLeft,journal};
  });
  app.get('/accounting/summary',async r=>{
    const aid=await ensureActivity(r,activityId(r));
    const year=Number((r.query as any)?.year)||new Date().getFullYear();const org=r.auth!.organizationId;
    const months=await monthlyAccounting(org,aid!,year);
    const totals=months.reduce((t,m)=>({revenue_ht:t.revenue_ht+m.revenueHt,vat:t.vat+m.vat,purchases:t.purchases+m.purchases,purchase_vat:t.purchase_vat+(m.purchaseVat||0),social:t.social+m.social,mileage_total:t.mileage_total+Number(m.mileage||0)}),{revenue_ht:0,vat:0,purchases:0,purchase_vat:0,social:0,mileage_total:0});
    const count=Number((await query(`select count(distinct q.id)::int n from quotes q join invoice_payments p on p.quote_id=q.id where q.organization_id=$1 and q.activity_id=$2 and q.document_type='invoice' and p.paid_at>=make_date($3,1,1) and p.paid_at<make_date($3+1,1,1)`,[org,aid,year])).rows[0]?.n||0);
    const invoices={...totals,count};
    const expenseReportsHt=months.reduce((t,m)=>t+Number(m.expenseReports||0),0);
    // Bloc 8 — ventilation par catégorie d'activité (tableau de bord comptabilité).
    const byCategory=await categoryAccounting(org,aid!,year);
    // Bloc 9 — options fiscales déclarées (impôt dû : versement libératoire, jamais une cotisation).
    const fiscalOptions=await orgFiscalOptions(org);
    return{year,months:months.map(m=>({month:m.month,revenue:m.revenueHt,purchases:m.purchases,social:m.social,mileage:m.mileage,vat:m.vat,purchaseVat:m.purchaseVat,expenseReports:Number(m.expenseReports||0),invoiceCount:m.invoiceCount})),invoices,expenseReportsHt,byCategory,fiscalOptions};
  });
  app.get('/forecast/assumptions',async r=>{
    const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));
    const defaults={potentialClientsPerMonth:0,averageTicketTtc:0,variableCostPerRepair:0,fixedMonthlyCosts:0,reservePercent:0};
    if(!aid)return {...defaults,activityId:null,configured:false,updatedAt:null};
    const result=await query(`select potential_clients_per_month,average_ticket_ttc,variable_cost_per_repair,fixed_monthly_costs,reserve_percent,updated_at from activity_forecast_assumptions where organization_id=$1 and activity_id=$2`,[org,aid]);
    const row=result.rows[0];
    if(!row)return {...defaults,activityId:aid,configured:false,updatedAt:null};
    return {activityId:aid,potentialClientsPerMonth:Number(row.potential_clients_per_month||0),averageTicketTtc:Number(row.average_ticket_ttc||0),variableCostPerRepair:Number(row.variable_cost_per_repair||0),fixedMonthlyCosts:Number(row.fixed_monthly_costs||0),reservePercent:Number(row.reserve_percent||0),configured:true,updatedAt:row.updated_at};
  });
  app.put('/forecast/assumptions',async(r,reply)=>{
    const parsed=forecastAssumptionsInputSchema.safeParse(r.body||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_INPUT',message:'Les hypothèses du prévisionnel sont invalides.'});
    const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));
    if(!aid)return reply.code(400).send({error:'INVALID_INPUT',message:'Sélectionnez une activité valide.'});
    const b=parsed.data;
    const saved=await query(`insert into activity_forecast_assumptions(activity_id,organization_id,potential_clients_per_month,average_ticket_ttc,variable_cost_per_repair,fixed_monthly_costs,reserve_percent,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,now())
      on conflict(activity_id) do update set potential_clients_per_month=excluded.potential_clients_per_month,average_ticket_ttc=excluded.average_ticket_ttc,variable_cost_per_repair=excluded.variable_cost_per_repair,fixed_monthly_costs=excluded.fixed_monthly_costs,reserve_percent=excluded.reserve_percent,updated_at=now()
      where activity_forecast_assumptions.organization_id=excluded.organization_id
      returning activity_id,potential_clients_per_month,average_ticket_ttc,variable_cost_per_repair,fixed_monthly_costs,reserve_percent`,[aid,org,b.potentialClientsPerMonth,b.averageTicketTtc,b.variableCostPerRepair,b.fixedMonthlyCosts,b.reservePercent]);
    if(!saved.rowCount)return reply.code(404).send({error:'NOT_FOUND',message:'Cette activité est introuvable.'});
    const row=saved.rows[0];
    return {activityId:row.activity_id,potentialClientsPerMonth:Number(row.potential_clients_per_month||0),averageTicketTtc:Number(row.average_ticket_ttc||0),variableCostPerRepair:Number(row.variable_cost_per_repair||0),fixedMonthlyCosts:Number(row.fixed_monthly_costs||0),reservePercent:Number(row.reserve_percent||0)};
  });
  app.get('/treasury/summary',async r=>{
    const org=r.auth!.organizationId,aid=await ensureActivity(r,activityId(r));
    if(!aid)return {forecastEntries:0,forecastOutputs:0,forecastNet:0,expenses:0,rows:[]};
    const rows=(await query(`select q.id,q.number,q.document_type,q.status,q.created_at,q.total_ttc,q.amount_paid,q.part_cost,q.shipping_cost,q.mileage_km,q.mileage_total,q.mileage_mode,q.mileage_internal_rate,q.labor_internal_cost_ht,q.urssaf_rate,q.contribution_snapshot,q.vat_rate,q.purchase_vat_mode,q.purchase_vat_rate,q.coefficient_basis,q.coefficient_unit,q.coefficient_value,q.part_coefficient_percent,coalesce((select sum(i.quantity) from quote_items i where i.quote_id=q.id),1)::numeric part_quantity,coalesce((select sum(ir.penalty_amount) from invoice_reminders ir where ir.quote_id=q.id),0)::numeric total_penalty_amount from quotes q where q.organization_id=$1 and q.activity_id=$2 and ((q.document_type='quote' and lower(coalesce(q.status,'')) not in ('canceled','cancelled','annulé','annule','rejected','refused','expired','void','deleted')) or (q.document_type='invoice' and q.payment_status<>'paid' and lower(coalesce(q.status,'')) not in ('canceled','cancelled','void','deleted'))) order by q.created_at desc`,[org,aid])).rows;
    const cashForecast=await documentForecastEntries(org,aid);
    const savTotal=cashForecast.savTtc;
    const forecastIn=cashForecast.quotesTtc;
    const forecastOut=rows.reduce((n,x)=>{
      const mileageCost=x.mileage_mode==='margin'
        ?(Number(x.mileage_internal_rate||0)>0
          ?Number(x.mileage_km||0)*Number(x.mileage_internal_rate||0)
          :Number(x.mileage_total||0))
        :0;
      const p=Number(x.part_cost||0)+Number(x.shipping_cost||0)+Number(x.labor_internal_cost_ht||0)+mileageCost;
      const purchaseVatRate=x.purchase_vat_mode==='exempt'?0:(x.purchase_vat_rate!=null?Number(x.purchase_vat_rate):Number(x.vat_rate||0));const vat=(Number(x.part_cost||0)+Number(x.shipping_cost||0))*purchaseVatRate/100;const caHt=Number(x.total_ttc||0)/(1+Number(x.vat_rate||0)/100);const rates=Array.isArray(x.contribution_snapshot)?x.contribution_snapshot.filter((c:any)=>String(c?.basis||'ca_ht')==='ca_ht').reduce((t:any,c:any)=>t+Number(c?.rate||0),0):Number(x.urssaf_rate||0);const social=caHt*rates/100;return n+p+vat+social},0);
    const forecastExpenses=rows.reduce((n,x)=>{const mileageCost=x.mileage_mode==='margin'?(Number(x.mileage_internal_rate||0)>0?Number(x.mileage_km||0)*Number(x.mileage_internal_rate||0):Number(x.mileage_total||0)):0;return n+Number(x.part_cost||0)+Number(x.shipping_cost||0)+Number(x.labor_internal_cost_ht||0)+mileageCost},0);
    // Notes de frais (15.4.0) : celles qui restent à rembourser sont des sorties de trésorerie prévues.
    const er=(await query(`select count(*)::int n,coalesce(sum(amount_ttc),0)::numeric total,coalesce(sum(amount_ttc) filter (where status='to_reimburse'),0)::numeric to_reimburse from expense_reports where organization_id=$1 and activity_id=$2`,[org,aid])).rows[0]||{};
    const expenseToReimburse=Number(er.to_reimburse||0);
    // Bloc 4 — séparation honnête des catégories de flux :
    // POTENTIEL (devis ouverts, non signés) ≠ ENGAGÉ (créances restantes sur factures non
    // soldées : total TTC + majorations − paiements déjà reçus) ≠ SORTIES (coûts des documents
    // ouverts + notes de frais à rembourser). Une facture partiellement payée n'entre que pour
    // son RESTE DÛ ; une facture réglée n'est jamais un encaissement futur ; un devis converti
    // n'est compté ni comme devis ni doublement (les lignes excluent les devis annulés et les
    // factures payées). Les montants affichés sont TTC (bases homogènes, explicites en UI).
    const potentialIn=rows.filter((x:any)=>x.document_type==='quote').reduce((n:any,x:any)=>n+Number(x.total_ttc||0),0);
    const committedIn=rows.filter((x:any)=>x.document_type==='invoice').reduce((n:any,x:any)=>n+Math.max(0,Math.round((Number(x.total_ttc||0)+Number(x.total_penalty_amount||0)-Number(x.amount_paid||0))*100)/100),0);
    return {forecastEntries:cashForecast.entries,forecastOutputs:forecastOut+expenseToReimburse,forecastNet:cashForecast.entries-forecastOut-expenseToReimburse,expenses:forecastExpenses+expenseToReimburse,savDeduction:savTotal,expenseReports:{count:Number(er.n||0),total:Number(er.total||0),toReimburse:expenseToReimburse},
      potentialIn,committedIn,committedOut:expenseToReimburse,savTotal,
      outputsBreakdown:{directCosts:forecastOut,expenseReports:expenseToReimburse},
      committedNet:Math.round((committedIn-forecastOut-expenseToReimburse)*100)/100,
      excluded:{canceledQuotes:true,paidInvoices:true,convertedQuotes:true,avoirs:'aucun module d’avoir enregistré dans cette version'},rows};
  });
  app.get('/accounting/report.csv',async(r,reply)=>{
    const aid=await ensureActivity(r,activityId(r));if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    const year=Number((r.query as any)?.year)||new Date().getFullYear();
    const buffer=await accountingReportCsv(r.auth!.organizationId,aid,year);
    return reply.header('Content-Type','text/csv; charset=utf-8').header('Cache-Control','no-store').header('Content-Disposition',`attachment; filename="export-comptable-${year}.csv"`).send(buffer);
  });
  // Bloc 11 — export comptable PDF : le service existait mais n'était pas routé (code mort
  // relevé par l'audit) ; l'exposition complète l'export CSV, sans changer aucun calcul.
  app.get('/accounting/report.pdf',async(r,reply)=>{
    const aid=await ensureActivity(r,activityId(r));if(!aid)return reply.code(400).send({error:'INVALID_INPUT'});
    const year=Number((r.query as any)?.year)||new Date().getFullYear();
    try{
      const {accountingReportPdf}=await import('../services/accounting-report.js');
      const x=await accountingReportPdf(r.auth!.organizationId,aid,year);
      return reply.header('Content-Type','application/pdf').header('Cache-Control','no-store').header('Content-Disposition',`inline; filename="export-comptable-${year}.pdf"`).send(x.buffer);
    }catch(e:any){
      if(e?.message==='NOT_FOUND')return reply.code(404).send({error:'NOT_FOUND'});
      if(/soffice|libreoffice/i.test(String(e?.message||'')))return reply.code(503).send({error:'PDF_CONVERSION_UNAVAILABLE',message:'LibreOffice est requis pour générer ce PDF.'});
      throw e;
    }
  });

}
