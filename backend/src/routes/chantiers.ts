// 15.4.50 — Routes chantiers : création, rattachement d'objets propriétaires, rentabilité
// réelle (B1) et contrôle de dérive devis→facture (B6). Le chantier référence — jamais ne
// remplace — les sources de vérité des modules. Lecture ouverte aux rôles métier, création
// réservée au chef d'entreprise et aux collaborateurs autorisés par les règles existantes.
// 15.4.52 — Robustesse : schéma d'entrée tolérant aux null (l'interface envoie location:null
// quand le lieu est vide — l'ancien schéma rejetait la requête avec un message trompeur),
// message d'erreur précis champ par champ, garde d'appartenance activité/client (un identifiant
// obsolète ou d'une autre organisation ne fait plus échouer la création : il est ignoré et
// signalé), gestion du cycle de vie (PATCH statut avec transitions validées) et filtre de liste.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sqlExecutor } from '../db.js';
import { createChantier, linkObject, listChantiers, chantierProfitability, updateChantierStatus, CHANTIER_TRANSITIONS } from '../services/chantiers.js';
import { detectDeviation, type DeviationRubric } from '../services/deviation-guard.js';

const LINK_TYPES = ['quote', 'appointment', 'intervention', 'sav_case', 'time_session', 'expense', 'document'] as const;

const chantierInput = z.object({
  name: z.string().trim().min(2).max(200),
  clientId: z.union([z.string().uuid(), z.literal(''), z.null()]).nullish(),
  activityId: z.union([z.string().uuid(), z.literal(''), z.null()]).nullish(),
  location: z.string().trim().max(300).nullish(),
  notes: z.string().max(4000).nullish(),
}).passthrough();

const FIELD_LABELS: Record<string, string> = { name: 'nom', clientId: 'client', activityId: 'activité', location: 'lieu', notes: 'notes' };

function chantierInputError(parsed: { error: z.ZodError }): string {
  const parts = parsed.error.issues.map(i => {
    if (!i.path.length) return 'corps de la requête : objet JSON attendu (Content-Type application/json)';
    const field = FIELD_LABELS[String(i.path[0])] || String(i.path[0]);
    if (i.code === 'invalid_type') return `${field} : type invalide (${String(i.expected || 'texte')} attendu)`;
    if (i.code === 'too_small') return `${field} : trop court`;
    if (i.code === 'too_big') return `${field} : trop long`;
    return `${field} : valeur invalide`;
  });
  return `Champs invalides : ${parts.join(' ; ')}. Le nom (2 à 200 caractères) est obligatoire ; lieu et notes peuvent rester vides.`;
}

export async function chantierRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.get('/chantiers', async r => {
    const org = r.auth!.organizationId;
    const aid = (r.headers['x-aurion-activity-id'] as string) || undefined;
    const status = String((r.query as any)?.status || '').trim();
    const allowed = ['active', 'completed', 'archived'];
    return { chantiers: await listChantiers(org, aid || null, allowed.includes(status) ? status : null) };
  });

  app.post('/chantiers', async (r, reply) => {
    const org = r.auth!.organizationId;
    const parsed = chantierInput.safeParse(r.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: chantierInputError(parsed) });
    // 15.4.52 — garde d'appartenance : un identifiant d'activité ou de client qui n'existe pas
    // dans CETTE organisation (identifiant obsolète en cache, activité supprimée) ne doit pas
    // faire échouer la création d'un 500 ; il est ignoré et signalé honnêtement.
    const requestedActivityId = parsed.data.activityId || (r.headers['x-aurion-activity-id'] as string) || null;
    const requestedClientId = parsed.data.clientId || null;
    const { activityId, clientId, warnings } = await validateReferences(org, requestedActivityId, requestedClientId);
    const created = await createChantier(org, {
      name: parsed.data.name,
      clientId,
      activityId,
      location: parsed.data.location ?? null,
      notes: parsed.data.notes ?? '',
      createdBy: r.auth!.userId,
    });
    return warnings.length ? { ...created, warnings } : created;
  });

  app.post('/chantiers/:id/links', async (r, reply) => {
    const org = r.auth!.organizationId;
    const id = String((r.params as any).id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const body = z.object({
      objectType: z.enum(LINK_TYPES),
      objectId: z.string().uuid(),
    }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'objectType et objectId requis (types connus : devis, rendez-vous, temps, SAV, frais, document).' });
    const exists = (await sqlExecutor.query(`select 1 from chantiers where id=$2 and organization_id=$1`, [org, id])).rowCount;
    if (!exists) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Chantier introuvable.' });
    const linked = await linkObject(org, id, body.data.objectType, body.data.objectId, r.auth!.userId);
    if (!linked.linked) return reply.code(200).send({ linked: false, note: 'Objet déjà rattaché à ce chantier (idempotent).' });
    return { linked: true };
  });

  // 15.4.52 — cycle de vie : transitions validées (active→completed→archived, réouverture
  // completed→active), journal d'événement, aucune suppression (le chantier référence les
  // sources de vérité : il s'archive, il ne s'efface jamais).
  app.patch('/chantiers/:id', async (r, reply) => {
    const org = r.auth!.organizationId;
    const id = String((r.params as any).id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const body = z.object({
      status: z.enum(['active', 'completed', 'archived']).optional(),
      name: z.string().trim().min(2).max(200).optional(),
      location: z.string().trim().max(300).nullish(),
      notes: z.string().max(4000).nullish(),
    }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Statut (active/completed/archived), nom (2-200), lieu ou notes modifiables.' });
    try {
      const updated = await updateChantierStatus(org, id, body.data, r.auth!.userId);
      if (!updated) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Chantier introuvable.' });
      return updated;
    } catch (e: any) {
      if (e?.message?.startsWith('CHANTIER_TRANSITION_INVALID')) {
        return reply.code(409).send({ error: 'TRANSITION_INVALID', message: `Transition de statut non permise. Transitions acceptées : ${CHANTIER_TRANSITIONS.map(t => `${t.from}→${t.to}`).join(', ')}.` });
      }
      throw e;
    }
  });

  // Rentabilité réelle du chantier : agrégation des sources de vérité + alerte de dérive.
  app.get('/chantiers/:id/profitability', async (r, reply) => {
    const org = r.auth!.organizationId;
    const id = String((r.params as any).id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const rate = Math.max(0, Math.round(Number((r.query as any)?.hourlyRateCents ?? 0)));
    try {
      return await chantierProfitability(sqlExecutor, org, id, rate);
    } catch (e: any) {
      if (e?.message === 'CHANTIER_NOT_FOUND') return reply.code(404).send({ error: 'NOT_FOUND', message: 'Chantier introuvable.' });
      throw e;
    }
  });
}

/** Vérifie l'appartenance à l'organisation ; renvoie les identifiants sûrs (null sinon) + avertissements. */
async function validateReferences(org: string, activityId: string | null, clientId: string | null): Promise<{ activityId: string | null; clientId: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  let safeActivityId: string | null = null;
  let safeClientId: string | null = null;
  if (activityId && /^[0-9a-f-]{36}$/i.test(activityId)) {
    const ok = (await sqlExecutor.query(`select 1 from activities where id=$1 and organization_id=$2`, [activityId, org])).rowCount;
    safeActivityId = ok ? activityId : null;
    if (!ok) warnings.push('Activité demandée introuvable dans cette organisation : chantier créé sans rattachement d\u2019activité.');
  } else if (activityId) {
    warnings.push('Identifiant d\u2019activité invalide ignoré.');
  }
  if (clientId && /^[0-9a-f-]{36}$/i.test(clientId)) {
    const ok = (await sqlExecutor.query(`select 1 from clients where id=$1 and organization_id=$2`, [clientId, org])).rowCount;
    safeClientId = ok ? clientId : null;
    if (!ok) warnings.push('Client demandé introuvable dans cette organisation : chantier créé sans client rattaché.');
  } else if (clientId) {
    warnings.push('Identifiant de client invalide ignoré.');
  }
  return { activityId: safeActivityId, clientId: safeClientId, warnings };
}

/**
 * 15.4.50 (B6) — Contrôle de dérive devis → facture : comparaison déterministe des rubriques.
 * L'interface l'appelle AVANT la facturation d'un devis accepté ; si une dérive est détectée,
 * la justification est exigée et conservée dans l'audit de l'émission (règle prompt 13).
 */
export async function deviationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.requireAuth);

  app.post('/deviation-check', async (r, reply) => {
    const body = z.object({
      thresholdPct: z.number().min(1).max(100).optional(),
      quote: z.array(z.object({ label: z.string().max(160), amountHt: z.number() })).max(300),
      invoice: z.array(z.object({ label: z.string().max(160), amountHt: z.number() })).max(300),
    }).safeParse(r.body);
    if (!body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: 'Rubriques du devis et de la facture requises (libellé + montant HT).' });
    const quote: DeviationRubric[] = body.data.quote.map(x => ({ label: x.label, amountHt: x.amountHt }));
    const invoice: DeviationRubric[] = body.data.invoice.map(x => ({ label: x.label, amountHt: x.amountHt }));
    return detectDeviation(quote, invoice, body.data.thresholdPct ?? 10);
  });
}
