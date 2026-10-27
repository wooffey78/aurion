import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('synchronisation live : 1 seconde, sans rechargement et sans interception globale de fetch',()=>{
  const s=read('../../assets/js/account-sync.js');
  assert.ok(s.includes('window.setInterval(poll,1000)'));
  assert.ok(!s.includes('location.reload('));
  assert.ok(!s.includes('window.fetch=async'));
  assert.ok(s.includes('aurion:account-sync-changed'));
  assert.ok(s.includes('home-forecast-3m'));
  assert.ok(s.includes('accounting/summary'));
  assert.ok(s.includes('treasury/summary'));
});

test('les champs optionnels nuls du paiement sont filtrés au niveau de l’API, sans patch global de fetch',()=>{
  const s=read('../../assets/js/core/api.js');
  assert.ok(s.includes("addInvoicePayment:(id,b={})"));
  assert.ok(s.includes("for(const key of ['paidAt','reference','note'])if(payload[key]===null)delete payload[key]"));
});
