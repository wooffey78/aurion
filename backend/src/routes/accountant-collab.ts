// Bloc 15 (prompt 15) — espace de collaboration avec l'expert-comptable :
// demandes de documents (état, auteur, échéance, résolution), échanges contextualisés,
// dossiers préparés à partir des données financières réelles avec critères de complétude.
// Le document source reste unique dans le dépôt central : une demande référence un document
// existant, jamais une copie divergente. Le rôle comptable obtient le droit d'écrire UNIQUEMENT
// sur ces routes (allowlist plugins/auth.ts) — aucune émission, aucune modification bancaire.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';
import { emitOrgEvent } from '../services/events.js';

const requestCreateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  details: z.string().max(4000).optional(),
  periodYear: z.union([z.number().int().min(2000).max(2100), z.null()]).optional(),
  documentId: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  dueDate: z.union([z.string().max(40), z.null()]).optional(),
}).passthrough();

const requestPatchSchema = z.object({
  state: z.enum(['open', 'answered', 'resolved', 'cancelled']).optional(),
  resolutionNote: z.string().max(1000).optional(),
  dueDate: z.union([z.string().max(40), z.literal(''), z.null()]).optional(),
}).passthrough();

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
}).passthrough();

function parseDate(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === '' || v === null) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_DATE');
  return d.toISOString().slice(0, 10);
}

export async function accountantCollabRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  // Demandes du comptable (ou de l'entrepreneur vers le comptable) : état, auteur, échéance,
  // résolution documentée. Aucun statut fantôme : « résolue » exige une note de résolution.
  app.get('/accountant/requests', async r => {
    const state = ['open', 'answered', 'resolved', 'cancelled'].includes(String((r.query as any)?.state)) ? String((r.query as any).state) : null;
    const periodYear = Number((r.query as any)?.periodYear) || null;
    const rows = (await query(
      `select id,title,details,period_year as "periodYear",state,document_id as "documentId",
              author_user_id as "authorUserId",author_role as "authorRole",due_date as "dueDate",
              resolution_note as "resolutionNote",resolved_at as "resolvedAt",created_at as "createdAt",updated_at as "updatedAt",
              (select count(*)::int from accountant_request_messages m where m.request_id=accountant_requests.id) as "messageCount"
       from accountant_requests
       where organization_id=$1 and ($2::varchar is null or state=$2) and ($3::int is null or period_year=$3::int)
       order by created_at desc limit 200`,
      [r.auth!.organizationId, state, periodYear],
    )).rows;
    return { requests: rows };
  });

  app.post('/accountant/requests', async (r, reply) => {
    const parsed = requestCreateSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const b: any = parsed.data, org = r.auth!.organizationId;
    let dueDate: string | null | undefined;
    try { dueDate = parseDate(b.dueDate); } catch { return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Échéance invalide.' }); }
    if (b.documentId) {
      const doc = (await query(`select id from documents where id=$1 and organization_id=$2 and status<>'deleted'`, [b.documentId, org])).rowCount;
      if (!doc) return reply.code(400).send({ error: 'INVALID_DOCUMENT', message: 'Le document joint n\'existe pas (ou plus) dans votre dépôt central.' });
    }
    const isAccountant = r.auth!.role === 'accountant';
    const row = (await query(
      `insert into accountant_requests(organization_id,title,details,period_year,document_id,author_user_id,author_role,due_date)
       values($1,$2,$3,$4,$5,$6,$7,$8::date) returning id`,
      [org, b.title, b.details ?? '', b.periodYear ?? null, b.documentId || null, r.auth!.userId, isAccountant ? 'accountant' : 'operator', dueDate ?? null],
    )).rows[0];
    // Alerte in-app pour l'autre partie (dédoublonnée par demande).
    await emitOrgEvent(org, {
      type: 'accountant_request',
      title: isAccountant ? `Demande du comptable : ${b.title}` : `Demande transmise au comptable : ${b.title}`,
      description: isAccountant
        ? 'Votre expert-comptable demande un document ou une information. Ouvrez l\'espace de collaboration pour répondre.'
        : 'La demande a été enregistrée dans l\'espace de collaboration comptable (état : ouverte).',
      severity: 'action',
      source: 'accountant',
      internalPath: '/comptabilite',
      dedupeKey: `accountant-request:${row.id}`,
    });
    return reply.code(201).send({ id: String(row.id) });
  });

  app.patch('/accountant/requests/:id', async (r, reply) => {
    const parsed = requestPatchSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const b: any = parsed.data, id = String((r.params as any).id), org = r.auth!.organizationId;
    let dueDate: string | null | undefined;
    try { dueDate = parseDate(b.dueDate); } catch { return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Échéance invalide.' }); }
    const row = (await query(`select id,state,resolution_note from accountant_requests where id=$1 and organization_id=$2`, [id, org])).rows[0];
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND' });
    // Transitions contrôlées : « résolue » exige une note ; une demande résolue ne reste pas active.
    if (b.state === 'resolved' && !String(b.resolutionNote ?? row.resolution_note ?? '').trim()) {
      return reply.code(400).send({ error: 'RESOLUTION_NOTE_REQUIRED', message: 'Une demande résolue doit porter une note de résolution documentée.' });
    }
    if (b.state && !['open', 'answered'].includes(b.state) && ['resolved', 'cancelled'].includes(String(row.state))) {
      return reply.code(409).send({ error: 'INVALID_STATE', message: `La demande est déjà ${row.state === 'resolved' ? 'résolue' : 'annulée'} : sa résolution est historisée.` });
    }
    await query(
      `update accountant_requests set
         state=coalesce($2,state),
         resolution_note=coalesce($3,resolution_note),
         resolved_at=case when $2='resolved' then coalesce(resolved_at,now()) when $2 in ('open','answered') then null else resolved_at end,
         due_date=case when $4::date is null and $5::boolean is true then null when $4::date is not null then $4::date else due_date end,
         updated_at=now()
       where id=$1 and organization_id=$6 returning id,state`,
      [id, b.state ?? null, b.resolutionNote ?? null, dueDate ?? null, b.dueDate === '' ? true : false, org],
    );
    return { ok: true, state: b.state ?? row.state };
  });

  // Échanges contextualisés (les deux parties, journalisés avec leur rôle).
  app.get('/accountant/requests/:id/messages', async (r, reply) => {
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    const req = (await query(`select id from accountant_requests where id=$1 and organization_id=$2`, [id, org])).rows[0];
    if (!req) return reply.code(404).send({ error: 'NOT_FOUND' });
    const rows = (await query(
      `select id,author_user_id as "authorUserId",author_role as "authorRole",body,created_at as "createdAt"
       from accountant_request_messages where request_id=$1 and organization_id=$2 order by created_at asc`,
      [id, org],
    )).rows;
    return { messages: rows };
  });

  app.post('/accountant/requests/:id/messages', async (r, reply) => {
    const parsed = messageSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    const req = (await query(`select id,state from accountant_requests where id=$1 and organization_id=$2`, [id, org])).rows[0];
    if (!req) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (['resolved', 'cancelled'].includes(String(req.state))) {
      return reply.code(409).send({ error: 'INVALID_STATE', message: 'La demande est fermée : la discussion est conservée en lecture seule.' });
    }
    const isAccountant = r.auth!.role === 'accountant';
    const row = (await query(
      `insert into accountant_request_messages(organization_id,request_id,author_user_id,author_role,body)
       values($1,$2,$3,$4,$5) returning id`,
      [org, id, r.auth!.userId, isAccountant ? 'accountant' : 'operator', parsed.data.body],
    )).rows[0];
    // Un message d'une partie passe la demande en « answered » (état observable, jamais caché).
    await query(`update accountant_requests set state=case when state='open' then 'answered' else state end,updated_at=now() where id=$1 and organization_id=$2`, [id, org]);
    return reply.code(201).send({ id: String(row.id) });
  });

  // Dossier préparé à partir des données financières RÉELLES : critères de complétude et
  // éléments en attente. Jamais « complet » si un critère manque — jamais « transmis » sans
  // confirmation (la transmission d'un document passe par un partage ou une demande résolue).
  app.get('/accountant/dossier', async r => {
    const org = r.auth!.organizationId;
    const year = Number((r.query as any)?.year) || new Date().getFullYear();
    const start = `${year}-01-01`, end = `${year + 1}-01-01`;
    const [invoices, payments, expenses, supplierInbox, docs, openRequests, reconciliations, exports] = await Promise.all([
      query(`select count(*)::int n,coalesce(sum(total_ttc),0)::numeric total from quotes where organization_id=$1 and document_type='invoice' and created_at>=$2 and created_at<$3 and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted')`, [org, start, end]),
      query(`select count(*)::int n,coalesce(sum(p.amount),0)::numeric total from invoice_payments p where p.organization_id=$1 and p.paid_at>=$2 and p.paid_at<$3`, [org, start, end]),
      query(`select count(*)::int n,coalesce(sum(amount_ttc),0)::numeric total from expense_reports where organization_id=$1 and expense_date>=$2 and expense_date<$3`, [org, start, end]),
      query(`select count(*)::int n from supplier_electronic_invoices where organization_id=$1 and received_at>=$2 and received_at<$3`, [org, start, end]),
      query(`select count(*)::int n from documents where organization_id=$1 and status in ('clean','quarantined') and created_at>=$2 and created_at<$3`, [org, start, end]),
      query(`select count(*)::int n from accountant_requests where organization_id=$1 and state in ('open','answered') and (period_year=$2 or period_year is null)`, [org, year]),
      query(`select count(*)::int matched from bank_transactions where organization_id=$1 and status='matched' and value_date>=$2 and value_date<$3`, [org, start, end]),
      query(`select count(*)::int n from accounting_entries where organization_id=$1 and entry_date>=$2 and entry_date<$3`, [org, start, end]),
    ]);
    const criteria = [
      { key: 'invoices', label: 'Ventes facturées de l\'exercice', count: Number(invoices.rows[0]?.n || 0), total: Number(invoices.rows[0]?.total || 0), complete: Number(invoices.rows[0]?.n || 0) > 0 || Number(expenses.rows[0]?.n || 0) > 0 },
      { key: 'payments', label: 'Encaissements réels enregistrés', count: Number(payments.rows[0]?.n || 0), total: Number(payments.rows[0]?.total || 0), complete: Number(invoices.rows[0]?.n || 0) === 0 || Number(payments.rows[0]?.n || 0) > 0 },
      { key: 'expenses', label: 'Dépenses / notes de frais', count: Number(expenses.rows[0]?.n || 0), total: Number(expenses.rows[0]?.total || 0), complete: true },
      { key: 'supplierInvoices', label: 'Factures fournisseurs reçues (boîte PA)', count: Number(supplierInbox.rows[0]?.n || 0), total: null, complete: true },
      { key: 'supportingDocuments', label: 'Justificatifs déposés dans le dépôt central', count: Number(docs.rows[0]?.n || 0), total: null, complete: Number(docs.rows[0]?.n || 0) > 0 },
      { key: 'reconciliations', label: 'Opérations bancaires rapprochées', count: Number(reconciliations.rows[0]?.matched || 0), total: null, complete: true },
      { key: 'accountingEntries', label: 'Écritures comptables de l\'exercice', count: Number(exports.rows[0]?.n || 0), total: null, complete: Number(exports.rows[0]?.n || 0) > 0 },
      { key: 'openRequests', label: 'Demandes du comptable encore ouvertes', count: Number(openRequests.rows[0]?.n || 0), total: null, complete: Number(openRequests.rows[0]?.n || 0) === 0 },
    ];
    const complete = criteria.every(c => c.complete);
    return {
      year,
      criteria,
      complete,
      pendingItems: criteria.filter(c => !c.complete).map(c => c.label),
      note: 'Complétude calculée sur les données réelles de l\'exercice. Le statut « complet » est indicatif : il n\'affirme jamais qu\'un dossier a été transmis — la transmission passe par les exports FEC/CSV, le ZIP documentaire ou un partage explicitement confirmé.',
    };
  });
}
