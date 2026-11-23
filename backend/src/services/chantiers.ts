// 15.4.50 (suggestion B1) — Chantiers : regroupement d'ouvrage et rentabilité RÉELLE.
// Le chantier n'est pas une source de vérité : il référence des objets propriétaires
// (devis, rendez-vous, temps, SAV, frais, documents) par chantier_links (migration 110).
// La rentabilité agrège les montants RÉELS enregistrés par les modules — jamais un montant
// inventé : temps valorisé au taux horaire paramétré (0 par défaut = « temps non valorisé »,
// affiché honnêtement), frais réels, coûts SAV réels, facturation réelle.
import { query } from '../db.js';
import { emitOrgEvent } from './events.js';
import type { SqlExecutor } from './sql-executor.js';

export type ChantierLinkType = 'quote' | 'appointment' | 'intervention' | 'sav_case' | 'time_session' | 'expense' | 'document';

export interface ProfitabilityInput {
  /** Devis accepté du chantier : total HT et TTC (0 si aucun devis). */
  quoteTotalHt: number;
  quoteTotalTtc: number;
  /** Factures liées : totals réels. */
  invoicedTotalHt: number;
  invoicedTotalTtc: number;
  /** Encaissements réellement reçus sur les factures liées (0 si aucun règlement). */
  collectedTtc?: number;
  /** Coûts réels enregistrés. */
  expensesTotalTtc: number;
  savTotalTtc: number;
  /** Temps passé : minutes totales et taux horaire HT choisi par l'entreprise (centimes). */
  totalMinutes: number;
  hourlyRateCents: number;
  /** TVA moyenne appliquée pour convertir le TTC facturé en HT estimé (défaut 20 %). */
  vatRateBps: number;
}

export interface ProfitabilityResult {
  revenueHt: number;
  revenueTtc: number;
  costsTtc: number;
  laborCostTtc: number;
  marginTtc: number;
  marginPct: number | null;
  driftVsQuotePct: number | null;
  alertLevel: 'none' | 'watch' | 'drift';
  reasons: string[];
  /** 15.4.52 — lecture de gestion honnête : reste à facturer sur le devis accepté (null sans devis). */
  restToInvoiceTtc: number | null;
  /** Budget restant avant dérive = devis accepté − coûts réels (négatif = dépassement, null sans devis). */
  remainingBudgetTtc: number | null;
  /** Encaissé réel sur les factures liées et taux de recouvrement (null sans facture). */
  collectedTtc: number;
  collectionPct: number | null;
  /** Main-d'œuvre réellement valorisée (taux horaire > 0 et du temps enregistré). */
  laborValued: boolean;
}

const r2 = (n: number) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

/**
 * Calcule la rentabilité réelle d'un chantier. Fonction PURE — testée sans base.
 * Alerte de dérive : comparaison coûts réels vs devis accepté — > 80 % de consommation du
 * devis = à surveiller, > 100 % = dérive (avant facturation, jamais après coup seulement).
 */
export function computeChantierProfitability(input: ProfitabilityInput): ProfitabilityResult {
  const vat = input.vatRateBps > 0 && input.vatRateBps < 100000 ? input.vatRateBps : 2000;
  const laborCostTtc = r2(input.totalMinutes / 60 * (input.hourlyRateCents / 100) * (1 + vat / 10000));
  const costsTtc = r2(input.expensesTotalTtc + input.savTotalTtc + laborCostTtc);
  const revenueTtc = r2(Math.max(input.invoicedTotalTtc, 0));
  const revenueHt = r2(revenueTtc > 0 ? revenueTtc / (1 + vat / 10000) : 0);
  const marginTtc = r2(revenueTtc - costsTtc);
  const marginPct = revenueTtc > 0 ? Math.round(marginTtc / revenueTtc * 1000) / 10 : null;
  const driftVsQuotePct = input.quoteTotalTtc > 0 ? Math.round((costsTtc / input.quoteTotalTtc) * 1000) / 10 : null;
  // 15.4.52 — indicateurs de gestion : reste à facturer, budget restant, encaissement.
  const restToInvoiceTtc = input.quoteTotalTtc > 0 ? r2(Math.max(input.quoteTotalTtc - input.invoicedTotalTtc, 0)) : null;
  const remainingBudgetTtc = input.quoteTotalTtc > 0 ? r2(input.quoteTotalTtc - costsTtc) : null;
  const collectedTtc = r2(Math.max(Number(input.collectedTtc || 0), 0));
  const collectionPct = revenueTtc > 0 ? Math.round(collectedTtc / revenueTtc * 1000) / 10 : null;
  const laborValued = input.hourlyRateCents > 0 && input.totalMinutes > 0;
  const reasons: string[] = [];
  let alertLevel: 'none' | 'watch' | 'drift' = 'none';
  if (driftVsQuotePct != null) {
    if (driftVsQuotePct > 100) { alertLevel = 'drift'; reasons.push(`Coûts réels (${costsTtc.toFixed(2)} € TTC) dépassent le devis accepté (${input.quoteTotalTtc.toFixed(2)} € TTC) : ${driftVsQuotePct} %. Vérifier avant toute facturation complémentaire.`); }
    else if (driftVsQuotePct > 80) { alertLevel = 'watch'; reasons.push(`Coûts réels à ${driftVsQuotePct} % du devis accepté : surveiller la fin d'ouvrage.`); }
    else reasons.push(`Coûts réels à ${driftVsQuotePct} % du devis accepté.`);
  } else if (input.quoteTotalTtc === 0 && costsTtc > 0) {
    reasons.push('Aucun devis accepté rattaché : la dérive ne peut pas être calculée — rattacher le devis du chantier.');
  }
  if (restToInvoiceTtc != null && restToInvoiceTtc > 0 && input.invoicedTotalTtc > 0) reasons.push(`Reste à facturer : ${restToInvoiceTtc.toFixed(2)} € TTC sur le devis accepté.`);
  if (collectionPct != null && collectionPct < 100) reasons.push(`Encaissé à ${collectionPct} % du facturé (${collectedTtc.toFixed(2)} € TTC sur ${revenueTtc.toFixed(2)} € TTC).`);
  if (input.totalMinutes > 0 && input.hourlyRateCents === 0) reasons.push(`${input.totalMinutes} minute(s) de temps enregistrée(s) NON valorisée(s) : renseigner un taux horaire pour intégrer la main-d'œuvre.`);
  if (marginPct != null && marginPct < 0) reasons.push(`Marge négative : ${marginTtc.toFixed(2)} € TTC sur le chantier.`);
  return { revenueHt, revenueTtc, costsTtc, laborCostTtc, marginTtc, marginPct, driftVsQuotePct, alertLevel, reasons, restToInvoiceTtc, remainingBudgetTtc, collectedTtc, collectionPct, laborValued };
}

type Executor = SqlExecutor | { query: (text: string, values?: unknown[]) => Promise<any> };

/** Agrège les objets liés d'un chantier depuis leurs sources de vérité (wrapper base). */
export async function chantierProfitability(exec: Executor, organizationId: string, chantierId: string, hourlyRateCents = 0, vatRateBps = 2000): Promise<ProfitabilityResult & { chantier: any; links: any[] }> {
  const chantier = (await exec.query(
    `select c.id,c.name,c.status,c.client_id as "clientId",cl.name as "clientName",c.location,
            (select q.total_ht from quotes q join chantier_links l on l.organization_id=q.organization_id and l.object_type='quote' and l.object_id=q.id
              where l.chantier_id=c.id and l.organization_id=$1 and q.document_type='quote' and q.status='accepted' order by q.accepted_at desc limit 1) as "quoteTotalHt",
            (select q.total_ttc from quotes q join chantier_links l on l.organization_id=q.organization_id and l.object_type='quote' and l.object_id=q.id
              where l.chantier_id=c.id and l.organization_id=$1 and q.document_type='quote' and q.status='accepted' order by q.accepted_at desc limit 1) as "quoteTotalTtc",
            (select coalesce(sum(q.total_ttc),0) from quotes q join chantier_links l on l.organization_id=q.organization_id and l.object_type='quote' and l.object_id=q.id
              where l.chantier_id=c.id and l.organization_id=$1 and q.document_type='invoice') as "invoicedTotalTtc",
            (select coalesce(sum(q.total_ht),0) from quotes q join chantier_links l on l.organization_id=q.organization_id and l.object_type='quote' and l.object_id=q.id
              where l.chantier_id=c.id and l.organization_id=$1 and q.document_type='invoice') as "invoicedTotalHt",
            (select coalesce(sum(s.amount_ttc),0) from sav_cases s join chantier_links l on l.organization_id=s.organization_id and l.object_type='sav_case' and l.object_id=s.id
              where l.chantier_id=c.id and l.organization_id=$1) as "savTotalTtc",
            (select coalesce(sum(e.amount_ttc),0) from expense_reports e join chantier_links l on l.organization_id=e.organization_id and l.object_type='expense' and l.object_id=e.id
              where l.chantier_id=c.id and l.organization_id=$1) as "expensesTotalTtc",
            (select coalesce(sum(p.amount),0) from invoice_payments p
              join quotes q2 on q2.id=p.quote_id and q2.organization_id=p.organization_id and q2.document_type='invoice'
              join chantier_links l on l.organization_id=q2.organization_id and l.object_type='quote' and l.object_id=q2.id
              where l.chantier_id=c.id and l.organization_id=$1) as "collectedTtc",
            (select coalesce(sum(coalesce(t.duration_seconds, t.manual_minutes*60)),0)/60 from client_time_sessions t join chantier_links l on l.organization_id=t.organization_id and l.object_type='time_session' and l.object_id=t.id
              where l.chantier_id=c.id and l.organization_id=$1) as "totalMinutes"
     from chantiers c left join clients cl on cl.id=c.client_id
     where c.id=$2 and c.organization_id=$1`,
    [organizationId, chantierId],
  )).rows[0];
  if (!chantier) throw new Error('CHANTIER_NOT_FOUND');
  const links = (await exec.query(
    `select object_type as "objectType", object_id as "objectId", created_at as "createdAt" from chantier_links where chantier_id=$2 and organization_id=$1 order by created_at desc`,
    [organizationId, chantierId],
  )).rows;
  const result = computeChantierProfitability({
    quoteTotalHt: Number(chantier.quoteTotalHt || 0),
    quoteTotalTtc: Number(chantier.quoteTotalTtc || 0),
    invoicedTotalHt: Number(chantier.invoicedTotalHt || 0),
    invoicedTotalTtc: Number(chantier.invoicedTotalTtc || 0),
    collectedTtc: Number(chantier.collectedTtc || 0),
    expensesTotalTtc: Number(chantier.expensesTotalTtc || 0),
    savTotalTtc: Number(chantier.savTotalTtc || 0),
    totalMinutes: Math.round(Number(chantier.totalMinutes || 0)),
    hourlyRateCents,
    vatRateBps,
  });
  // Alerte de dérive → journal de bord (idempotente par chantier), résolue si la dérive disparaît.
  if (result.alertLevel === 'drift') {
    await emitOrgEvent(organizationId, {
      type: 'chantier_drift',
      title: `Chantier en dérive : ${chantier.name}`,
      description: result.reasons.join(' '),
      severity: 'error',
      source: 'chantiers',
      internalPath: '/chantiers',
      dedupeKey: `chantier-drift:${chantierId}`,
    });
  } else {
    const { resolveOrgEvent } = await import('./events.js');
    await resolveOrgEvent(organizationId, `chantier-drift:${chantierId}`);
  }
  return { ...result, chantier, links };
}

/** Crée un chantier (validation explicite, journal d'événement). */
export async function createChantier(organizationId: string, input: { name: string; clientId?: string | null; activityId?: string | null; location?: string | null; quoteAmountCents?: number | null; notes?: string; createdBy?: string | null }): Promise<{ id: string }> {
  const name = String(input.name || '').trim().slice(0, 200);
  if (!name) throw new Error('CHANTIER_NAME_REQUIRED');
  const row = (await query(
    `insert into chantiers(organization_id,activity_id,client_id,name,location,quote_amount_cents,notes,created_by)
     values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [organizationId, input.activityId ?? null, input.clientId ?? null, name, input.location ?? null, input.quoteAmountCents ?? null, input.notes ?? '', input.createdBy ?? null],
  )).rows[0];
  await emitOrgEvent(organizationId, {
    type: 'chantier_created', title: `Chantier créé : ${name}`,
    description: 'Regroupez devis, rendez-vous, temps, SAV et factures de cet ouvrage pour suivre sa rentabilité réelle.',
    severity: 'action', source: 'chantiers', internalPath: '/chantiers', dedupeKey: `chantier-created:${row.id}`,
  });
  return { id: String(row.id) };
}

/** Lie un objet propriétaire au chantier (l'objet reste la source de vérité de son module). */
export async function linkObject(organizationId: string, chantierId: string, objectType: ChantierLinkType, objectId: string, linkedBy?: string | null): Promise<{ linked: boolean }> {
  const x = await query(
    `insert into chantier_links(organization_id,chantier_id,object_type,object_id,linked_by)
     values($1,$2,$3,$4,$5) on conflict (organization_id,chantier_id,object_type,object_id) do nothing`,
    [organizationId, chantierId, objectType, objectId, linkedBy ?? null],
  );
  return { linked: Boolean(x.rowCount) };
}

/** Liste les chantiers avec indicateurs rapides (dérive connue en base pour le badge). Filtre de statut optionnel (15.4.52). */
export async function listChantiers(organizationId: string, activityId: string | null, status: string | null = null): Promise<any[]> {
  return (await query(
    `select c.id,c.name,c.status,c.location,c.client_id as "clientId",cl.name as "clientName",c.created_at as "createdAt",
            (select count(*)::int from chantier_links l where l.chantier_id=c.id and l.organization_id=c.organization_id) as "linkCount",
            (select q.total_ttc from quotes q join chantier_links l on l.organization_id=q.organization_id and l.object_type='quote' and l.object_id=q.id
              where l.chantier_id=c.id and l.organization_id=c.organization_id and q.document_type='quote' and q.status='accepted' order by q.accepted_at desc limit 1) as "quoteTotalTtc",
            (select coalesce(sum(q.total_ttc),0) from quotes q join chantier_links l on l.organization_id=q.organization_id and l.object_type='quote' and l.object_id=q.id
              where l.chantier_id=c.id and l.organization_id=c.organization_id and q.document_type='invoice') as "invoicedTotalTtc"
     from chantiers c left join clients cl on cl.id=c.client_id
     where c.organization_id=$1 and ($2::uuid is null or c.activity_id=$2::uuid) and ($3::text is null or c.status=$3::text)
     order by c.created_at desc limit 200`,
    [organizationId, activityId, status],
  )).rows;
}

// 15.4.52 — Cycle de vie du chantier : transitions explicites et fermées. Le chantier référence
// des objets propriétaires : il ne se supprime jamais, il s'archive. Réouverture possible pour
// corriger une clôture trop tôt (completed→active, archived→active) — chaque transition est
// journalisée pour que le tableau de bord raconte l'histoire réelle de l'ouvrage.
export const CHANTIER_TRANSITIONS: Array<{ from: 'active' | 'completed' | 'archived'; to: 'active' | 'completed' | 'archived' }> = [
  { from: 'active', to: 'completed' },
  { from: 'completed', to: 'archived' },
  { from: 'completed', to: 'active' },
  { from: 'archived', to: 'active' },
];

const CHANTIER_EVENT_BY_STATUS: Record<string, { type: string; title: string; description: string; severity: 'success' | 'info' }> = {
  completed: { type: 'chantier_completed', title: 'Chantier terminé', description: 'Ouvrage clôturé : vérifiez que tout le réalisé est bien facturé et encaissé depuis l\u2019écran Chantiers.', severity: 'success' },
  active: { type: 'chantier_reopened', title: 'Chantier rouvert', description: 'Le chantier est de nouveau actif : les alertes de dérive reprennent leur suivi.', severity: 'info' },
  archived: { type: 'chantier_archived', title: 'Chantier archivé', description: 'Le chantier est archivé : il reste consultable et ses documents ne changent pas.', severity: 'info' },
};

/** Met à jour statut et champs éditables d'un chantier avec transitions validées (renvoie null si introuvable). */
export async function updateChantierStatus(
  organizationId: string,
  chantierId: string,
  patch: { status?: 'active' | 'completed' | 'archived'; name?: string; location?: string | null; notes?: string | null },
  updatedBy?: string | null,
): Promise<any | null> {
  const current = (await query(
    `select id,name,status,location,notes from chantiers where id=$1 and organization_id=$2`,
    [chantierId, organizationId],
  )).rows[0];
  if (!current) return null;
  if (patch.status && patch.status !== current.status) {
    const allowed = CHANTIER_TRANSITIONS.some(t => t.from === current.status && t.to === patch.status);
    if (!allowed) throw new Error(`CHANTIER_TRANSITION_INVALID:${current.status}->${patch.status}`);
  }
  const nextStatus = patch.status ?? current.status;
  const name = patch.name !== undefined ? String(patch.name).trim().slice(0, 200) || current.name : current.name;
  const location = patch.location !== undefined ? patch.location : current.location;
  const notes = patch.notes !== undefined ? String(patch.notes ?? '') : current.notes;
  const row = (await query(
    `update chantiers set status=$3,name=$4,location=$5,notes=$6,updated_at=now()
     where id=$1 and organization_id=$2
     returning id,name,status,location,notes,updated_at as "updatedAt"`,
    [chantierId, organizationId, nextStatus, name, location, notes],
  )).rows[0];
  const statusChanged = nextStatus !== current.status;
  if (statusChanged) {
    const ev = CHANTIER_EVENT_BY_STATUS[nextStatus];
    if (ev) {
      await emitOrgEvent(organizationId, {
        type: ev.type, title: `${ev.title} : ${name}`, description: ev.description,
        severity: ev.severity, source: 'chantiers', internalPath: '/chantiers', dedupeKey: `chantier-status:${chantierId}:${nextStatus}`,
      });
    }
    // La dérive éventuelle est réévaluée à la prochaine consultation de la rentabilité :
    // on ne crée ici AUCUN événement de dérive (rien ne dit qu'il y en a une).
  }
  void updatedBy;
  return row;
}
