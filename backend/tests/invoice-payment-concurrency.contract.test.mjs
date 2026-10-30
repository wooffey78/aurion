import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route=readFileSync(new URL('../src/routes/business.ts',import.meta.url),'utf8');
test('la lecture de l’historique des paiements reste disponible',()=>{
  assert.match(route,/app\.get\('\/invoices\/:id\/payments'/);
});

const paymentStart=route.indexOf("app.post('/invoices/:id/payments'");
const paymentEnd=route.indexOf("app.patch('/invoices/:id/penalty'",paymentStart);
const paymentRoute=route.slice(paymentStart,paymentEnd);
const installmentsStart=route.indexOf("app.post('/invoices/:id/installments'");
const installmentsEnd=route.indexOf("app.get('/invoices/:id/payments'",installmentsStart);
const installmentsRoute=route.slice(installmentsStart,installmentsEnd);

test('les règlements verrouillent la facture avant de calculer le solde',()=>{
  assert.ok(paymentStart>=0&&paymentEnd>paymentStart);
  assert.match(paymentRoute,/withTransaction\(async client=>/);
  assert.match(paymentRoute,/for update of q/i);
  assert.match(paymentRoute,/calculateInvoicePayment\(/);
});

test('paiement, statut de facture et journal comptable sont enregistrés dans la même transaction',()=>{
  assert.match(paymentRoute,/insert into invoice_payments/);
  assert.match(paymentRoute,/update quotes set amount_paid=/);
  assert.match(paymentRoute,/insert into accounting_entries[\s\S]*paymentId/);
  assert.match(paymentRoute,/paid_at=case when[\s\S]*\$3::timestamptz/);
});

test('le remplacement d’échéancier est transactionnel et reprend les paiements déjà reçus',()=>{
  assert.match(installmentsRoute,/withTransaction\(async client=>/);
  assert.match(installmentsRoute,/for update/i);
  assert.match(installmentsRoute,/allocateInstallmentPayments\(/);
  assert.match(installmentsRoute,/amount_paid,status/);
});
