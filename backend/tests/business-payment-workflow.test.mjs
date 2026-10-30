import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateInstallmentPayments,
  buildInstallmentPlan,
  calculateInvoicePayment,
  normalizePaymentDate,
} from '../src/services/invoice-workflow.ts';

test('un paiement partiel puis le solde respectent les pénalités et les centimes',()=>{
  const partial=calculateInvoicePayment(100,5,20,40);
  assert.deepEqual(partial,{amount:40,dueTotal:105,paidAmount:60,remaining:45,status:'partially_paid'});
  const final=calculateInvoicePayment(100,5,60,45);
  assert.deepEqual(final,{amount:45,dueTotal:105,paidAmount:105,remaining:0,status:'paid'});
});

test('un paiement concurrent devenu trop élevé est refusé à partir du solde verrouillé',()=>{
  assert.throws(()=>calculateInvoicePayment(100,0,80,30),{message:'PAYMENT_TOO_HIGH'});
  assert.throws(()=>calculateInvoicePayment(100,0,100,1),{message:'INVOICE_ALREADY_PAID'});
  assert.throws(()=>calculateInvoicePayment(100,0,0,0),{message:'INVALID_PAYMENT_AMOUNT'});
});

test('la date de règlement refuse une date invalide ou future au-delà de 24 heures',()=>{
  const now=new Date('2026-10-29T10:00:00.000Z');
  assert.equal(normalizePaymentDate('2026-10-28',now).getHours(),12);
  assert.throws(()=>normalizePaymentDate('2026-02-30',now),{message:'INVALID_PAYMENT_DATE'});
  assert.throws(()=>normalizePaymentDate('2026-11-01T12:00:00.000Z',now),{message:'INVALID_PAYMENT_DATE'});
});

test('l’échéancier automatique répartit exactement les centimes',()=>{
  const plan=buildInstallmentPlan(100,{count:3,startDate:'2026-01-01',intervalDays:30});
  assert.deepEqual(plan,[
    {number:1,dueAt:'2026-01-01',amount:33.33},
    {number:2,dueAt:'2026-01-31',amount:33.33},
    {number:3,dueAt:'2026-03-02',amount:33.34},
  ]);
});

test('un échéancier invalide ou qui ne totalise pas la facture est refusé',()=>{
  assert.throws(()=>buildInstallmentPlan(100,{count:2.5,startDate:'2026-01-01'}),{message:'INVALID_INSTALLMENT_COUNT'});
  assert.throws(()=>buildInstallmentPlan(100,{count:2,startDate:'2026-02-30'}),{message:'INVALID_INSTALLMENT_DATE'});
  assert.throws(()=>buildInstallmentPlan(100,{installments:[{dueAt:'2026-01-01',amount:90}]}),{message:'INSTALLMENTS_TOTAL_MISMATCH'});
  assert.throws(()=>buildInstallmentPlan(100,{installments:[{dueAt:'2026-01-01',amount:99.99}]}),{message:'INSTALLMENTS_TOTAL_MISMATCH'});
  assert.throws(()=>buildInstallmentPlan(100,{installments:Array.from({length:121},()=>({dueAt:'2026-01-01',amount:0}))}),{message:'INSTALLMENT_LIMIT'});
});

test('remplacer un échéancier répartit les versements antérieurs sans perdre les statuts payés',()=>{
  const plan=buildInstallmentPlan(100,{count:3,startDate:'2026-01-01'});
  assert.deepEqual(allocateInstallmentPayments(plan,40).map(({amountPaid,status})=>({amountPaid,status})),[
    {amountPaid:33.33,status:'paid'},
    {amountPaid:6.67,status:'partially_paid'},
    {amountPaid:0,status:'pending'},
  ]);
});
