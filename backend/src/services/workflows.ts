// Bloc 13 (prompt 13) — automatisations et workflows DÉTERMINISTES (sans IA).
// Règles explicites : déclencheur (événement métier), conditions composables, actions internes
// (alerte de journal, tâche), journal d'exécution avec clé d'idempotence (la même règle sur le
// même déclencheur n'est exécutée qu'une fois), simulation à blanc, versionnage et
// activation/désactivation. AUCUN LLM, aucune prédiction : chaque décision est une comparaison
// de seuils documentée. Les workflows réutilisent les événements/alertes existants et ne
// réimplémentent aucun module.
import { query, db, beginTenant, adminQuery, withTenant, logAdminAccess } from '../db.js';
import { emitOrgEvent } from './events.js';
import type { SqlExecutor } from './sql-executor.js';

export type TriggerType = 'invoice_overdue' | 'stock_below_threshold' | 'deadline_reminder'
  // 15.4.50 (A5) — déclencheurs événementiels additionnels, balayés de façon idempotente.
  | 'quote_accepted' | 'intervention_completed' | 'warranty_expiring' | 'document_shared';

export interface RuleAction {
  type: 'journal_alert' | 'create_task';
  title?: string;
  description?: string;
  dueInDays?: number;
  severity?: 'action' | 'warning' | 'error';
}

export interface RuleConfig {
  /** invoice_overdue : jours de retard exigés avant déclenchement. */
  overdueDays?: number;
  /** Seuil numérique générique (stock, montant). */
  threshold?: number;
  /** Actions exécutées dans l'ordre. */
  actions?: RuleAction[];
}

export class WorkflowError extends Error {
  constructor(public code: 'RULE_NOT_FOUND' | 'INVALID_TRIGGER' | 'INVALID_CONFIG' | 'INVALID_ACTION', message: string) {
    super(message);
  }
}

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  invoice_overdue: 'Facture en retard de paiement',
  stock_below_threshold: 'Stock disponible sous le seuil de réapprovisionnement',
  deadline_reminder: 'Tâche arrivant à échéance',
  quote_accepted: 'Devis accepté (décision du client)',
  intervention_completed: 'Rendez-vous d\'intervention terminé',
  warranty_expiring: 'Garantie arrivant à expiration',
  document_shared: 'Document partagé par lien sécurisé',
};

/** Valide une configuration de règle : conditions explicites, actions connues. Fonction PURE — testée sans base. */
export function normalizeRuleConfig(triggerType: TriggerType, raw: unknown): RuleConfig {
  const cfg: any = raw && typeof raw === 'object' ? { ...(raw as any) } : {};
  const out: RuleConfig = {};
  if (triggerType === 'invoice_overdue') {
    const days = Math.round(Number(cfg.overdueDays ?? 0));
    if (!Number.isFinite(days) || days < 0 || days > 365) throw new WorkflowError('INVALID_CONFIG', 'overdueDays doit être un entier entre 0 et 365 (jours de retard avant déclenchement).');
    out.overdueDays = days;
  }
  if (triggerType === 'stock_below_threshold') {
    // Le seuil reste la source de vérité de l'article (parts.min_stock_threshold) : la règle
    // ne le duplique pas, elle réagit aux alertes émises par le moteur de stock.
    if (cfg.threshold !== undefined && cfg.threshold !== null && cfg.threshold !== '') {
      const t = Number(cfg.threshold);
      if (!Number.isFinite(t) || t < 0) throw new WorkflowError('INVALID_CONFIG', 'threshold doit être un nombre positif ou nul.');
      out.threshold = t;
    }
  }
  if (triggerType === 'deadline_reminder') {
    const days = Math.round(Number(cfg.overdueDays ?? 0));
    if (!Number.isFinite(days) || days < 0 || days > 365) throw new WorkflowError('INVALID_CONFIG', 'overdueDays doit être un entier entre 0 et 365 (jours avant l\'échéance).');
    out.overdueDays = days;
  }
  // 15.4.50 (A5) — garantie_expirante : préavis en jours avant la fin de garantie.
  if (triggerType === 'warranty_expiring') {
    const days = Math.round(Number(cfg.expiringInDays ?? cfg.overdueDays ?? 14));
    if (!Number.isFinite(days) || days < 1 || days > 365) throw new WorkflowError('INVALID_CONFIG', 'expiringInDays doit être un entier entre 1 et 365 (préavis avant expiration de garantie).');
    out.overdueDays = days;
  }
  // quote_accepted / intervention_completed / document_shared : réactions pures, aucune
  // condition numérique — la condition est l'événement lui-même (idempotence par objet).
  const actions = Array.isArray(cfg.actions) ? cfg.actions : [];
  if (actions.length === 0) throw new WorkflowError('INVALID_ACTION', 'Définissez au moins une action (journal_alert ou create_task).');
  if (actions.length > 5) throw new WorkflowError('INVALID_ACTION', 'Cinq actions maximum par règle.');
  out.actions = actions.map((a: any, i: number) => {
    const type = String(a?.type ?? '');
    if (!['journal_alert', 'create_task'].includes(type)) throw new WorkflowError('INVALID_ACTION', `Action ${i + 1} inconnue : seules journal_alert et create_task sont disponibles (aucune action externe sans validation humaine).`);
    const title = String(a?.title ?? '').trim().slice(0, 240);
    if (!title) throw new WorkflowError('INVALID_ACTION', `Action ${i + 1} : le titre est obligatoire.`);
    const action: RuleAction = { type: type as 'journal_alert' | 'create_task', title };
    if (a?.description) action.description = String(a.description).slice(0, 2000);
    if (a?.severity && ['action', 'warning', 'error'].includes(String(a.severity))) action.severity = a.severity;
    if (a?.dueInDays != null && a?.dueInDays !== '') {
      const due = Math.round(Number(a.dueInDays));
      if (!Number.isFinite(due) || due < 0 || due > 365) throw new WorkflowError('INVALID_ACTION', `Action ${i + 1} : dueInDays doit être un entier entre 0 et 365.`);
      action.dueInDays = due;
    }
    return action;
  });
  return out;
}

/** Contexte déclencheur normalisé passé aux règles. */
export interface TriggerContext {
  triggerType: TriggerType;
  /** Référence stable du déclencheur (facture, article, tâche) — clé d'idempotence par règle. */
  ref: string;
  refId?: string | null;
  label: string;
  detail?: string;
  internalPath?: string;
  /** Valeurs de substitution déterministes pour les titres/descriptions. */
  vars?: Record<string, string>;
}

/** Substitution déterministe {variable} → valeur, sans interprétation ni template engine. */
export function substitute(text: string, vars: Record<string, string> | undefined): string {
  if (!vars) return text;
  return text.replace(/\{([a-zA-Z_]+)\}/g, (m, key: string) => (Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m));
}

/**
 * Exécute (ou simule) une règle sur un contexte : journalisation du run, actions internes.
 * Idempotence : la clé (org, règle, déclencheur) est unique — un rejeu ne crée rien.
 * dryRun=true enregistre un run « simulated » et n'exécute AUCUNE action.
 */
export async function runRule(
  exec: SqlExecutor,
  organizationId: string,
  rule: { id: string; name: string; triggerType: TriggerType; config: RuleConfig; version: number },
  context: TriggerContext,
  opts: { dryRun?: boolean; actorId?: string | null } = {},
): Promise<{ runId: string; status: 'simulated' | 'executed' | 'duplicate'; actions: unknown[] }> {
  const idempotencyKey = `${rule.id}:${context.ref}`.slice(0, 240);
  const existing = (await exec.query(
    `select id,status from workflow_runs where organization_id=$1 and idempotency_key=$2`,
    [organizationId, idempotencyKey],
  )).rows[0];
  if (existing) return { runId: String(existing.id), status: 'duplicate', actions: [] };
  const actions = (rule.config.actions ?? []).map(a => ({
    type: a.type,
    title: substitute(a.title ?? rule.name, context.vars),
    description: substitute(a.description ?? '', context.vars),
    severity: a.severity ?? (a.type === 'journal_alert' ? 'warning' : 'action'),
    dueInDays: a.dueInDays ?? null,
  }));
  const dryRun = Boolean(opts.dryRun);
  const run = (await exec.query(
    `insert into workflow_runs(organization_id,rule_id,rule_version,trigger_type,trigger_ref,status,actions,idempotency_key,executed_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [organizationId, rule.id, rule.version, rule.triggerType, context.ref.slice(0, 200), dryRun ? 'simulated' : 'executed', JSON.stringify(actions), idempotencyKey, new Date().toISOString()],
  )).rows[0];
  if (!dryRun) {
    for (const a of actions as Array<{ type: 'journal_alert' | 'create_task'; title: string; description: string; severity: string; dueInDays: number | null }>) {
      if (a.type === 'journal_alert') {
        await emitOrgEvent(organizationId, {
          type: `workflow:${rule.name.slice(0, 40)}`,
          title: a.title.slice(0, 240),
          description: `${a.description}${a.description ? ' ' : ''}(règle « ${rule.name} », déclencheur : ${TRIGGER_LABELS[rule.triggerType]}).`,
          severity: (a.severity as 'action' | 'warning' | 'error') ?? 'warning',
          source: 'workflow',
          internalPath: context.internalPath ?? null,
          dedupeKey: `workflow-run:${run.id}`,
        });
      } else if (a.type === 'create_task') {
        const dueAt = a.dueInDays != null ? new Date(Date.now() + a.dueInDays * 86400000).toISOString() : null;
        await exec.query(
          `insert into tasks(organization_id,title,description,due_at,source,source_id)
           values($1,$2,$3,$4::timestamptz,'workflow',$5)`,
          [organizationId, a.title.slice(0, 240), a.description || '', dueAt, run.id],
        );
      }
    }
  }
  return { runId: String(run.id), status: dryRun ? 'simulated' : 'executed', actions };
}

/**
 * Évalue les règles activées d'une organisation pour un type de déclencheur.
 * Les candidats proviennent des données métier réelles (aucun état parallèle).
 */
export async function evaluateTrigger(organizationId: string, triggerType: TriggerType, withinDays = 1): Promise<TriggerContext[]> {
  // 15.4.50 (A5) — déclencheurs événementiels : candidats = événements récents de la fenêtre
  // (défaut 24 h ; simulation à blanc : 90 jours). Idempotence garantie par runRule (clé
  // règle+objet) : un balayage tardif ne rejoue jamais deux fois la même décision.
  if (triggerType === 'quote_accepted') {
    const rows = (await query(
      `select q.id,q.number,q.accepted_at,q.total_ttc,c.name client_name
       from quotes q left join clients c on c.id=q.client_id
       where q.organization_id=$1 and q.document_type='quote' and q.status='accepted'
         and q.accepted_at >= now() - interval '1 day' * greatest(1,$2::int) limit 50`,
      [organizationId, withinDays],
    )).rows;
    return rows.map((r: any) => ({
      triggerType, ref: r.id, refId: r.id,
      label: `Devis ${r.number} accepté`,
      detail: `Accepté le ${new Date(r.accepted_at).toLocaleDateString('fr-FR')} · ${Number(r.total_ttc || 0).toFixed(2)} € TTC${r.client_name ? ` · ${r.client_name}` : ''}`,
      internalPath: '/invoices',
      vars: { quote: String(r.number || ''), client: String(r.client_name || ''), amount: Number(r.total_ttc || 0).toFixed(2) },
    }));
  }
  if (triggerType === 'intervention_completed') {
    const rows = (await query(
      `select a.id,a.title,a.ends_at,a.client_id,c.name client_name
       from appointments a left join clients c on c.id=a.client_id
       where a.organization_id=$1 and a.status='completed' and a.ends_at >= now() - interval '1 day' * greatest(1,$2::int) limit 50`,
      [organizationId, withinDays],
    )).rows;
    return rows.map((r: any) => ({
      triggerType, ref: `appointment:${r.id}`, refId: r.id,
      label: `Intervention terminée : ${r.title}`,
      detail: `Terminée le ${new Date(r.ends_at).toLocaleDateString('fr-FR')}${r.client_name ? ` · ${r.client_name}` : ''} — penser à la préparation de facturation (éléments validés uniquement).`,
      internalPath: '/agenda',
      vars: { appointment: String(r.title || ''), client: String(r.client_name || '') },
    }));
  }
  if (triggerType === 'warranty_expiring') {
    const rows = (await query(
      `select w.id,w.policy_name,w.ends_at,d.brand,d.model,c.name client_name,
             coalesce((select min((r.config->>'overdueDays')::int) from workflow_rules r where r.organization_id=$1 and r.trigger_type='warranty_expiring' and r.enabled=true),14) days
       from warranties w
       left join devices d on d.id=w.device_id
       left join clients c on c.id=w.client_id
       where w.organization_id=$1 and w.ends_at >= now()
         and w.ends_at < now() + interval '1 day' * greatest(1,$2::int) limit 50`,
      [organizationId, withinDays],
    )).rows;
    return rows.map((r: any) => ({
      triggerType, ref: `warranty:${r.id}`, refId: r.id,
      label: `Garantie expirante : ${r.policy_name}`,
      detail: `Fin le ${new Date(r.ends_at).toLocaleDateString('fr-FR')}${r.brand || r.model ? ` · ${r.brand ?? ''} ${r.model ?? ''}` : ''}${r.client_name ? ` · ${r.client_name}` : ''}`,
      internalPath: '/catalog',
      vars: { warranty: String(r.policy_name || ''), endDate: new Date(r.ends_at).toLocaleDateString('fr-FR'), client: String(r.client_name || '') },
    }));
  }
  if (triggerType === 'document_shared') {
    const rows = (await query(
      `select s.id,d.name doc_name,s.recipient_email,s.created_at,d.document_type
       from document_shares s join documents d on d.id=s.document_id
       where s.organization_id=$1 and s.revoked_at is null and s.created_at >= now() - interval '1 day' * greatest(1,$2::int) limit 50`,
      [organizationId, withinDays],
    )).rows;
    return rows.map((r: any) => ({
      triggerType, ref: `share:${r.id}`, refId: r.id,
      label: `Document partagé : ${r.doc_name}`,
      detail: `Partagé le ${new Date(r.created_at).toLocaleDateString('fr-FR')}${r.recipient_email ? ` · destinataire ${r.recipient_email}` : ''} — le partage est révocable à tout moment.`,
      internalPath: '/docs',
      vars: { document: String(r.doc_name || ''), recipient: String(r.recipient_email || '') },
    }));
  }
  if (triggerType === 'invoice_overdue') {
    const rows = (await query(
      `select q.id,q.number,q.total_ttc,q.due_at,
              greatest(0,extract(day from now()-coalesce(q.due_at,q.created_at)))::int days_late,c.name client_name
       from quotes q left join clients c on c.id=q.client_id
       where q.organization_id=$1 and q.document_type='invoice' and q.payment_status<>'paid'
         and q.sent_at is not null and lower(coalesce(q.status,'')) not in ('canceled','cancelled','annulé','annule','void','deleted')
         and coalesce(q.due_at,q.created_at) < now() - interval '1 day' * greatest(0,coalesce((select min((r.config->>'overdueDays')::int) from workflow_rules r where r.organization_id=$1 and r.trigger_type='invoice_overdue' and r.enabled=true),0))
       limit 50`,
      [organizationId],
    )).rows;
    return rows.map((r: any) => ({
      triggerType, ref: r.id, refId: r.id,
      label: `Facture ${r.number} en retard`,
      detail: `${r.days_late} jour(s) de retard · ${Number(r.total_ttc || 0).toFixed(2)} € TTC${r.client_name ? ` · ${r.client_name}` : ''}`,
      internalPath: '/invoices',
      vars: { invoice: String(r.number || ''), daysLate: String(r.days_late || 0), client: String(r.client_name || ''), amount: Number(r.total_ttc || 0).toFixed(2) },
    }));
  }
  if (triggerType === 'stock_below_threshold') {
    const rows = (await query(
      `select p.id,p.name,p.reference,
              (p.stock - coalesce((select sum(r.quantity) from part_reservations r where r.organization_id=p.organization_id and r.part_id=p.id and r.status='active'),0)) as available,
              p.min_stock_threshold as threshold
       from parts p
       where p.organization_id=$1 and coalesce(p.min_stock_threshold,0)>0
         and (p.stock - coalesce((select sum(r.quantity) from part_reservations r where r.organization_id=p.organization_id and r.part_id=p.id and r.status='active'),0)) < p.min_stock_threshold
       limit 50`,
      [organizationId],
    )).rows;
    return rows.map((r: any) => ({
      triggerType, ref: `stock:${r.id}`,
      label: `Stock faible : ${r.name}`,
      detail: `Disponible ${Number(r.available || 0)}, seuil ${Number(r.threshold || 0)}`,
      internalPath: '/catalogue',
      vars: { part: String(r.name || ''), available: String(Number(r.available || 0)), threshold: String(Number(r.threshold || 0)) },
    }));
  }
  // deadline_reminder : tâches arrivant à échéance dans les N jours de la règle la plus courte.
  const rows = (await query(
    `select t.id,t.title,t.due_at from tasks t
     where t.organization_id=$1 and t.status='todo' and t.due_at is not null
       and t.due_at < now() + interval '1 day' * greatest(1,coalesce((select min((r.config->>'overdueDays')::int) from workflow_rules r where r.organization_id=$1 and r.trigger_type='deadline_reminder' and r.enabled=true),1))
     limit 50`,
    [organizationId],
  )).rows;
  return rows.map((r: any) => ({
    triggerType, ref: `task:${r.id}`,
    label: `Échéance : ${r.title}`,
    detail: `Échéance ${new Date(r.due_at).toLocaleDateString('fr-FR')}`,
    internalPath: '/tasks',
    vars: { task: String(r.title || ''), dueDate: new Date(r.due_at).toLocaleDateString('fr-FR') },
  }));
}

/**
 * Balayage planifié (appelé par le scheduler) : pour chaque organisation possédant des règles
 * activées, évalue les déclencheurs et exécute les règles concernées. Idempotent : les runs
 * déjà enregistrés sont ignorés (clé unique), l'événement tardif n'est pas rejoué deux fois.
 */
export async function runWorkflowSweep(log: any): Promise<{ organizations: number; executed: number; duplicates: number }> {
  await logAdminAccess('workflow.sweep', { at: new Date().toISOString() });
  const orgs = (await adminQuery(`select distinct organization_id from workflow_rules where enabled=true`)).rows;
  let executed = 0, duplicates = 0;
  for (const o of orgs) {
    const organizationId = String(o.organization_id);
    try {
      await withTenant(organizationId, async () => {
        const rules = (await query(`select id,name,trigger_type,config,version from workflow_rules where organization_id=$1 and enabled=true`, [organizationId])).rows;
        for (const rule of rules) {
          const triggerType = String(rule.trigger_type) as TriggerType;
          if (!TRIGGER_LABELS[triggerType]) continue;
          let config: RuleConfig;
          try { config = normalizeRuleConfig(triggerType, rule.config); } catch { continue; }
          // 15.4.50 (A5) — pour la garantie expirante, le préavis de la RÈGLE définit la fenêtre.
          const windowDays = triggerType === 'warranty_expiring' ? Math.max(1, Number(config.overdueDays ?? 14)) : 1;
          const contexts = await evaluateTrigger(organizationId, triggerType, windowDays);
          for (const context of contexts) {
            // Une règle ne s'exécute que si son propre filtre de conditions passe (seuil explicite).
            if (triggerType === 'stock_below_threshold' && config.threshold != null) {
              const available = Number(context.vars?.available ?? 0);
              if (!(available < config.threshold)) continue;
            }
            try {
              const result = await runRuleWithOwnTransaction(organizationId, rule, context, config);
              if (result.status === 'executed') executed++; else if (result.status === 'duplicate') duplicates++;
            } catch (e: any) {
              log?.warn?.({ err: String(e?.message || e), ruleId: rule.id, org: organizationId }, 'workflow rule run failed');
            }
          }
        }
      });
    } catch (e: any) {
      log?.warn?.({ err: String(e?.message || e), org: organizationId }, 'workflow sweep org failed');
    }
  }
  return { organizations: orgs.length, executed, duplicates };
}

/** Run isolé dans sa propre transaction (le balayage reste robuste à un échec unitaire). */
async function runRuleWithOwnTransaction(
  organizationId: string,
  rule: any,
  context: TriggerContext,
  config: RuleConfig,
): Promise<{ runId: string; status: 'simulated' | 'executed' | 'duplicate'; actions: unknown[] }> {
  const client = await db.connect();
  try {
    await beginTenant(client);
    const result = await runRule(client as unknown as SqlExecutor, organizationId, {
      id: String(rule.id), name: String(rule.name), triggerType: rule.trigger_type as TriggerType, config, version: Number(rule.version || 1),
    }, context);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => { });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 15.4.50 (A5) — Simulation à blanc : compte les déclenchements QUE LA RÈGLE aurait produits
 * sur une fenêtre historique (défaut 90 jours) SANS rien écrire (aucun run, aucune action).
 * Les samples sont limités et textuels — ils s'affichent avant activation de la règle.
 */
export async function simulateRuleWindow(
  organizationId: string,
  rule: { triggerType: TriggerType; config: RuleConfig },
  windowDays = 90,
): Promise<{ wouldTrigger: number; windowDays: number; samples: Array<{ label: string; detail?: string }> }> {
  const contexts = await evaluateTrigger(organizationId, rule.triggerType, Math.max(1, Math.min(365, Math.round(windowDays))));
  const filtered = contexts.filter(context => {
    if (rule.triggerType === 'stock_below_threshold' && rule.config.threshold != null) {
      return Number(context.vars?.available ?? 0) < rule.config.threshold;
    }
    return true;
  });
  return {
    wouldTrigger: filtered.length,
    windowDays: Math.max(1, Math.min(365, Math.round(windowDays))),
    samples: filtered.slice(0, 10).map(c => ({ label: c.label, detail: c.detail })),
  };
}
