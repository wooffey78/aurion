export type ElectronicInvoiceProfile = {
  platformName: string | null;
  platformIdentifier: string | null;
  registrationStatus: 'not_registered' | 'candidate' | 'registered';
  routingIdentifier: string | null;
};

export function buildStructuredInvoice(row: any, items: any[] = []) {
  return {
    standard: 'Factur-X',
    profile: row.electronic_profile || 'factur-x',
    status: row.electronic_status || 'prepared',
    invoiceNumber: row.number,
    issueDate: row.created_at,
    seller: { name: row.company_name, siren: row.siren, siret: row.siret },
    buyer: { name: row.client_name, email: row.client_email, address: row.client_address },
    totals: { net: Number(row.total_ht || 0), tax: Number(row.total_tva || 0), gross: Number(row.total_ttc || 0) },
    items: items.map(i => ({ description: i.label, quantity: Number(i.quantity), unitPrice: Number(i.unit_price || 0) })),
    payment: { status: row.payment_status || 'unpaid', amountPaid: Number(row.amount_paid || 0), dueDate: row.due_at || null },
    compliance: { platformRequired: true, platformIdentifier: null, eReportingStatus: 'prepared' },
  };
}
