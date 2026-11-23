// Bloc 13 (prompt 13) — règles d'automatisation configurables (déterministes, sans IA) :
// CRUD avec versionnage, activation/désactivation, simulation à blanc, journal d'exécution.
// Le balayage planifié est déclenché par le scheduler ; un déclenchement manuel reste possible.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, db, beginTenant } from '../db.js';
import { normalizeRuleConfig, runRule, evaluateTrigger, simulateRuleWindow, TRIGGER_LABELS, WorkflowError, type TriggerType } from '../services/workflows.js';
import type { SqlExecutor } from '../services/sql-executor.js';

const ruleCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  triggerType: z.enum(['invoice_overdue', 'stock_below_threshold', 'deadline_reminder']),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
}).passthrough();

const rulePatchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
}).passthrough();

const simulateSchema = z.object({
  dryRun: z.boolean().optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).passthrough();

function workflowError(reply: any, e: any) {
  if (e instanceof WorkflowError) return reply.code(e.code === 'RULE_NOT_FOUND' ? 404 : 400).send({ error: e.code, message: e.message });
  throw e;
}

export async function automationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.requireAuth);

  app.get('/automation/triggers', async () => ({
    triggers: Object.entries(TRIGGER_LABELS).map(([type, label]) => ({ type, label })),
    note: 'Les actions disponibles sont internes et déterministes : alerte de journal de bord et création de tâche. Aucune action externe ou irréversible sans validation humaine.',
  }));

  app.get('/automation/rules', async r => {
    const rows = (await query(
      `select id,name,trigger_type as "triggerType",config,enabled,version,created_at as "createdAt",updated_at as "updatedAt",
              (select count(*)::int from workflow_runs wr where wr.rule_id=workflow_rules.id and wr.status='executed') as "executedRuns",
              (select count(*)::int from workflow_runs wr where wr.rule_id=workflow_rules.id and wr.status='simulated') as "simulatedRuns"
       from workflow_rules where organization_id=$1 order by created_at desc`,
      [r.auth!.organizationId],
    )).rows;
    return { rules: rows };
  });

  app.post('/automation/rules', async (r, reply) => {
    const parsed = ruleCreateSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const b: any = parsed.data;
    let config;
    try { config = normalizeRuleConfig(b.triggerType as TriggerType, b.config ?? {}); }
    catch (e: any) { return workflowError(reply, e); }
    const existing = (await query(`select id from workflow_rules where organization_id=$1 and name=$2`, [r.auth!.organizationId, b.name])).rowCount;
    if (existing) return reply.code(409).send({ error: 'RULE_NAME_TAKEN', message: 'Une règle porte déjà ce nom dans votre organisation.' });
    const row = (await query(
      `insert into workflow_rules(organization_id,name,trigger_type,config,enabled,created_by) values($1,$2,$3,$4::jsonb,$5,$6) returning id`,
      [r.auth!.organizationId, b.name, b.triggerType, JSON.stringify(config), b.enabled !== false, r.auth!.userId],
    )).rows[0];
    return reply.code(201).send({ id: String(row.id), name: b.name, triggerType: b.triggerType, config, enabled: b.enabled !== false, version: 1 });
  });

  app.patch('/automation/rules/:id', async (r, reply) => {
    const parsed = rulePatchSchema.safeParse(r.body || {});
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT' });
    const id = String((r.params as any).id), org = r.auth!.organizationId, b: any = parsed.data;
    const rule = (await query(`select id,name,trigger_type,config,version from workflow_rules where id=$1 and organization_id=$2`, [id, org])).rows[0];
    if (!rule) return reply.code(404).send({ error: 'NOT_FOUND' });
    // Versionnage : chaque changement de configuration incrémente la version (audit du prompt 13).
    let config: any = rule.config;
    let version = Number(rule.version || 1);
    if (b.config !== undefined) {
      try { config = normalizeRuleConfig(String(rule.trigger_type) as TriggerType, b.config); }
      catch (e: any) { return workflowError(reply, e); }
      version += 1;
    }
    await query(
      `update workflow_rules set name=coalesce($2,name),config=$3::jsonb,enabled=coalesce($4,enabled),version=$5,updated_at=now()
       where id=$1 and organization_id=$6`,
      [id, b.name ?? null, JSON.stringify(config), typeof b.enabled === 'boolean' ? b.enabled : null, version, org],
    );
    return { ok: true, version, config };
  });

  app.delete('/automation/rules/:id', async (r, reply) => {
    // Désactivation logique préférée ; la suppression reste possible tant qu'aucun run n'existe.
    const id = String((r.params as any).id), org = r.auth!.organizationId;
    const runs = (await query(`select 1 from workflow_runs where rule_id=$1 and organization_id=$2 limit 1`, [id, org])).rowCount;
    if (runs) {
      await query(`update workflow_rules set enabled=false,updated_at=now() where id=$1 and organization_id=$2`, [id, org]);
      return { ok: true, disabled: true, note: 'La règle possédait un journal d\'exécution : elle a été désactivée et conservée (aucun run supprimé).' };
    }
    const x = await query(`delete from workflow_rules where id=$1 and organization_id=$2 returning id`, [id, org]);
    if (!x.rowCount) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ok: true, deleted: true };
  });

  // Simulation à blanc / exécution manuelle : les candidats proviennent des données réelles.
  app.post('/automation/rules/:id/simulate', async (r, reply) => {
    const id = String((r.params as any).id), org = r.auth!.organizationId, b: any = r.body || {};
    const rule = (await query(`select id,name,trigger_type,config,enabled,version from workflow_rules where id=$1 and organization_id=$2`, [id, org])).rows[0];
    if (!rule) return reply.code(404).send({ error: 'NOT_FOUND' });
    const dryRun = b.dryRun !== false;
    let config;
    try { config = normalizeRuleConfig(String(rule.trigger_type) as TriggerType, rule.config); }
    catch (e: any) { return workflowError(reply, e); }
    const contexts = await evaluateTrigger(org, String(rule.trigger_type) as TriggerType).catch(() => []);
    const limit = Number(b.limit || contexts.length || 1);
    const results: Array<unknown> = [];
    for (const context of contexts.slice(0, limit)) {
      const client = await db.connect();
      try {
        await beginTenant(client);
        const result = await runRule(client as unknown as SqlExecutor, org, {
          id: String(rule.id), name: String(rule.name), triggerType: String(rule.trigger_type) as TriggerType, config, version: Number(rule.version || 1),
        }, context, { dryRun, actorId: r.auth!.userId });
        await client.query('commit');
        results.push({ ref: context.ref, label: context.label, detail: context.detail ?? '', ...result });
      } catch (e: any) {
        await client.query('rollback').catch(() => { });
        results.push({ ref: context.ref, label: context.label, error: String(e?.message || e) });
      } finally { client.release(); }
    }
    return {
      dryRun, results,
      note: dryRun
        ? 'Simulation à blanc : les actions NE sont PAS exécutées, chaque candidat est journalisé comme run « simulated ».'
        : 'Exécution manuelle : chaque candidat est journalisé ; un rejeu du même déclencheur est ignoré (idempotence).',
    };
  });

  // 15.4.50 (A5) — Simulation à blanc sur FENÊTRE HISTORIQUE : « cette règle aurait déclenché
  // N fois sur les X derniers jours » — calcul en lecture seule, aucun run ni action écrits.
  app.post('/automation/rules/:id/dry-run', async (r, reply) => {
    const id = String((r.params as any).id), org = r.auth!.organizationId, b: any = r.body || {};
    const rule = (await query(`select id,name,trigger_type,config,enabled,version from workflow_rules where id=$1 and organization_id=$2`, [id, org])).rows[0];
    if (!rule) return reply.code(404).send({ error: 'NOT_FOUND' });
    let config;
    try { config = normalizeRuleConfig(String(rule.trigger_type) as TriggerType, rule.config); }
    catch (e: any) { return workflowError(reply, e); }
    const windowDays = Math.max(1, Math.min(365, Math.round(Number(b.windowDays ?? 90))));
    const simulation = await simulateRuleWindow(org, { triggerType: String(rule.trigger_type) as TriggerType, config }, windowDays);
    return {
      ...simulation,
      ruleName: String(rule.name),
      note: `Lecture seule : la règle « ${rule.name} » aurait déclenché ${simulation.wouldTrigger} fois sur les ${simulation.windowDays} derniers jours. Aucun run ni action n'a été créé — activez la règle pour l'appliquer aux futurs événements.`,
    };
  });

  app.get('/automation/runs', async r => {
    const ruleId = String((r.query as any)?.ruleId || '');
    const rows = (await query(
      `select wr.id,wr.rule_id as "ruleId",r.name as "ruleName",wr.rule_version as "ruleVersion",wr.trigger_type as "triggerType",
              wr.trigger_ref as "triggerRef",wr.status,wr.actions,wr.result,wr.error,wr.executed_at as "executedAt",wr.created_at as "createdAt"
       from workflow_runs wr left join workflow_rules r on r.id=wr.rule_id
       where wr.organization_id=$1 and ($2::uuid is null or wr.rule_id=$2::uuid)
       order by wr.created_at desc limit 200`,
      [r.auth!.organizationId, /^[0-9a-f-]{36}$/i.test(ruleId) ? ruleId : null],
    )).rows;
    return { runs: rows };
  });

  // Déclenchement manuel du balayage (utile après activation d'une règle) — mêmes garanties
  // d'idempotence que le balayage planifié.
  app.post('/automation/sweep', async r => {
    const { runWorkflowSweep } = await import('../services/workflows.js');
    const result = await runWorkflowSweep(r.log);
    return { ok: true, ...result, note: 'Chaque exécution est journalisée et idempotente (même règle + même déclencheur = un seul run).' };
  });
}
