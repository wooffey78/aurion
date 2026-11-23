// Bloc 4 — génération du format UBL 2.1 (Invoice, CIUS EN 16931).
//
// Le document est produit de manière déterministe à partir de l'instantané de la facture.
// Les éléments portent les BT (business terms) EN 16931 ; la correspondance des mentions
// françaises du 1er septembre 2026 est documentée dans docs/PLATEFORME-AGREEE.md :
//   - catégorie de l'opération (BT-23, codes LB/PS/LBPS)  -> cbc:ProfileID
//   - SIREN du client (BT-47, schéma ISO 6523 « 0002 »)   -> PartyLegalEntity/cbc:CompanyID
//   - option TVA sur les débits (le cas échéant)          -> cbc:Note (BT-21/BT-22)
//   - adresse de livraison si différente (BT-79/BT-80)    -> cac:Delivery
//
// Identifiant de spécification (BT-24) : « urn:cen.eu:en16931:2017 » (CIUS noyau EN 16931).
// La chaîne de personnalisation propre à la PA retenue sera alignée lors de la validation
// sandbox (aucune PA contractuelle connectée à ce stade — cf. PLATEFORME-AGREEE.md § 9).

const XML_ESCAPE = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export const UBL_CUSTOMIZATION_ID = 'urn:cen.eu:en16931:2017';
/** Codes BT-23 définis par les spécifications externes DGFiP (livraison de biens / prestation / double). */
export const OPERATION_CATEGORIES = ['LB', 'PS', 'LBPS'] as const;
export type OperationCategory = (typeof OPERATION_CATEGORIES)[number];
/** Mention exacte de l'option TVA sur les débits (art. 242 ter I-8 CGI, mention « le cas échéant »). */
export const VAT_ON_PAYMENT_NOTICE = 'Option pour le paiement de la TVA sur les débits acceptée.';
/** Motif d'exonération attendu pour la catégorie E (micro-entrepreneur en franchise en base). */
export const VAT_EXEMPTION_REASON = 'TVA non applicable, art. 293 B du CGI';

export type EinvoiceSeller = {
  name: string;
  siren: string | null;
  siret: string | null;
  address: string | null;
  email: string | null;
};

export type EinvoiceBuyer = {
  name: string;
  siren: string | null;
  address: string | null;
  email: string | null;
};

export type EinvoiceLine = {
  label: string;
  quantity: number;
  unitPrice: number;
  net: number;
};

export type EinvoiceDocument = {
  number: string;
  issueDate: string;      // ISO date (YYYY-MM-DD)
  dueDate: string | null;
  currency: string;       // EUR
  operationCategory: OperationCategory;
  vatOnPayment: boolean;
  deliveryAddress: string | null;
  seller: EinvoiceSeller;
  buyer: EinvoiceBuyer;
  lines: EinvoiceLine[];
  vatRate: number;        // 0 => franchise (catégorie E + motif d'exonération)
  vatAmount: number;
  netTotal: number;
  grossTotal: number;
  /** Type de document : 380 facture commerciale (par défaut), 381 avoir. */
  typeCode?: string;
};

const money = (value: number): string => {
  const cents = Math.round((Number(value) + Number.EPSILON) * 100);
  if (!Number.isFinite(cents)) throw new Error('Montant non numérique.');
  return (cents / 100).toFixed(2);
};

const dateIso = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const lineAddress = (address: string | null): string[] => {
  if (!address) return [];
  return String(address).split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6);
};

/** Génère le document UBL 2.1 complet (chaîne XML UTF-8, indentée pour lisibilité). */
export function generateUblInvoice(doc: EinvoiceDocument): string {
  if (!doc.number?.trim()) throw new Error('Numéro de facture obligatoire.');
  const issueDate = dateIso(doc.issueDate);
  if (!issueDate) throw new Error('Date d’émission invalide.');
  const dueDate = dateIso(doc.dueDate);
  if (!OPERATION_CATEGORIES.includes(doc.operationCategory)) throw new Error('Catégorie d’opération invalide (LB/PS/LBPS).');
  if (doc.buyer.siren && !/^\d{9}$/.test(doc.buyer.siren)) throw new Error('SIREN client invalide.');
  if (doc.seller.siren && !/^\d{9}$/.test(doc.seller.siren)) throw new Error('SIREN vendeur invalide.');
  if (doc.seller.siret && !/^\d{14}$/.test(doc.seller.siret)) throw new Error('SIRET vendeur invalide.');
  const typeCode = doc.typeCode || '380';

  const lines: string[] = [];
  const push = (indent: number, text: string) => lines.push(`${'  '.repeat(indent)}${text}`);

  push(0, '<?xml version="1.0" encoding="UTF-8"?>');
  push(0, '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
  push(1, 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"');
  push(1, 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">');
  push(1, `<cbc:CustomizationID>${XML_ESCAPE(UBL_CUSTOMIZATION_ID)}</cbc:CustomizationID>`);
  // BT-23 : catégorie de l'opération, transportée dans cbc:ProfileID (liaison EN 16931 UBL).
  push(1, `<cbc:ProfileID>${XML_ESCAPE(doc.operationCategory)}</cbc:ProfileID>`);
  push(1, `<cbc:ID>${XML_ESCAPE(doc.number)}</cbc:ID>`);
  push(1, `<cbc:IssueDate>${issueDate}</cbc:IssueDate>`);
  if (dueDate) push(1, `<cbc:DueDate>${dueDate}</cbc:DueDate>`);
  push(1, `<cbc:DocumentCurrencyCode>${XML_ESCAPE(doc.currency)}</cbc:DocumentCurrencyCode>`);
  push(1, `<cbc:InvoiceTypeCode>${XML_ESCAPE(typeCode)}</cbc:InvoiceTypeCode>`);
  if (doc.vatOnPayment) {
    // BT-21/BT-22 : mention légale française portée en note de facture (mécanisme standard
    // EN 16931 pour les mentions non modélisées dans le noyau). Texte exact conservé.
    push(1, `<cbc:Note>${XML_ESCAPE(VAT_ON_PAYMENT_NOTICE)}</cbc:Note>`);
  }
  if (doc.buyer.siren) {
    // Référence acheteur complémentaire : le SIREN client est porté en BT-47 ci-dessous ;
    // cbc:BuyerReference reste libre (non utilisée).
    push(1, `<cbc:BuyerReference>${XML_ESCAPE(doc.buyer.name.slice(0, 120))}</cbc:BuyerReference>`);
  }

  // Vendeur (BG-4)
  push(1, '<cac:AccountingSupplierParty>');
  push(2, '<cac:Party>');
  push(3, '<cac:PartyName>');
  push(4, `<cbc:Name>${XML_ESCAPE(doc.seller.name)}</cbc:Name>`);
  push(3, '</cac:PartyName>');
  push(3, '<cac:PostalAddress>');
  for (const l of lineAddress(doc.seller.address)) push(4, `<cac:AddressLine><cbc:Line>${XML_ESCAPE(l)}</cbc:Line></cac:AddressLine>`);
  push(4, '<cac:Country><cbc:IdentificationCode>FR</cbc:IdentificationCode></cac:Country>');
  push(3, '</cac:PostalAddress>');
  if (doc.seller.siret) {
    // BT-29 : identifiant vendeur (SIRET, schéma 0009).
    push(3, '<cac:PartyIdentification><cbc:ID schemeID="0009">' + XML_ESCAPE(doc.seller.siret) + '</cbc:ID></cac:PartyIdentification>');
  }
  if (doc.seller.siren) {
    // BT-30 : immatriculation légale vendeur (SIREN, schéma 0002).
    push(3, '<cac:PartyLegalEntity><cbc:CompanyID schemeID="0002">' + XML_ESCAPE(doc.seller.siren) + '</cbc:CompanyID></cac:PartyLegalEntity>');
  }
  if (doc.seller.email) {
    push(3, `<cac:Contact><cbc:ElectronicMail>${XML_ESCAPE(doc.seller.email)}</cbc:ElectronicMail></cac:Contact>`);
  }
  push(2, '</cac:Party>');
  push(1, '</cac:AccountingSupplierParty>');

  // Acheteur (BG-7)
  push(1, '<cac:AccountingCustomerParty>');
  push(2, '<cac:Party>');
  push(3, '<cac:PartyName>');
  push(4, `<cbc:Name>${XML_ESCAPE(doc.buyer.name)}</cbc:Name>`);
  push(3, '</cac:PartyName>');
  push(3, '<cac:PostalAddress>');
  for (const l of lineAddress(doc.buyer.address)) push(4, `<cac:AddressLine><cbc:Line>${XML_ESCAPE(l)}</cbc:Line></cac:AddressLine>`);
  push(4, '<cac:Country><cbc:IdentificationCode>FR</cbc:IdentificationCode></cac:Country>');
  push(3, '</cac:PostalAddress>');
  if (doc.buyer.siren) {
    // BT-47 : immatriculation légale acheteur (SIREN du client, schéma 0002).
    push(3, '<cac:PartyLegalEntity><cbc:CompanyID schemeID="0002">' + XML_ESCAPE(doc.buyer.siren) + '</cbc:CompanyID></cac:PartyLegalEntity>');
  }
  if (doc.buyer.email) {
    push(3, `<cac:Contact><cbc:ElectronicMail>${XML_ESCAPE(doc.buyer.email)}</cbc:ElectronicMail></cac:Contact>`);
  }
  push(2, '</cac:Party>');
  push(1, '</cac:AccountingCustomerParty>');

  // Livraison si différente de la facturation (BT-79 date réelle + BT-80 adresse de livraison)
  if (doc.deliveryAddress?.trim()) {
    push(1, '<cac:Delivery>');
    push(2, `<cbc:ActualDeliveryDate>${issueDate}</cbc:ActualDeliveryDate>`);
    push(2, '<cac:DeliveryLocation>');
    push(3, '<cac:Address>');
    for (const l of lineAddress(doc.deliveryAddress)) push(4, `<cac:AddressLine><cbc:Line>${XML_ESCAPE(l)}</cbc:Line></cac:AddressLine>`);
    push(4, '<cac:Country><cbc:IdentificationCode>FR</cbc:IdentificationCode></cac:Country>');
    push(3, '</cac:Address>');
    push(2, '</cac:DeliveryLocation>');
    push(1, '</cac:Delivery>');
  }

  // Lignes de facture (BG-25)
  let lineId = 0;
  for (const line of doc.lines) {
    lineId += 1;
    push(1, '<cac:InvoiceLine>');
    push(2, `<cbc:ID>${lineId}</cbc:ID>`);
    push(2, `<cbc:InvoicedQuantity unitCode="C62">${money(line.quantity)}</cbc:InvoicedQuantity>`);
    push(2, `<cbc:LineExtensionAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(line.net)}</cbc:LineExtensionAmount>`);
    push(2, '<cac:Item>');
    push(3, `<cbc:Name>${XML_ESCAPE(line.label)}</cbc:Name>`);
    push(2, '</cac:Item>');
    push(2, '<cac:Price>');
    push(3, `<cbc:PriceAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(line.unitPrice)}</cbc:PriceAmount>`);
    push(2, '</cac:Price>');
    push(1, '</cac:InvoiceLine>');
  }

  // Ventilation de TVA (BG-23) : une catégorie unique (S standard, E exonéré).
  const vatCategory = doc.vatRate > 0 ? 'S' : 'E';
  push(1, '<cac:TaxSubtotal>');
  push(2, `<cbc:TaxableAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(doc.netTotal)}</cbc:TaxableAmount>`);
  push(2, `<cbc:TaxAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(doc.vatAmount)}</cbc:TaxAmount>`);
  push(2, '<cac:TaxCategory>');
  push(3, `<cbc:ID>${vatCategory}</cbc:ID>`);
  if (vatCategory === 'E') push(3, `<cbc:TaxExemptionReason>${XML_ESCAPE(VAT_EXEMPTION_REASON)}</cbc:TaxExemptionReason>`);
  push(3, `<cbc:Percent>${money(doc.vatRate)}</cbc:Percent>`);
  push(3, '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>');
  push(2, '</cac:TaxCategory>');
  push(1, '</cac:TaxSubtotal>');

  push(1, '<cac:TaxTotal>');
  push(2, `<cbc:TaxAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(doc.vatAmount)}</cbc:TaxAmount>`);
  push(1, '</cac:TaxTotal>');

  push(1, '<cac:LegalMonetaryTotal>');
  push(2, `<cbc:LineExtensionAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(doc.netTotal)}</cbc:LineExtensionAmount>`);
  push(2, `<cbc:TaxExclusiveAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(doc.netTotal)}</cbc:TaxExclusiveAmount>`);
  push(2, `<cbc:TaxInclusiveAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(doc.grossTotal)}</cbc:TaxInclusiveAmount>`);
  push(2, `<cbc:PayableAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(doc.grossTotal)}</cbc:PayableAmount>`);
  push(1, '</cac:LegalMonetaryTotal>');

  push(0, '</Invoice>');
  return lines.join('\n') + '\n';
}
