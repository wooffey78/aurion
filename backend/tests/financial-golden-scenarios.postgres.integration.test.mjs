// Scénario financier doré — de la facture à l’export comptable, sur PostgreSQL réel.
//
// Histoire : trois factures (TVA 20 % avec remise et kilométrage client ; TVA 20 % avec
// kilométrage en marge ; TVA 10 %), un acompte de 30 %, un paiement partiel, un solde,
// un avoir SAV et deux notes de frais. Chaque étape vérifie :
//   • HT + TVA = TTC ;
//   • payé + restant = TTC ;
//   • l’échéancier totalise le TTC et son cumul payé égale le payé de la facture.
// La fin du scénario vérifie le moteur comptable, les journaux et le FEC.
//
// Conventions : une remise est un prix TTC négocié sous le prix catalogue (pas de champ
// « remise » distinct) ; un acompte est la première échéance de l’échéancier.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV ||= 'test';
process.env.JWT_SECRET ||= 'financial-golden-scenario-secret-at-least-32-characters';
process.env.AURION_SUPPORT_EMAIL ||= 'support@example.invalid';

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const databaseUrl = process.env.DATABASE_URL || process.env.AURION_INTEGRATION_DATABASE_URL;
// Scénario PostgreSQL : exécution uniquement sur demande explicite (jamais sur une URL factice).
const ready = existsSync(distDir) && Boolean(databaseUrl) && process.env.AURION_INTEGRATION_TESTS === '1';
const skip = ready ? false : 'dist/ absent, AURION_INTEGRATION_TESTS≠1 ou DATABASE_URL non défini : exécuter après « npm run build » sur une base de test migrée';

const euro = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const money = (actual, expected, label) => assert.equal(euro(actual), euro(expected), `${label} (${actual} ≠ ${expected})`);

// Facture A — prix catalogue 1 200 € TTC, remise de 120 €, kilométrage client.
const CATALOGUE_BASE_TTC = 1200;
const REMISE_TTC = 120;
const FACTURE_A = {
  number: 'FAC-GOLD-A-2026',
  totalHt: 978,
  totalTva: 195.6,
  totalTtc: 1173.6,
  finalPriceTtc: 1080,
  partCost: 500,
  shippingCost: 25,
  laborInternal: 80,
  mileageKm: 120,
  mileageInternalRate: 0.45,
  mileageClientRate: 0.65,
  mileageTotal: 78,
  mileageMode: 'client_price',
  margin: 319,
  vatRate: 20,
};
const PLAN_A = [
  { number: 1, dueAt: '2026-11-05', amount: 352.08 },
  { number: 2, dueAt: '2026-12-05', amount: 234.72 },
  { number: 3, dueAt: '2027-01-05', amount: 586.8 },
];

// Facture B — kilométrage en marge : 50 € de coût interne, jamais facturé.
const FACTURE_B = {
  number: 'FAC-GOLD-B-2026',
  totalHt: 500,
  totalTva: 100,
  totalTtc: 600,
  finalPriceTtc: 600,
  partCost: 200,
  shippingCost: 0,
  laborInternal: 50,
  mileageKm: 100,
  mileageInternalRate: 0.5,
  mileageClientRate: 0.7,
  mileageTotal: 50,
  mileageMode: 'margin',
  margin: 200,
  vatRate: 20,
};

// Facture C — TVA à 10 %, sans pièce ni déplacement.
const FACTURE_C = {
  number: 'FAC-GOLD-C-2026',
  totalHt: 300,
  totalTva: 30,
  totalTtc: 330,
  finalPriceTtc: 330,
  partCost: 0,
  shippingCost: 0,
  laborInternal: 0,
  mileageKm: 0,
  mileageInternalRate: 0,
  mileageClientRate: 0,
  mileageTotal: 0,
  mileageMode: 'margin',
  margin: 300,
  vatRate: 10,
};

test('facture → acompte → paiement partiel → solde → SAV → notes de frais → export comptable', { skip }, async () => {
  const db = await import('../dist/db.js');
  const { monthlyAccounting } = await import('../dist/services/accounting.js');
  const {
    buildFec,
    purchasesJournal,
    revenueBookCsv,
    revenueJournal,
    simplifiedLedgerCsv,
  } = await import('../dist/services/accounting-export.js');
  const { accountingReportCsv, accountingReportPdf } = await import('../dist/services/accounting-report.js');
  const {
    allocateInstallmentPayments,
    buildInstallmentPlan,
    calculateInvoicePayment,
  } = await import('../dist/services/invoice-workflow.js');

  const org = crypto.randomUUID();
  const activity = crypto.randomUUID();
  const client = crypto.randomUUID();

  const assertDocument = (row, label) => {
    money(Number(row.total_ht) + Number(row.total_tva), row.total_ttc, `${label} — HT + TVA = TTC`);
  };

  const assertPayment = (calculation, total, label) => {
    money(calculation.dueTotal, total, `${label} — total dû`);
    money(calculation.paidAmount + calculation.remaining, total, `${label} — payé + restant = TTC`);
    money(calculation.paidAmount + calculation.remaining, calculation.dueTotal, `${label} — cohérence du dû`);
  };

  const insertInvoice = async (data) => {
    const id = crypto.randomUUID();
    const fields = {
      id,
      organization_id: org,
      activity_id: activity,
      client_id: client,
      number: data.number,
      document_type: 'invoice',
      status: 'issued',
      intervention: data.number === FACTURE_A.number ? 'Réparation fourgon' : data.number === FACTURE_B.number ? 'Maintenance' : 'Prestation',
      part_cost: data.partCost,
      shipping_cost: data.shippingCost,
      labor_cost: data.laborInternal,
      margin: data.margin,
      vat_rate: data.vatRate,
      urssaf_rate: 0,
      total_ht: data.totalHt,
      total_tva: data.totalTva,
      total_ttc: data.totalTtc,
      final_price_ttc: data.finalPriceTtc,
      mileage_km: data.mileageKm,
      mileage_rate: data.mileageClientRate,
      mileage_total: data.mileageTotal,
      mileage_mode: data.mileageMode,
      mileage_internal_rate: data.mileageInternalRate,
      mileage_client_rate: data.mileageClientRate,
      labor_internal_cost_ht: data.laborInternal,
      labor_selling_ht: 0,
      payment_status: 'unpaid',
      amount_paid: 0,
      sent_at: '2026-11-01T10:00:00Z',
      due_at: '2026-11-30',
      created_at: '2026-11-01T09:00:00Z',
    };
    const columns = Object.keys(fields);
    await db.query(
      `insert into quotes(${columns.join(',')}) values(${columns.map((_, index) => `$${index + 1}`).join(',')})`,
      Object.values(fields),
    );
    return { id, plan: data.number === FACTURE_A.number ? PLAN_A : null };
  };

  const readInvoice = async (id) => (await db.query('select * from quotes where id=$1 and organization_id=$2', [id, org])).rows[0];

  const assertInstallments = async (invoice, label, expectedPaid, expectedStatuses) => {
    const rows = (await db.query(
      'select installment_number,amount_due,amount_paid,status from invoice_installments where organization_id=$1 and quote_id=$2 order by installment_number',
      [org, invoice.id],
    )).rows;
    assert.equal(rows.length, invoice.plan.length, `${label} — nombre d’échéances`);
    money(rows.reduce((sum, row) => sum + Number(row.amount_due), 0), FACTURE_A.totalTtc, `${label} — échéancier = TTC`);
    money(rows.reduce((sum, row) => sum + Number(row.amount_paid), 0), expectedPaid.reduce((sum, amount) => sum + amount, 0), `${label} — cumul payé des échéances`);
    assert.deepEqual(rows.map(row => euro(row.amount_paid)), expectedPaid.map(euro), `${label} — montants payés`);
    assert.deepEqual(rows.map(row => row.status), expectedStatuses, `${label} — statuts`);
  };

  const pay = async (invoice, amount, paidAt, label) => {
    const current = await readInvoice(invoice.id);
    assertDocument(current, label);
    const calculation = calculateInvoicePayment(Number(current.total_ttc), 0, Number(current.amount_paid), amount);
    const paymentId = crypto.randomUUID();
    await db.query(
      `insert into invoice_payments(id,organization_id,quote_id,amount,payment_method,paid_at,reference)
       values($1,$2,$3,$4,'transfer',$5,$6)`,
      [paymentId, org, invoice.id, calculation.amount, paidAt, label],
    );
    if (invoice.plan) {
      for (const row of allocateInstallmentPayments(invoice.plan, calculation.paidAmount)) {
        await db.query(
          'update invoice_installments set amount_paid=$1,status=$2,updated_at=now() where organization_id=$3 and quote_id=$4 and installment_number=$5',
          [row.amountPaid, row.status, org, invoice.id, row.number],
        );
      }
    }
    await db.query(
      `update quotes set amount_paid=$1,payment_status=$2,status=$3,paid_at=$4,updated_at=now()
       where id=$5 and organization_id=$6`,
      [calculation.paidAmount, calculation.status, calculation.status === 'paid' ? 'paid' : 'issued',
        calculation.status === 'paid' ? paidAt : null, invoice.id, org],
    );
    await db.query(
      `insert into accounting_entries(organization_id,activity_id,entry_type,amount,entry_date,source_id,label)
       values($1,$2,'payment',$3,$4::date,$5,$6)`,
      [org, activity, calculation.amount, paidAt.slice(0, 10), paymentId, label],
    );
    const after = await readInvoice(invoice.id);
    assertDocument(after, `${label} (relu)`);
    assert.equal(after.payment_status, calculation.status, `${label} — statut de paiement`);
    money(after.amount_paid, calculation.paidAmount, `${label} — payé enregistré`);
    money(Number(after.total_ttc) - Number(after.amount_paid), calculation.remaining, `${label} — restant enregistré`);
    assertPayment(calculation, Number(after.total_ttc), label);
    return calculation;
  };

  try {
    await db.query(
      'insert into organizations(id,name,activity,siren) values($1,$2,$3,$4)',
      [org, 'Atelier doré — scénario financier', 'Réparation et maintenance', '123456789'],
    );
    await db.withTenant(org, async () => {
      await db.query(
        'insert into activities(id,organization_id,code,name,vat_rate,urssaf_rate) values($1,$2,$3,$4,$5,$6)',
        [activity, org, 'golden', 'Réparation et maintenance', 20, 0],
      );
      await db.query(
        'insert into clients(id,organization_id,activity_id,name) values($1,$2,$3,$4)',
        [client, org, activity, 'Client doré'],
      );

      const invoiceA = await insertInvoice(FACTURE_A);
      const invoiceB = await insertInvoice(FACTURE_B);
      const invoiceC = await insertInvoice(FACTURE_C);

      // 1. Facture A : remise, TVA et kilométrage client.
      const rowA = await readInvoice(invoiceA.id);
      assertDocument(rowA, 'Facture A');
      money(rowA.total_ht, FACTURE_A.totalHt, 'Facture A — HT');
      money(rowA.total_tva, FACTURE_A.totalTva, 'Facture A — TVA');
      money(rowA.total_ttc, FACTURE_A.totalTtc, 'Facture A — TTC');
      money(CATALOGUE_BASE_TTC - Number(rowA.final_price_ttc), REMISE_TTC, 'Facture A — remise');
      money(Number(rowA.final_price_ttc) + Number(rowA.mileage_total) * 1.2, rowA.total_ttc, 'Facture A — base + kilométrage = TTC');
      money(rowA.mileage_total, FACTURE_A.mileageTotal, 'Facture A — kilométrage facturé');
      assert.equal(rowA.mileage_mode, 'client_price');

      // 2. Facture B : kilométrage en marge, coût interne non facturé.
      const rowB = await readInvoice(invoiceB.id);
      assertDocument(rowB, 'Facture B');
      money(rowB.total_ttc, FACTURE_B.totalTtc, 'Facture B — TTC');
      money(rowB.final_price_ttc, FACTURE_B.finalPriceTtc, 'Facture B — prix négocié');
      money(rowB.mileage_total, FACTURE_B.mileageTotal, 'Facture B — coût kilométrique interne conservé');
      assert.equal(rowB.mileage_mode, 'margin');
      money(Number(rowB.final_price_ttc) + 0, rowB.total_ttc, 'Facture B — aucun supplément kilométrage');

      // 3. Facture C : TVA à 10 %, invariant documentaire seul.
      const rowC = await readInvoice(invoiceC.id);
      assertDocument(rowC, 'Facture C');
      money(rowC.total_ht, FACTURE_C.totalHt, 'Facture C — HT');
      money(rowC.total_tva, FACTURE_C.totalTva, 'Facture C — TVA');
      money(rowC.total_ttc, FACTURE_C.totalTtc, 'Facture C — TTC');

      // 4. Échéancier : acompte de 30 %, solde et échéance intermédiaire.
      const validatedPlan = buildInstallmentPlan(FACTURE_A.totalTtc, { installments: PLAN_A });
      assert.deepEqual(validatedPlan, PLAN_A, 'échéancier doré validé par le moteur');
      for (const row of validatedPlan) {
        await db.query(
          `insert into invoice_installments(organization_id,quote_id,installment_number,due_at,amount_due,amount_paid,status)
           values($1,$2,$3,$4,$5,0,'pending')`,
          [org, invoiceA.id, row.number, row.dueAt, row.amount],
        );
      }
      await assertInstallments(invoiceA, 'Échéancier initial', [0, 0, 0], ['pending', 'pending', 'pending']);

      // 5. Acompte puis paiement partiel puis solde.
      const acompte = await pay(invoiceA, 352.08, '2026-11-05T12:00:00Z', 'Acompte 30 %');
      assert.deepEqual(acompte, { amount: 352.08, dueTotal: 1173.6, paidAmount: 352.08, remaining: 821.52, status: 'partially_paid' });
      await assertInstallments(invoiceA, 'Après acompte', [352.08, 0, 0], ['paid', 'pending', 'pending']);

      const partiel = await pay(invoiceA, 200, '2026-11-12T12:00:00Z', 'Paiement partiel');
      assert.deepEqual(partiel, { amount: 200, dueTotal: 1173.6, paidAmount: 552.08, remaining: 621.52, status: 'partially_paid' });
      await assertInstallments(invoiceA, 'Après paiement partiel', [352.08, 200, 0], ['paid', 'partially_paid', 'pending']);

      const solde = await pay(invoiceA, partiel.remaining, '2026-11-19T12:00:00Z', 'Solde facture A');
      assert.deepEqual(solde, { amount: 621.52, dueTotal: 1173.6, paidAmount: 1173.6, remaining: 0, status: 'paid' });
      await assertInstallments(invoiceA, 'Après solde', [352.08, 234.72, 586.8], ['paid', 'paid', 'paid']);

      // 6. Factures B et C : règlement intégral, invariant payé + restant = TTC.
      const soldeB = await pay(invoiceB, FACTURE_B.totalTtc, '2026-11-25T12:00:00Z', 'Solde facture B');
      assert.deepEqual(soldeB, { amount: 600, dueTotal: 600, paidAmount: 600, remaining: 0, status: 'paid' });
      const soldeC = await pay(invoiceC, FACTURE_C.totalTtc, '2026-11-28T12:00:00Z', 'Solde facture C');
      assert.deepEqual(soldeC, { amount: 330, dueTotal: 330, paidAmount: 330, remaining: 0, status: 'paid' });

      // 7. SAV financier : avoir de 60 € TTC, sans toucher au TTC ni au statut payé de la facture.
      const savId = crypto.randomUUID();
      await db.query(
        `insert into sav_cases(id,organization_id,activity_id,client_id,invoice_id,amount_ttc,items,note,sav_type,intervention_cost_ht,created_at)
         values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'financial',0,'2026-11-19T15:00:00Z')`,
        [savId, org, activity, client, invoiceA.id, -60,
          JSON.stringify([{ label: 'Geste commercial', quantity: 1, unitPrice: 60 }]), 'Avoir commercial après intervention'],
      );
      await db.query(
        `insert into accounting_entries(organization_id,activity_id,entry_type,amount,entry_date,source_id,label)
         values($1,$2,'sav',$3,'2026-11-19',$4,$5)`,
        [org, activity, -60, savId, 'SAV facture FAC-GOLD-A-2026'],
      );
      const sav = (await db.query('select amount_ttc,sav_type from sav_cases where id=$1 and organization_id=$2', [savId, org])).rows[0];
      money(sav.amount_ttc, -60, 'SAV — avoir TTC');
      assert.equal(sav.sav_type, 'financial');
      const factureAApresSav = await readInvoice(invoiceA.id);
      assertDocument(factureAApresSav, 'Facture A après SAV');
      money(factureAApresSav.total_ttc, FACTURE_A.totalTtc, 'SAV — TTC de la facture inchangé');
      money(factureAApresSav.amount_paid, FACTURE_A.totalTtc, 'SAV — facture toujours payée');
      money(Number(factureAApresSav.total_ttc) - Number(factureAApresSav.amount_paid), 0, 'SAV — restant nul');

      // 8. Notes de frais : HT + TVA = TTC pour chacune.
      const expenses = [
        { date: '2026-11-10', label: 'Péage atelier', ttc: 120, vat: 20, ht: 100 },
        { date: '2026-11-12', label: 'Repas client', ttc: 45, vat: 0, ht: 45 },
      ];
      for (const expense of expenses) {
        await db.query(
          `insert into expense_reports(organization_id,activity_id,spent_on,label,category,amount_ttc,vat_amount,status)
           values($1,$2,$3,$4,'autre',$5,$6,'to_reimburse')`,
          [org, activity, expense.date, expense.label, expense.ttc, expense.vat],
        );
      }
      const expenseRows = (await db.query(
        'select label,amount_ttc,vat_amount from expense_reports where organization_id=$1 and activity_id=$2 order by spent_on,label',
        [org, activity],
      )).rows;
      for (const expense of expenses) {
        const row = expenseRows.find(item => item.label === expense.label);
        money(row.amount_ttc, expense.ttc, `Note de frais ${expense.label} — TTC enregistré`);
        money(row.vat_amount, expense.vat, `Note de frais ${expense.label} — TVA enregistrée`);
        money(Number(row.amount_ttc) - Number(row.vat_amount), expense.ht, `Note de frais ${expense.label} — HT`);
        money(expense.ht + expense.vat, row.amount_ttc, `Note de frais ${expense.label} — HT + TVA = TTC`);
      }

      // 9. Moteur comptable mensuel : encaissements, TVA, coûts internes, SAV et notes de frais.
      const months = await monthlyAccounting(org, activity, 2026);
      assert.equal(months.length, 1, 'un seul mois mouvementé');
      const novembre = months[0];
      assert.equal(new Date(novembre.month).toISOString().slice(0, 7), '2026-11');
      const paiementsTotal = 352.08 + 200 + 621.52 + 600 + 330;
      money(novembre.revenueHt, 1718, 'Comptabilité — CA HT (dont avoir SAV de −60)');
      money(novembre.vat, 325.6, 'Comptabilité — TVA collectée');
      money(novembre.revenueHt + novembre.vat, paiementsTotal - 60, 'Comptabilité — CA HT + TVA = encaissements − avoir SAV');
      // En mode « client_price », le kilométrage est refacturé : le coût interne de 54 € n’est pas
      // ajouté aux achats (seul le mode « margin » le compte comme coût direct).
      money(novembre.purchases, 1050, 'Comptabilité — achats HT (coûts internes + notes de frais)');
      money(novembre.purchaseVat, 165, 'Comptabilité — TVA déductible (pièces + notes de frais)');
      money(novembre.expenseReports, 145, 'Comptabilité — notes de frais HT');
      money(novembre.mileage, 78, 'Comptabilité — seul le kilométrage client est facturé');
      assert.equal(novembre.invoiceCount, 3, 'trois factures encaissées');
      money(novembre.social, 0, 'aucune cotisation dans ce scénario');

      // 9 bis. Export CSV : même règle que le KPI, sans exposer le coût km en marge comme facturé.
      const reportCsv = await accountingReportCsv(org, activity, 2026);
      const csvLines = reportCsv.toString('utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
      const headers = csvLines[0].split(';').map(cell => cell.replace(/^"|"$/g, ''));
      const csvRow = number => {
        const cells = csvLines.slice(1)
          .map(line => line.split(';').map(cell => cell.replace(/^"|"$/g, '')))
          .find(row => row[headers.indexOf('Numéro')] === number);
        return Object.fromEntries(headers.map((header, index) => [header, cells?.[index] ?? '']));
      };
      const csvA = csvRow('FAC-GOLD-A-2026');
      const csvB = csvRow('FAC-GOLD-B-2026');
      money(csvA['Frais km'], 78, 'CSV — frais km facturés de la facture A');
      money(csvB['Frais km'], 0, 'CSV — le coût km en marge n’est pas présenté comme facturé');
      money(csvA['€/km'], 0.65, 'CSV — taux client de la facture A');
      money(csvB['€/km'], 0.5, 'CSV — taux interne de la facture B');
      money(csvA['Frais km internes'], 0, 'CSV — le coût km client n’est pas ajouté aux coûts directs');
      money(csvB['Frais km internes'], 50, 'CSV — coût km interne de la facture B visible une seule fois');
      assert.equal(csvA['Mode km'], 'Client');
      assert.equal(csvB['Mode km'], 'Marge');
      money(csvB['Achats HT'], 200, 'CSV — achats HT hors coût km, sans double comptage');
      const reportPdf = await accountingReportPdf(org, activity, 2026);
      assert.ok(reportPdf.buffer.length > 1000, 'PDF comptable généré');
      assert.equal(reportPdf.companyName, 'Atelier doré — scénario financier');

      // 10. Journaux et export FEC.
      const revenue = await revenueJournal(org, activity, 2026);
      assert.equal(revenue.length, 5, 'cinq règlements');
      for (const line of revenue) money(line.ht + line.vat, line.amount, `Journal des recettes ${line.invoice} — HT + TVA = TTC`);
      money(revenue.reduce((sum, line) => sum + line.amount, 0), paiementsTotal, 'Journal des recettes — TTC');
      money(revenue.reduce((sum, line) => sum + line.ht, 0), 1778, 'Journal des recettes — HT');
      money(revenue.reduce((sum, line) => sum + line.vat, 0), 325.6, 'Journal des recettes — TVA');

      const purchases = await purchasesJournal(org, activity, 2026);
      assert.equal(purchases.length, 3, 'deux notes de frais et un avoir SAV');
      assert.ok(purchases.some(line => line.type === 'expense' && euro(line.amount) === 100), 'note de frais 120 TTC → 100 HT');
      assert.ok(purchases.some(line => line.type === 'expense' && euro(line.amount) === 45), 'note de frais 45 TTC → 45 HT');
      assert.ok(purchases.some(line => line.type === 'sav' && euro(line.amount) === -60), 'avoir SAV présent au journal');
      money(purchases.reduce((sum, line) => sum + line.amount, 0), 85, 'Journal des achats — total');

      const book = await revenueBookCsv(org, activity, 2026);
      assert.equal(book.trim().split('\n').at(-1), 'TOTAL;;;;2103.60;1778.00;325.60', 'livre des recettes — totaux');

      const fec = await buildFec({ orgId: org, activityId: activity, year: 2026, siren: '123456789' });
      money(fec.debitTotal, 2188.6, 'FEC — débit');
      money(fec.creditTotal, 2188.6, 'FEC — crédit');
      assert.equal(euro(fec.debitTotal), euro(fec.creditTotal), 'FEC équilibré');
      assert.equal(fec.entryCount, 16, 'FEC — huit écritures à deux lignes');
      const fecLines = fec.content.trim().split('\n');
      assert.equal(fecLines.length, 17, 'FEC — en-tête + 16 lignes');
      for (const line of fecLines.slice(1)) assert.equal(line.split('\t').length, 18, 'FEC — 18 champs par ligne');
      assert.match(fec.content, /FAC-GOLD-A-2026/, 'FEC — facture A présente');
      assert.match(fec.content, /SAV facture FAC-GOLD-A-2026/, 'FEC — avoir SAV présent');

      const ledger = await simplifiedLedgerCsv({ orgId: org, activityId: activity, year: 2026, siren: '123456789' });
      const ledgerRows = ledger.trim().split('\n').slice(1).map(line => line.split(';'));
      money(ledgerRows.reduce((sum, row) => sum + Number(row[1]), 0), fec.debitTotal, 'Grand livre — débits');
      money(ledgerRows.reduce((sum, row) => sum + Number(row[2]), 0), fec.creditTotal, 'Grand livre — crédits');
    });
  } finally {
    await db.withTenant(org, () => db.query('delete from organizations where id=$1', [org])).catch(() => {});
    await db.db.end().catch(() => {});
    if (db.adminDb) await db.adminDb.end().catch(() => {});
  }
});
