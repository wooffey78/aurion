export type ElectronicInvoiceProfile = {
  platformName: string | null;
  platformIdentifier: string | null;
  registrationStatus: 'not_registered' | 'candidate' | 'registered';
  routingIdentifier: string | null;
};

export function buildStructuredInvoice(row: any, items: any[] = []) {
  return {
    format: 'JSON de préparation Aurion',
    standard: null,
    profile: null,
    status: 'prepared_not_transmitted',
    invoiceNumber: row.number,
    issueDate: row.created_at,
    seller: { name: row.company_name, siren: row.siren, siret: row.siret },
    buyer: { name: row.client_name, email: row.client_email, address: row.client_address },
    totals: { net: Number(row.total_ht || 0), tax: Number(row.total_tva || 0), gross: Number(row.total_ttc || 0) },
    items: items.map(i => ({ description: i.label, quantity: Number(i.quantity), unitPrice: Number(i.unit_price || 0) })),
    payment: { status: row.payment_status || 'unpaid', amountPaid: Number(row.amount_paid || 0), dueDate: row.due_at || null },
    compliance: {
      platformRequired: true,
      platformIdentifier: null,
      transmissionStatus: 'not_implemented',
      eReportingStatus: 'not_transmitted',
      notice: 'Ce fichier JSON ne constitue pas une facture Factur-X ou UBL conforme et ne transmet aucune donnée à une plateforme agréée ni à l’administration fiscale.',
    },
  };
}
