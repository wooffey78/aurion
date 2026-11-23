// Notes de frais : ajout, consultation, modification, suppression et export CSV.
// Les justificatifs (fichiers) ne sont pas conservés par Aurion : ils passent par la file locale de l'appareil
// puis sont transférés dans le dossier 07_Notes_de_frais du cloud personnel (routes /cloud/documents).
// Les montants alimentent le moteur de calcul (comptabilité : achats HT + TVA déductible ; trésorerie : sorties prévues).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db.js';

export const EXPENSE_CATEGORIES = ['deplacement', 'repas', 'hebergement', 'carburant', 'peage_stationnement', 'fournitures', 'materiel', 'telecom', 'formation', 'autre'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const money = z.coerce.number().finite().min(0).max(1_000_000).transform(v => Math.round(v * 100) / 100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'date');

export const expenseInputSchema = z.object({
  spentOn: isoDate,
  label: z.string().trim().min(1).max(240),
  category: z.enum(EXPENSE_CATEGORIES).default('autre'),
  amountTtc: money,
  vatAmount: money.default(0),
  paymentMethod: z.string().trim().max(40).optional().nullable(),
  status: z.enum(['to_reimburse', 'reimbursed', 'paid_by_company']).default('to_reimburse'),
  reimbursedOn: isoDate.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  receiptName: z.string().trim().max(255).optional().nullable(),
  receiptMime: z.string().trim().max(120).optional().nullable(),
  receiptSize: z.coerce.number().int().min(0).max(25 * 1024 * 1024).optional().nullable(),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional().nullable(),
  receiptClientRef: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/).optional().nullable(),
  activityId: z.string().regex(UUID).optional(),
}).refine(v => v.vatAmount <= v.amountTtc, { message: 'La TVA ne peut pas dépasser le montant TTC.', path: ['vatAmount'] });

const columns = `e.id,e.activity_id as "activityId",to_char(e.spent_on,'YYYY-MM-DD') as "spentOn",e.label,e.category,e.amount_ttc::float8 as "amountTtc",e.vat_amount::float8 as "vatAmount",
  (e.amount_ttc-e.vat_amount)::float8 as "amountHt",e.payment_method as "paymentMethod",e.status,to_char(e.reimbursed_on,'YYYY-MM-DD') as "reimbursedOn",e.notes,
  e.receipt_name as "receiptName",e.receipt_mime as "receiptMime",e.receipt_size as "receiptSize",e.receipt_client_ref as "receiptClientRef",
  e.cloud_document_id as "cloudDocumentId",d.status as "cloudStatus",d.error_code as "cloudError",e.created_at as "createdAt",e.updated_at as "updatedAt"`;

async function activityFor(request: any, requested?: string) {
  const id = requested || request.headers['x-aurion-activity-id'];
  const r = id && UUID.test(String(id))
    ? await query('select id from activities where id=$1 and organization_id=$2 and active=true', [id, request.auth!.organizationId])
    : await query('select id from activities where organization_id=$1 and active=true order by created_at limit 1', [request.auth!.organizationId]);
  return r.rows[0]?.id as string | undefined;
}

export async function expenseReportRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/expense-reports', async (r, reply) => {
    const org = r.auth!.organizationId, aid = await activityFor(r);
    if (!aid) return { expenses: [], totals: { count: 0, amountTtc: 0, vatAmount: 0, amountHt: 0, toReimburse: 0 } };
    const year = Number((r.query as any)?.year) || null;
    const params: unknown[] = [org, aid]; let filter = '';
    if (year && year > 1900 && year < 3000) { params.push(year); filter = ` and e.spent_on>=make_date($3,1,1) and e.spent_on<make_date($3+1,1,1)`; }
    const rows = (await query(`select ${columns} from expense_reports e left join cloud_documents d on d.id=e.cloud_document_id and d.organization_id=e.organization_id where e.organization_id=$1 and e.activity_id=$2${filter} order by e.spent_on desc,e.created_at desc limit 1000`, params)).rows;
    const totals = rows.reduce((t: any, x: any) => ({ count: t.count + 1, amountTtc: t.amountTtc + x.amountTtc, vatAmount: t.vatAmount + x.vatAmount, amountHt: t.amountHt + x.amountHt, toReimburse: t.toReimburse + (x.status === 'to_reimburse' ? x.amountTtc : 0) }), { count: 0, amountTtc: 0, vatAmount: 0, amountHt: 0, toReimburse: 0 });
    for (const k of ['amountTtc', 'vatAmount', 'amountHt', 'toReimburse']) totals[k] = Math.round(totals[k] * 100) / 100;
    return reply.header('Cache-Control', 'no-store').send({ expenses: rows, totals, categories: EXPENSE_CATEGORIES });
  });

  app.get('/expense-reports/:id', async (r, reply) => {
    const id = String((r.params as any).id);
    if (!UUID.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const row = (await query(`select ${columns} from expense_reports e left join cloud_documents d on d.id=e.cloud_document_id and d.organization_id=e.organization_id where e.id=$1 and e.organization_id=$2`, [id, r.auth!.organizationId])).rows[0];
    if (!row) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Note de frais introuvable.' });
    return row;
  });

  app.post('/expense-reports', async (r, reply) => {
    const parsed = expenseInputSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: parsed.error.issues[0]?.message === 'La TVA ne peut pas dépasser le montant TTC.' ? parsed.error.issues[0].message : 'Les informations de la note de frais sont invalides.' });
    const b = parsed.data, aid = await activityFor(r, b.activityId);
    if (!aid) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Sélectionnez une activité valide.' });
    const row = (await query(`insert into expense_reports(organization_id,activity_id,spent_on,label,category,amount_ttc,vat_amount,payment_method,status,reimbursed_on,notes,receipt_name,receipt_mime,receipt_size,receipt_sha256,receipt_client_ref,created_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
    [r.auth!.organizationId, aid, b.spentOn, b.label, b.category, b.amountTtc, b.vatAmount, b.paymentMethod || null, b.status, b.status === 'reimbursed' ? (b.reimbursedOn || b.spentOn) : null, b.notes || null, b.receiptName || null, b.receiptMime || null, b.receiptSize ?? null, b.receiptSha256?.toLowerCase() || null, b.receiptClientRef || null, r.auth!.userId])).rows[0];
    return reply.code(201).send((await query(`select ${columns} from expense_reports e left join cloud_documents d on d.id=e.cloud_document_id where e.id=$1`, [row.id])).rows[0]);
  });

  app.patch('/expense-reports/:id', async (r, reply) => {
    const id = String((r.params as any).id);
    if (!UUID.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const parsed = expenseInputSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Les informations de la note de frais sont invalides.' });
    const b = parsed.data;
    const updated = await query(`update expense_reports set spent_on=$1,label=$2,category=$3,amount_ttc=$4,vat_amount=$5,payment_method=$6,status=$7,reimbursed_on=$8,notes=$9,
      receipt_name=coalesce($10,receipt_name),receipt_mime=coalesce($11,receipt_mime),receipt_size=coalesce($12,receipt_size),receipt_sha256=coalesce($13,receipt_sha256),receipt_client_ref=coalesce($14,receipt_client_ref),updated_at=now()
      where id=$15 and organization_id=$16 returning id`,
    [b.spentOn, b.label, b.category, b.amountTtc, b.vatAmount, b.paymentMethod || null, b.status, b.status === 'reimbursed' ? (b.reimbursedOn || b.spentOn) : null, b.notes || null, b.receiptName || null, b.receiptMime || null, b.receiptSize ?? null, b.receiptSha256?.toLowerCase() || null, b.receiptClientRef || null, id, r.auth!.organizationId]);
    if (!updated.rowCount) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Note de frais introuvable.' });
    return (await query(`select ${columns} from expense_reports e left join cloud_documents d on d.id=e.cloud_document_id where e.id=$1`, [id])).rows[0];
  });

  // Suppression de la note : les montants sortent des calculs. Le justificatif déjà présent dans le cloud n'est jamais supprimé par surprise.
  app.delete('/expense-reports/:id', async (r, reply) => {
    const id = String((r.params as any).id);
    if (!UUID.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const deleted = await query('delete from expense_reports where id=$1 and organization_id=$2 returning cloud_document_id', [id, r.auth!.organizationId]);
    if (!deleted.rowCount) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Note de frais introuvable.' });
    return { ok: true, cloudFileKept: Boolean(deleted.rows[0].cloud_document_id) };
  });

  app.get('/expense-reports/export.csv', async (r, reply) => {
    const org = r.auth!.organizationId, aid = await activityFor(r);
    if (!aid) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const year = Number((r.query as any)?.year) || new Date().getFullYear();
    const rows = (await query(`select to_char(spent_on,'YYYY-MM-DD') d,label,category,amount_ttc,vat_amount,(amount_ttc-vat_amount) ht,status,coalesce(payment_method,'') pm,coalesce(receipt_name,'') receipt from expense_reports where organization_id=$1 and activity_id=$2 and spent_on>=make_date($3,1,1) and spent_on<make_date($3+1,1,1) order by spent_on`, [org, aid, year])).rows;
    const cell = (v: unknown) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    const fr = (v: unknown) => Number(v || 0).toFixed(2).replace('.', ',');
    const lines = [['Date', 'Libellé', 'Catégorie', 'Montant TTC', 'TVA', 'Montant HT', 'Statut', 'Moyen de paiement', 'Justificatif'].map(cell).join(';'),
      ...rows.map((x: any) => [x.d, x.label, x.category, fr(x.amount_ttc), fr(x.vat_amount), fr(x.ht), x.status === 'reimbursed' ? 'Remboursée' : x.status === 'paid_by_company' ? 'Payée par l’entreprise' : 'À rembourser', x.pm, x.receipt].map(cell).join(';'))];
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Cache-Control', 'no-store').header('Content-Disposition', `attachment; filename="notes-de-frais-${year}.csv"`).send('﻿' + lines.join('\r\n') + '\r\n');
  });
}
