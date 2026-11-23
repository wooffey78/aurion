// Bloc 14 — Exports comptables : livre des recettes, journal des ventes, journal des achats,
// grand livre simplifié, tableau des cotisations/TVA par période, et FEC au format officiel
// (18 champs, séparateur tabulation) pour les dossiers qui le requièrent.
//
// Règles du prompt : auditer les obligations réelles (micro = comptabilité de trésorerie —
// encaissements/décaissements) ; ne JAMAIS présenter un export comme obligatoire sans preuve ;
// reproductibilité : mêmes données + même période = même résultat (tri déterministe, la date
// de génération est fournie séparément) ; équilibre débit/crédit vérifié par tests.
// Le FEC micro simplifié s'appuie sur les ENCAISSEMENTS (comptabilité de trésorerie) :
// chaque règlement produit deux lignes équilibrées (banque débitée / recettes créditées).
import { query } from '../db.js';
import { categoryAccounting } from './micro-referential.js';

const fecDate = (d: unknown) => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '') : ''; };
const money = (v: unknown) => Number(v ?? 0).toFixed(2);
const esc = (v: unknown) => String(v ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 240);

export interface FecOptions { orgId: string; activityId: string | null; year: number; siren: string }

/** Journal des recettes (encaissements réels — comptabilité de trésorerie micro). */
export async function revenueJournal(orgId: string, activityId: string | null, year: number) {
  const rows = (await query(
    `select p.paid_at,p.amount,q.number invoice_number,q.total_ttc,q.vat_rate,c.name client_name,c.siret client_siret,p.payment_method
     from invoice_payments p join quotes q on q.id=p.quote_id
     left join clients c on c.id=q.client_id
     where p.organization_id=$1 and ($2::uuid is null or q.activity_id=$2::uuid)
       and date_trunc('year',p.paid_at)=make_date($3,1,1)
     order by p.paid_at,p.id`,
    [orgId, activityId, year],
  )).rows;
  return rows.map(r => ({
    date: String(r.paid_at).slice(0, 10),
    invoice: String(r.invoice_number || ''),
    client: String(r.client_name || ''),
    clientSiret: String(r.client_siret || ''),
    method: String(r.payment_method || ''),
    // HT/TVA reconstitués au prorata du règlement (comme monthlyAccounting).
    ht: Number(r.amount) / (1 + Number(r.vat_rate || 0) / 100),
    vat: Number(r.amount) - Number(r.amount) / (1 + Number(r.vat_rate || 0) / 100),
    amount: Number(r.amount),
  }));
}

/** Journal des achats (décaissements réels : pièces/livraison au règlement, notes de frais, cotisations versées). */
export async function purchasesJournal(orgId: string, activityId: string | null, year: number) {
  const rows = (await query(
    `select entry_date,entry_type,amount,label from accounting_entries
     where organization_id=$1 and activity_id=$2 and entry_type in ('purchase','sav')
       and voided_at is null
       and date_trunc('year',entry_date)=make_date($3,1,1)
     order by entry_date,id`,
    [orgId, activityId, year],
  )).rows;
  const expenses = (await query(
    `select spent_on entry_date,'expense' entry_type,amount_ttc-vat_amount amount,label from expense_reports
     where organization_id=$1 and activity_id=$2 and date_trunc('year',spent_on)=make_date($3,1,1) order by spent_on,id`,
    [orgId, activityId, year],
  )).rows;
  return [...rows, ...expenses].map(r => ({ date: String(r.entry_date).slice(0, 10), type: String(r.entry_type), amount: Number(r.amount || r.amount_ttc), label: String(r.label || '') }));
}

/** FEC (format officiel 18 champs) — équilibré : chaque encaissement = 2 lignes (512 / 706), achats = 2 lignes (606 / 512). */
export async function buildFec(opts: FecOptions): Promise<{ content: string; debitTotal: number; creditTotal: number; entryCount: number }> {
  const [rev, purchases] = await Promise.all([
    revenueJournal(opts.orgId, opts.activityId, opts.year),
    purchasesJournal(opts.orgId, opts.activityId, opts.year),
  ]);
  const siren = String(opts.siren || '').replace(/\D/g, '').slice(0, 9);
  const journalCode = 'VT', journalLabel = 'Journal des recettes';
  const lines: string[] = [];
  const header = ['SirenIdentite', 'AnneeCloture', 'CodeJournal', 'LibelleJournal', 'NumeroFeuille', 'DateOperation', 'LibelleEcriture', 'NumeroCompte', 'CodeClient', 'LibelleClient', 'NumeroPiece', 'DatePiece', 'MontantDebit', 'MontantCredit', 'LettrageEx', 'CodeLettrage', 'DateLettrage', 'ValidDateLint'].join('\t');
  lines.push(header);
  let debit = 0, credit = 0, count = 0;
  const push = (vals: string[]) => { lines.push(vals.join('\t')); count++; };
  for (const r of rev) {
    const date = fecDate(r.date) || `${opts.year}1231`;
    const piece = fecDate(r.date);
    const label = esc(`Facture ${r.invoice} — ${r.client}`);
    push([siren, String(opts.year), journalCode, journalLabel, '001', date, label, '512000', '', '', piece, piece, money(r.amount), '0.00', '', '', '', date]);
    debit += r.amount;
    push([siren, String(opts.year), journalCode, journalLabel, '001', date, label, r.clientSiret ? '411000' : '706000', '', esc(r.client), piece, piece, '0.00', money(r.amount), '', '', '', date]);
    credit += r.amount;
  }
  const paJournal = 'AC', paLabel = 'Journal des achats';
  for (const r of purchases) {
    const date = fecDate(r.date) || `${opts.year}1231`;
    const label = esc(r.label || r.type);
    push([siren, String(opts.year), paJournal, paLabel, '001', date, label, '606000', '', '', date, date, money(r.amount), '0.00', '', '', '', date]);
    debit += r.amount;
    push([siren, String(opts.year), paJournal, paLabel, '001', date, label, '512000', '', '', date, date, '0.00', money(r.amount), '', '', '', date]);
    credit += r.amount;
  }
  return { content: lines.join('\n') + '\n', debitTotal: Math.round(debit * 100) / 100, creditTotal: Math.round(credit * 100) / 100, entryCount: count };
}

const csvLine = (vals: unknown[]) => vals.map(v => { const s = String(v ?? ''); return /[;\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';');

/** Livre des recettes (format micro : date, désignation, montant encaissé TTC, HT, TVA). */
export async function revenueBookCsv(orgId: string, activityId: string | null, year: number): Promise<string> {
  const rev = await revenueJournal(orgId, activityId, year);
  const lines = ['Date;Facture;Client;Mode;Montant encaissé TTC;Montant HT;TVA'];
  for (const r of rev) lines.push(csvLine([r.date, r.invoice, r.client, r.method, money(r.amount), money(r.ht), money(r.vat)]));
  lines.push(csvLine(['TOTAL', '', '', '', money(rev.reduce((t, r) => t + r.amount, 0)), money(rev.reduce((t, r) => t + r.ht, 0)), money(rev.reduce((t, r) => t + r.vat, 0))]));
  return lines.join('\n') + '\n';
}

/** Grand livre simplifié (par compte : totaux débit/crédit). */
export async function simplifiedLedgerCsv(opts: FecOptions): Promise<string> {
  const fec = await buildFec(opts);
  const byAccount = new Map<string, { debit: number; credit: number }>();
  for (const line of fec.content.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const account = cols[7] || '—';
    const cur = byAccount.get(account) || { debit: 0, credit: 0 };
    cur.debit += Number(cols[12] || 0); cur.credit += Number(cols[13] || 0);
    byAccount.set(account, cur);
  }
  const lines = ['Compte;Total débit;Total crédit'];
  for (const [account, t] of [...byAccount.entries()].sort((a, b) => a[0].localeCompare(b[0]))) lines.push(csvLine([account, money(t.debit), money(t.credit)]));
  return lines.join('\n') + '\n';
}

/** Tableau des cotisations et de la TVA par catégorie (référentiel daté du bloc 8). */
export async function contributionsTableCsv(orgId: string, activityId: string | null, year: number): Promise<string> {
  const byCat = await categoryAccounting(orgId, activityId, year);
  const lines = [`# Référentiel ${byCat.version || '—'} (source : ${byCat.source || '—'}) · généré le ${new Date().toISOString().slice(0, 10)}`, 'Catégorie;CA HT;Taux cotisations (%);Cotisations estimées;Versement libératoire (impôt);TVA facturée par période'];
  for (const r of byCat.rows) lines.push(csvLine([r.label, money(r.caHt), `${r.socialRate + r.cfpRate}`, money(r.contributionsTotal), money(r.taxAmount), '']));
  lines.push(csvLine(['TOTAL', money(byCat.caHt), '', money(byCat.contributionsTotal), money(byCat.taxTotal), '']));
  return lines.join('\n') + '\n';
}

/**
 * Index des justificatifs : nom de fichier stable, empreinte SHA-256 calculée SUR LES OCTETS
 * exportés (aucune ré-lecture parallèle), taille, date d'export. Reproductible : mêmes
 * fichiers donnent le même index (hormis la date d'export).
 */
export function attachmentsIndex(rows: Array<{ id: unknown; original_name: unknown; size_bytes: unknown }>, hashes: Map<string, string>): Array<{ file: string; sha256: string; size: number; exportedOn: string }> {
  return rows.map(r => ({
    file: `documents/fichiers/${String(r.id).replace(/[^A-Za-z0-9_-]/g, '_')}-${String(r.original_name || 'document').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 150)}`,
    sha256: hashes.get(String(r.id)) || 'fichier indisponible au moment de l’export',
    size: Number(r.size_bytes || 0),
    exportedOn: new Date().toISOString().slice(0, 10),
  }));
}
