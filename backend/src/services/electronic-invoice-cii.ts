// Bloc 4 — génération du format CII D16B (Cross Industry Invoice UN/CEFACT, profil
// Factur-X « BASIC »), le XML structuré transporté par Factur-X et accepté par les PA.
//
// Le fichier produit ici est le XML CII autonome (rsm:CrossIndustryInvoice). L'ASSEMBLAGE
// Factur-X complet (PDF/A-3 avec pièce jointe CII + métadonnées XMP) n'est PAS livré à ce
// stade : aucune chaîne de validation PDF/A n'est disponible pour garantir la conformité du
// conteneur, et le prompt interdit toute prétention de conformité non prouvée. La transmission
// d'un document XML CII/UBL est le périmètre effectivement choisi pour l'émission (cf.
// PLATEFORME-AGREEE.md § 9).
//
// Correspondances des mentions françaises (cf. PLATEFORME-AGREEE.md) :
//   - catégorie de l'opération (BT-23)  -> ExchangedDocumentContext/BusinessProcess…/ID
//   - SIREN du client (BT-47)           -> BuyerTradeParty/SpecifiedLegalOrganization/ID@schemeIdentifier="0002"
//   - option TVA sur les débits         -> IncludedNote (BT-21/BT-22)
//   - adresse de livraison (BT-79/80)   -> ApplicableHeaderTradeDelivery/ShipToTradeParty

import { OPERATION_CATEGORIES, VAT_EXEMPTION_REASON, VAT_ON_PAYMENT_NOTICE, type EinvoiceDocument, type OperationCategory } from './electronic-invoice-ubl.js';

const XML_ESCAPE = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export const CII_GUIDELINE_ID = 'urn:factur-x.eu:1p0:facturx-basic';

const money = (value: number): string => {
  const cents = Math.round((Number(value) + Number.EPSILON) * 100);
  if (!Number.isFinite(cents)) throw new Error('Montant non numérique.');
  return (cents / 100).toFixed(2);
};

const ciiDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // format="102" : CCYYMMDD
  return date.toISOString().slice(0, 10).replace(/-/g, '');
};

const lineAddress = (address: string | null): string[] => {
  if (!address) return [];
  return String(address).split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6);
};

/** Génère le document CII D16B (profil Factur-X BASIC) complet. */
export function generateCiiInvoice(doc: EinvoiceDocument): string {
  if (!doc.number?.trim()) throw new Error('Numéro de facture obligatoire.');
  const issueDate = ciiDate(doc.issueDate);
  if (!issueDate) throw new Error('Date d’émission invalide.');
  const dueDate = ciiDate(doc.dueDate);
  if (!OPERATION_CATEGORIES.includes(doc.operationCategory as OperationCategory)) throw new Error('Catégorie d’opération invalide (LB/PS/LBPS).');
  if (doc.buyer.siren && !/^\d{9}$/.test(doc.buyer.siren)) throw new Error('SIREN client invalide.');
  if (doc.seller.siren && !/^\d{9}$/.test(doc.seller.siren)) throw new Error('SIREN vendeur invalide.');
  if (doc.seller.siret && !/^\d{14}$/.test(doc.seller.siret)) throw new Error('SIRET vendeur invalide.');
  const typeCode = doc.typeCode || '380';

  const lines: string[] = [];
  const push = (indent: number, text: string) => lines.push(`${'  '.repeat(indent)}${text}`);

  push(0, '<?xml version="1.0" encoding="UTF-8"?>');
  push(0, '<rsm:CrossIndustryInvoice');
  push(1, 'xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"');
  push(1, 'xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"');
  push(1, 'xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"');
  push(1, 'xmlns:xs="http://www.w3.org/2001/XMLSchema"');
  push(1, 'xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">');
  push(1, '<rsm:ExchangedDocumentContext>');
  // BT-23 : catégorie de l'opération (codes LB/PS/LBPS des spécifications externes DGFiP).
  push(2, '<ram:BusinessProcessSpecifiedDocumentContextParameter>');
  push(3, `<ram:ID>${XML_ESCAPE(doc.operationCategory)}</ram:ID>`);
  push(2, '</ram:BusinessProcessSpecifiedDocumentContextParameter>');
  push(2, '<ram:GuidelineSpecifiedDocumentContextParameter>');
  push(3, `<ram:ID>${XML_ESCAPE(CII_GUIDELINE_ID)}</ram:ID>`);
  push(2, '</ram:GuidelineSpecifiedDocumentContextParameter>');
  push(1, '</rsm:ExchangedDocumentContext>');
  push(1, '<rsm:ExchangedDocument>');
  push(2, `<ram:ID>${XML_ESCAPE(doc.number)}</ram:ID>`);
  push(2, `<ram:TypeCode>${XML_ESCAPE(typeCode)}</ram:TypeCode>`);
  push(2, '<ram:IssueDateTime>');
  push(3, `<udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>`);
  push(2, '</ram:IssueDateTime>');
  if (doc.vatOnPayment) {
    push(2, '<ram:IncludedNote>');
    push(3, `<ram:Content>${XML_ESCAPE(VAT_ON_PAYMENT_NOTICE)}</ram:Content>`);
    push(2, '</ram:IncludedNote>');
  }
  push(1, '</rsm:ExchangedDocument>');

  push(1, '<rsm:SupplyChainTradeTransaction>');
  let lineId = 0;
  for (const line of doc.lines) {
    lineId += 1;
    push(2, '<ram:IncludedSupplyChainTradeLineItem>');
    push(3, '<ram:AssociatedDocumentLineDocument>');
    push(4, `<ram:LineID>${lineId}</ram:LineID>`);
    push(3, '</ram:AssociatedDocumentLineDocument>');
    push(3, '<ram:SpecifiedTradeProduct>');
    push(4, `<ram:Name>${XML_ESCAPE(line.label)}</ram:Name>`);
    push(3, '</ram:SpecifiedTradeProduct>');
    push(3, '<ram:SpecifiedLineTradeAgreement>');
    push(4, '<ram:NetPriceProductTradePrice>');
    push(5, `<ram:ChargeAmount>${money(line.unitPrice)}</ram:ChargeAmount>`);
    push(4, '</ram:NetPriceProductTradePrice>');
    push(3, '</ram:SpecifiedLineTradeAgreement>');
    push(3, '<ram:SpecifiedLineTradeDelivery>');
    push(4, `<ram:BilledQuantity unitCode="C62">${money(line.quantity)}</ram:BilledQuantity>`);
    push(3, '</ram:SpecifiedLineTradeDelivery>');
    push(3, '<ram:SpecifiedLineTradeSettlement>');
    push(4, '<ram:ApplicableTradeTax>');
    push(5, `<ram:TypeCode>VAT</ram:TypeCode>`);
    push(5, `<ram:CategoryCode>${doc.vatRate > 0 ? 'S' : 'E'}</ram:CategoryCode>`);
    push(5, `<ram:RateApplicablePercent>${money(doc.vatRate)}</ram:RateApplicablePercent>`);
    push(4, '</ram:ApplicableTradeTax>');
    push(4, '<ram:SpecifiedTradeSettlementLineMonetarySummation>');
    push(5, `<ram:LineTotalAmount>${money(line.net)}</ram:LineTotalAmount>`);
    push(4, '</ram:SpecifiedTradeSettlementLineMonetarySummation>');
    push(3, '</ram:SpecifiedLineTradeSettlement>');
    push(2, '</ram:IncludedSupplyChainTradeLineItem>');
  }

  push(2, '<ram:ApplicableHeaderTradeAgreement>');
  push(3, '<ram:SellerTradeParty>');
  push(4, `<ram:Name>${XML_ESCAPE(doc.seller.name)}</ram:Name>`);
  push(4, '<ram:PostalTradeAddress>');
  const sellerLines = lineAddress(doc.seller.address);
  if (sellerLines[0]) push(5, `<ram:LineOne>${XML_ESCAPE(sellerLines[0])}</ram:LineOne>`);
  if (sellerLines[1]) push(5, `<ram:LineTwo>${XML_ESCAPE(sellerLines[1])}</ram:LineTwo>`);
  push(5, '<ram:CountryID>FR</ram:CountryID>');
  push(4, '</ram:PostalTradeAddress>');
  if (doc.seller.siren) {
    // BT-30 : SIREN vendeur (schéma 0002).
    push(4, '<ram:SpecifiedLegalOrganization>');
    push(5, `<ram:ID schemeIdentifier="0002">${XML_ESCAPE(doc.seller.siren)}</ram:ID>`);
    push(4, '</ram:SpecifiedLegalOrganization>');
  }
  push(3, '</ram:SellerTradeParty>');
  push(3, '<ram:BuyerTradeParty>');
  push(4, `<ram:Name>${XML_ESCAPE(doc.buyer.name)}</ram:Name>`);
  push(4, '<ram:PostalTradeAddress>');
  const buyerLines = lineAddress(doc.buyer.address);
  if (buyerLines[0]) push(5, `<ram:LineOne>${XML_ESCAPE(buyerLines[0])}</ram:LineOne>`);
  if (buyerLines[1]) push(5, `<ram:LineTwo>${XML_ESCAPE(buyerLines[1])}</ram:LineTwo>`);
  push(5, '<ram:CountryID>FR</ram:CountryID>');
  push(4, '</ram:PostalTradeAddress>');
  if (doc.buyer.siren) {
    // BT-47 : SIREN du client (schéma 0002) — mention obligatoire du 1er septembre 2026.
    push(4, '<ram:SpecifiedLegalOrganization>');
    push(5, `<ram:ID schemeIdentifier="0002">${XML_ESCAPE(doc.buyer.siren)}</ram:ID>`);
    push(4, '</ram:SpecifiedLegalOrganization>');
  }
  push(3, '</ram:BuyerTradeParty>');
  push(2, '</ram:ApplicableHeaderTradeAgreement>');

  push(2, '<ram:ApplicableHeaderTradeDelivery>');
  if (doc.deliveryAddress?.trim()) {
    push(3, '<ram:ShipToTradeParty>');
    push(4, '<ram:PostalTradeAddress>');
    const deliveryLines = lineAddress(doc.deliveryAddress);
    if (deliveryLines[0]) push(5, `<ram:LineOne>${XML_ESCAPE(deliveryLines[0])}</ram:LineOne>`);
    if (deliveryLines[1]) push(5, `<ram:LineTwo>${XML_ESCAPE(deliveryLines[1])}</ram:LineTwo>`);
    push(5, '<ram:CountryID>FR</ram:CountryID>');
    push(4, '</ram:PostalTradeAddress>');
    push(3, '</ram:ShipToTradeParty>');
  }
  push(2, '</ram:ApplicableHeaderTradeDelivery>');

  push(2, '<ram:ApplicableHeaderTradeSettlement>');
  push(3, '<ram:ApplicableTradeTax>');
  push(4, `<ram:CalculatedAmount>${money(doc.vatAmount)}</ram:CalculatedAmount>`);
  push(4, '<ram:TypeCode>VAT</ram:TypeCode>');
  push(4, `<ram:BasisAmount>${money(doc.netTotal)}</ram:BasisAmount>`);
  push(4, `<ram:CategoryCode>${doc.vatRate > 0 ? 'S' : 'E'}</ram:CategoryCode>`);
  if (doc.vatRate === 0) push(4, `<ram:ExemptionReason>${XML_ESCAPE(VAT_EXEMPTION_REASON)}</ram:ExemptionReason>`);
  push(4, `<ram:RateApplicablePercent>${money(doc.vatRate)}</ram:RateApplicablePercent>`);
  push(3, '</ram:ApplicableTradeTax>');
  if (dueDate) {
    push(3, '<ram:SpecifiedTradePaymentTerms>');
    push(4, '<ram:DueDateDateTime>');
    push(5, `<udt:DateTimeString format="102">${dueDate}</udt:DateTimeString>`);
    push(4, '</ram:DueDateDateTime>');
    push(3, '</ram:SpecifiedTradePaymentTerms>');
  }
  push(3, '<ram:SpecifiedTradeSettlementHeaderMonetarySummation>');
  push(4, `<ram:LineTotalAmount>${money(doc.netTotal)}</ram:LineTotalAmount>`);
  push(4, `<ram:TaxBasisTotalAmount>${money(doc.netTotal)}</ram:TaxBasisTotalAmount>`);
  push(4, `<ram:TaxTotalAmount currencyID="${XML_ESCAPE(doc.currency)}">${money(doc.vatAmount)}</ram:TaxTotalAmount>`);
  push(4, `<ram:GrandTotalAmount>${money(doc.grossTotal)}</ram:GrandTotalAmount>`);
  push(4, `<ram:DuePayableAmount>${money(doc.grossTotal)}</ram:DuePayableAmount>`);
  push(3, '</ram:SpecifiedTradeSettlementHeaderMonetarySummation>');
  push(2, '</ram:ApplicableHeaderTradeSettlement>');
  push(1, '</rsm:SupplyChainTradeTransaction>');
  push(0, '</rsm:CrossIndustryInvoice>');
  return lines.join('\n') + '\n';
}
