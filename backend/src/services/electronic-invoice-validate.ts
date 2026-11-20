// Bloc 4 — validation structurelle et arithmétique interne des documents électroniques
// (UBL 2.1 / CII D16B) avant archivage et transmission.
//
// Portée honnête : ce validateur applique les règles de cohérence EN 16931 noyau
// (BR-CO-10/11/13/15/16) et les contrôles propres aux mentions françaises du 1er septembre
// 2026, sur le document généré par Aurion. Il NE remplace PAS la validation XSD/Schematron
// officielle effectuée par la PA à la réception — cf. PLATEFORME-AGREEE.md § 9 (limites).
// Un XML mal formé ou incohérent est refusé AVANT archivage : aucun document invalide ne peut
// atteindre l'état « prepared » ni être transmis.

import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { VAT_EXEMPTION_REASON, VAT_ON_PAYMENT_NOTICE, OPERATION_CATEGORIES } from './electronic-invoice-ubl.js';

const CENT = (value: unknown): number => {
  const raw = value !== null && typeof value === 'object' ? (value as any)['#text'] : value;
  return Math.round((Number(raw) + Number.EPSILON) * 100);
};

export type EinvoiceValidationIssue = { rule: string; message: string };

export type EinvoiceValidationResult = {
  ok: boolean;
  issues: EinvoiceValidationIssue[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  trimValues: true,
});

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Valeur texte d'un nœud : chaîne, nombre, ou objet {'@attr':…,'#text':…} (élément avec attributs). */
const text = (node: unknown): string => {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (typeof node === 'object' && '#text' in (node as any)) return String((node as any)['#text'] ?? '');
  return '';
};

/** Valide un XML UBL 2.1 généré (Invoice). */
export function validateUbl(xml: string, expected: {
  operationCategory: string;
  buyerSiren: string | null;
  vatOnPayment: boolean;
  deliveryAddress: string | null;
  netTotal: number;
  vatAmount: number;
  grossTotal: number;
  vatRate: number;
  lineCount: number;
}): EinvoiceValidationResult {
  const issues: EinvoiceValidationIssue[] = [];
  const fail = (rule: string, message: string) => issues.push({ rule, message });

  let doc: any;
  try {
    const wellFormed = XMLValidator.validate(xml);
    if (wellFormed !== true) {
      const err: any = (wellFormed as any)?.err;
      return { ok: false, issues: [{ rule: 'XML_WELL_FORMED', message: `XML mal formé : ${err?.msg || 'structure invalide'}.` }] };
    }
    doc = parser.parse(xml) as any;
  } catch (error: unknown) {
    return { ok: false, issues: [{ rule: 'XML_WELL_FORMED', message: `XML mal formé : ${error instanceof Error ? error.message : 'erreur'}` }] };
  }
  const invoice = doc?.Invoice;
  if (!invoice || typeof invoice !== 'object') return { ok: false, issues: [{ rule: 'UBL_ROOT', message: 'Racine Invoice absente.' }] };

  const customization = text(invoice['cbc:CustomizationID']);
  if (!customization.startsWith('urn:cen.eu:en16931:2017')) fail('BT-24', 'Identifiant de spécification EN 16931 absent.');
  const profile = text(invoice['cbc:ProfileID']);
  if (!OPERATION_CATEGORIES.includes(profile as (typeof OPERATION_CATEGORIES)[number])) {
    fail('BT-23', `Catégorie de l’opération absente ou invalide (reçu « ${profile} », attendu LB/PS/LBPS).`);
  } else if (profile !== expected.operationCategory) {
    fail('BT-23', 'Catégorie de l’opération différente du document attendu.');
  }
  if (!text(invoice['cbc:ID']).trim()) fail('BT-1', 'Numéro de facture absent.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(invoice['cbc:IssueDate']))) fail('BT-2', 'Date d’émission absente ou invalide.');
  if (!/^[A-Z]{3}$/.test(text(invoice['cbc:DocumentCurrencyCode']))) fail('BT-5', 'Devise absente ou invalide.');
  if (text(invoice['cbc:InvoiceTypeCode']) !== '380' && text(invoice['cbc:InvoiceTypeCode']) !== '381') fail('BT-3', 'Type de document invalide.');

  // Mentions françaises
  const notes = asArray(invoice['cbc:Note']).map(text);
  const hasVatOnPaymentNote = notes.some(n => n === VAT_ON_PAYMENT_NOTICE);
  if (expected.vatOnPayment && !hasVatOnPaymentNote) fail('FR-MENTION-TVA-DEBITS', 'Note « option TVA sur les débits » absente.');
  if (!expected.vatOnPayment && hasVatOnPaymentNote) fail('FR-MENTION-TVA-DEBITS', 'Note « option TVA sur les débits » présente sans option.');

  const seller = (invoice['cac:AccountingSupplierParty']?.['cac:Party'] ?? {}) as any;
  const buyer = (invoice['cac:AccountingCustomerParty']?.['cac:Party'] ?? {}) as any;
  const sellerCompany = seller?.['cac:PartyLegalEntity']?.['cbc:CompanyID'];
  const buyerCompany = buyer?.['cac:PartyLegalEntity']?.['cbc:CompanyID'];
  if (sellerCompany !== undefined) {
    if (String(sellerCompany?.['@schemeID'] ?? '') !== '0002') fail('BT-30', 'Schéma du SIREN vendeur invalide (0002 attendu).');
    if (!/^\d{9}$/.test(text(sellerCompany))) fail('BT-30', 'SIREN vendeur invalide.');
  }
  if (expected.buyerSiren) {
    if (buyerCompany === undefined) fail('FR-MENTION-SIREN-CLIENT', 'SIREN du client absent (mention obligatoire du 1er septembre 2026).');
    else {
      if (String(buyerCompany?.['@schemeID'] ?? '') !== '0002') fail('BT-47', 'Schéma du SIREN client invalide (0002 attendu).');
      if (!/^\d{9}$/.test(text(buyerCompany))) fail('BT-47', 'SIREN du client invalide.');
      if (text(buyerCompany) !== expected.buyerSiren) fail('BT-47', 'SIREN du client différent du document attendu.');
    }
  }
  if (expected.deliveryAddress?.trim()) {
    const deliveryLines = asArray(invoice['cac:Delivery']?.['cac:DeliveryLocation']?.['cac:Address']?.['cac:AddressLine']).map((l: any) => text(l?.['cbc:Line'])).filter(Boolean);
    if (!deliveryLines.length) fail('FR-MENTION-LIVRAISON', 'Adresse de livraison absente alors qu’elle a été fournie.');
  } else if (invoice['cac:Delivery']) {
    fail('FR-MENTION-LIVRAISON', 'Bloc de livraison présent sans adresse de livraison.');
  }

  // Arithmétique EN 16931
  const lines = asArray(invoice['cac:InvoiceLine']);
  if (expected.lineCount > 0 && lines.length !== expected.lineCount) fail('BG-25', `Nombre de lignes inattendu (${lines.length} ≠ ${expected.lineCount}).`);
  const lineNetSum = lines.reduce((sum: number, l: any) => sum + CENT(l?.['cbc:LineExtensionAmount']), 0);
  const taxable = CENT(invoice['cac:LegalMonetaryTotal']?.['cbc:TaxExclusiveAmount']);
  const gross = CENT(invoice['cac:LegalMonetaryTotal']?.['cbc:TaxInclusiveAmount']);
  const payable = CENT(invoice['cac:LegalMonetaryTotal']?.['cbc:PayableAmount']);
  const vatTotal = CENT(invoice['cac:TaxTotal']?.['cbc:TaxAmount']);
  if (lineNetSum !== taxable) fail('BR-CO-10', `Somme des lignes (${lineNetSum / 100}) ≠ base HT (${taxable / 100}).`);
  if (taxable !== CENT(expected.netTotal)) fail('BR-CO-11', 'Base HT différente du total attendu.');
  const subtotal = (asArray(invoice['cac:TaxSubtotal'])[0] ?? {}) as any;
  const subtotalBasis = CENT(subtotal?.['cbc:TaxableAmount']);
  const subtotalVat = CENT(subtotal?.['cbc:TaxAmount']);
  if (subtotalBasis !== taxable) fail('BR-CO-13', 'Base de la ventilation TVA ≠ base HT.');
  if (subtotalVat !== vatTotal) fail('BR-CO-14', 'TVA de la ventilation ≠ TVA totale.');
  const category = text(subtotal?.['cac:TaxCategory']?.['cbc:ID']);
  const percent = CENT(subtotal?.['cac:TaxCategory']?.['cbc:Percent']);
  if (category === 'S') {
    if (percent !== CENT(expected.vatRate)) fail('BR-CO-17', 'Taux de la ventilation TVA différent du taux attendu.');
    const recomputed = Math.round(taxable * expected.vatRate / 100) / 100;
    if (Math.abs(recomputed - vatTotal / 100) > 0.02) fail('BR-CO-17', `TVA calculée (${recomputed.toFixed(2)}) ≠ TVA déclarée (${vatTotal / 100}).`);
  } else if (category === 'E') {
    if (percent !== 0) fail('BR-CO-17', 'Catégorie E avec taux non nul.');
    const reason = text(subtotal?.['cac:TaxCategory']?.['cbc:TaxExemptionReason']);
    if (!reason.includes('293 B')) fail('BR-E-10', 'Motif d’exonération « TVA non applicable, art. 293 B du CGI » absent.');
  } else {
    fail('BG-23', 'Catégorie de TVA inattendue.');
  }
  if (gross !== vatTotal + taxable) fail('BR-CO-15', 'Total TTC ≠ HT + TVA.');
  if (payable !== gross) fail('BR-CO-16', 'Montant à payer ≠ total TTC.');
  if (gross !== CENT(expected.grossTotal)) fail('BR-CO-16', 'Total TTC différent du total attendu.');

  return { ok: issues.length === 0, issues };
}

/** Valide un XML CII D16B généré (CrossIndustryInvoice). */
export function validateCii(xml: string, expected: {
  operationCategory: string;
  buyerSiren: string | null;
  vatOnPayment: boolean;
  deliveryAddress: string | null;
  netTotal: number;
  vatAmount: number;
  grossTotal: number;
  vatRate: number;
  lineCount: number;
}): EinvoiceValidationResult {
  const issues: EinvoiceValidationIssue[] = [];
  const fail = (rule: string, message: string) => issues.push({ rule, message });

  let doc: any;
  try {
    const wellFormed = XMLValidator.validate(xml);
    if (wellFormed !== true) {
      const err: any = (wellFormed as any)?.err;
      return { ok: false, issues: [{ rule: 'XML_WELL_FORMED', message: `XML mal formé : ${err?.msg || 'structure invalide'}.` }] };
    }
    doc = parser.parse(xml) as any;
  } catch (error: unknown) {
    return { ok: false, issues: [{ rule: 'XML_WELL_FORMED', message: `XML mal formé : ${error instanceof Error ? error.message : 'erreur'}` }] };
  }
  const root = doc?.['rsm:CrossIndustryInvoice'];
  if (!root || typeof root !== 'object') return { ok: false, issues: [{ rule: 'CII_ROOT', message: 'Racine rsm:CrossIndustryInvoice absente.' }] };

  const context = root['rsm:ExchangedDocumentContext'];
  const businessProcess = text(context?.['ram:BusinessProcessSpecifiedDocumentContextParameter']?.['ram:ID']);
  const guideline = text(context?.['ram:GuidelineSpecifiedDocumentContextParameter']?.['ram:ID']);
  if (!guideline.startsWith('urn:factur-x.eu:1p0:facturx')) fail('FR-PROFIL', 'Guideline profil Factur-X absente.');
  if (!OPERATION_CATEGORIES.includes(businessProcess as (typeof OPERATION_CATEGORIES)[number])) {
    fail('BT-23', `Catégorie de l’opération absente ou invalide (reçu « ${businessProcess} », attendu LB/PS/LBPS).`);
  } else if (businessProcess !== expected.operationCategory) {
    fail('BT-23', 'Catégorie de l’opération différente du document attendu.');
  }

  const document = root['rsm:ExchangedDocument'];
  if (!text(document?.['ram:ID']).trim()) fail('BT-1', 'Numéro de facture absent.');
  if (text(document?.['ram:TypeCode']) !== '380' && text(document?.['ram:TypeCode']) !== '381') fail('BT-3', 'Type de document invalide.');
  const issueRaw = text(document?.['ram:IssueDateTime']?.['udt:DateTimeString']);
  if (!/^\d{8}$/.test(issueRaw)) fail('BT-2', 'Date d’émission absente ou invalide.');

  const notes = asArray(document?.['ram:IncludedNote']).map((n: any) => text(n?.['ram:Content']));
  const hasVatOnPaymentNote = notes.some(n => n === VAT_ON_PAYMENT_NOTICE);
  if (expected.vatOnPayment && !hasVatOnPaymentNote) fail('FR-MENTION-TVA-DEBITS', 'Note « option TVA sur les débits » absente.');
  if (!expected.vatOnPayment && hasVatOnPaymentNote) fail('FR-MENTION-TVA-DEBITS', 'Note « option TVA sur les débits » présente sans option.');

  const agreement = (root['rsm:SupplyChainTradeTransaction']?.['ram:ApplicableHeaderTradeAgreement'] ?? {}) as any;
  const seller = agreement?.['ram:SellerTradeParty'] ?? {};
  const buyer = agreement?.['ram:BuyerTradeParty'] ?? {};
  const sellerOrg = seller?.['ram:SpecifiedLegalOrganization'] ?? null;
  const buyerOrg = buyer?.['ram:SpecifiedLegalOrganization'] ?? null;
  const sellerSiren = text(sellerOrg?.['ram:ID']);
  const buyerSiren = text(buyerOrg?.['ram:ID']);
  if (sellerOrg) {
    if (String(sellerOrg?.['ram:ID']?.['@schemeIdentifier'] ?? '') !== '0002') fail('BT-30', 'Schéma du SIREN vendeur invalide (0002 attendu).');
    if (!/^\d{9}$/.test(sellerSiren)) fail('BT-30', 'SIREN vendeur invalide.');
  }
  if (expected.buyerSiren) {
    if (!buyerOrg) fail('FR-MENTION-SIREN-CLIENT', 'SIREN du client absent (mention obligatoire du 1er septembre 2026).');
    else {
      if (String(buyerOrg?.['ram:ID']?.['@schemeIdentifier'] ?? '') !== '0002') fail('BT-47', 'Schéma du SIREN client invalide (0002 attendu).');
      if (!/^\d{9}$/.test(buyerSiren)) fail('BT-47', 'SIREN du client invalide.');
      if (buyerSiren !== expected.buyerSiren) fail('BT-47', 'SIREN du client différent du document attendu.');
    }
  }
  if (expected.deliveryAddress?.trim()) {
    const shipTo = root['rsm:SupplyChainTradeTransaction']?.['ram:ApplicableHeaderTradeDelivery']?.['ram:ShipToTradeParty'];
    const deliveryLines = [text(shipTo?.['ram:PostalTradeAddress']?.['ram:LineOne']), text(shipTo?.['ram:PostalTradeAddress']?.['ram:LineTwo'])].filter(Boolean);
    if (!deliveryLines.length) fail('FR-MENTION-LIVRAISON', 'Adresse de livraison absente alors qu’elle a été fournie.');
  }

  // Arithmétique
  const transaction = root['rsm:SupplyChainTradeTransaction'];
  const lines = asArray(transaction?.['ram:IncludedSupplyChainTradeLineItem']);
  if (expected.lineCount > 0 && lines.length !== expected.lineCount) fail('BG-25', `Nombre de lignes inattendu (${lines.length} ≠ ${expected.lineCount}).`);
  const lineNetSum = lines.reduce((sum: number, l: any) => sum + CENT(l?.['ram:SpecifiedLineTradeSettlement']?.['ram:SpecifiedTradeSettlementLineMonetarySummation']?.['ram:LineTotalAmount']), 0);
  const summation = transaction?.['ram:ApplicableHeaderTradeSettlement']?.['ram:SpecifiedTradeSettlementHeaderMonetarySummation'];
  const basis = CENT(summation?.['ram:TaxBasisTotalAmount']);
  const vatTotal = CENT(summation?.['ram:TaxTotalAmount']);
  const grand = CENT(summation?.['ram:GrandTotalAmount']);
  const due = CENT(summation?.['ram:DuePayableAmount']);
  if (lineNetSum !== basis) fail('BR-CO-10', `Somme des lignes (${lineNetSum / 100}) ≠ base HT (${basis / 100}).`);
  if (basis !== CENT(expected.netTotal)) fail('BR-CO-11', 'Base HT différente du total attendu.');
  const tax = transaction?.['ram:ApplicableHeaderTradeSettlement']?.['ram:ApplicableTradeTax'];
  const taxCategory = text(tax?.['ram:CategoryCode']);
  const taxPercent = CENT(tax?.['ram:RateApplicablePercent']);
  if (CENT(tax?.['ram:BasisAmount']) !== basis) fail('BR-CO-13', 'Base de la ventilation TVA ≠ base HT.');
  if (CENT(tax?.['ram:CalculatedAmount']) !== vatTotal) fail('BR-CO-14', 'TVA de la ventilation ≠ TVA totale.');
  if (taxCategory === 'S') {
    if (taxPercent !== CENT(expected.vatRate)) fail('BR-CO-17', 'Taux de la ventilation TVA différent du taux attendu.');
    const recomputed = Math.round(basis * expected.vatRate / 100) / 100;
    if (Math.abs(recomputed - vatTotal / 100) > 0.02) fail('BR-CO-17', `TVA calculée (${recomputed.toFixed(2)}) ≠ TVA déclarée (${vatTotal / 100}).`);
  } else if (taxCategory === 'E') {
    if (taxPercent !== 0) fail('BR-CO-17', 'Catégorie E avec taux non nul.');
    if (!text(tax?.['ram:ExemptionReason']).includes('293 B')) fail('BR-E-10', 'Motif d’exonération « TVA non applicable, art. 293 B du CGI » absent.');
  } else {
    fail('BG-23', 'Catégorie de TVA inattendue.');
  }
  if (grand !== basis + vatTotal) fail('BR-CO-15', 'Total TTC ≠ HT + TVA.');
  if (due !== grand) fail('BR-CO-16', 'Montant à payer ≠ total TTC.');
  if (grand !== CENT(expected.grossTotal)) fail('BR-CO-16', 'Total TTC différent du total attendu.');

  return { ok: issues.length === 0, issues };
}
