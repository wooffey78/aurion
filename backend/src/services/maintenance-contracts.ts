// 15.4.50 (suggestion B2) — Contrats d'entretien : génération DÉTERMINISTE des occurrences.
// Le contrat décrit la récurrence convenue ; les occurrences sont des RENDEZ-VOUS réels de
// l'agenda unifié (108, collisions détectées, dérogations auditées) et la facturation suit
// le cycle commercial existant. Rien n'est créé automatiquement : la génération PROPOSE des
// rendez-vous que l'entrepreneur valide (règle prompt 13 — jamais d'action fermée sans
// validation humaine). La recommandation d'un contrat est gated par le profil métier
// (profile-features.ts : chauffage/plomberie/climatisation/informatique...).
import { query } from '../db.js';
import { emitOrgEvent } from './events.js';
import type { SqlExecutor } from './sql-executor.js';

export type ContractFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';

/** Pas en mois de chaque fréquence (documenté, testé). */
export const FREQUENCY_MONTHS: Record<ContractFrequency, number> = {
  monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12,
};

export interface ContractSpec {
  frequency: ContractFrequency;
  weekday: number;            // 0=dim … 6=sam (convention JS)
  firstOccurrence: string;    // ISO date AAAA-MM-JJ
  durationMinutes: number;
  preferredTime?: string | null; // HH:MM (optionnel)
}

export interface ContractOccurrence {
  /** Date ISO AAAA-MM-JJ de l'occurrence proposée. */
  date: string;
  startsAt: string;
  endsAt: string;
  index: number;
}

const WEEKDAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Génère les occurrences planifiées d'un contrat dans une fenêtre [from,to) de DATES ISO.
 * Fonction PURE — testée sans base : avancement mensuel déterministe, report au weekday
 * demandé (jamais en arrière), borné par la fenêtre et par 36 mois maximum.
 */
export function generateContractOccurrences(spec: ContractSpec, windowFrom: string, windowTo: string): ContractOccurrence[] {
  const months = FREQUENCY_MONTHS[spec.frequency];
  if (!(months >= 1) || !(spec.weekday >= 0 && spec.weekday <= 6)) throw new Error('CONTRACT_SPEC_INVALID');
  const base = new Date(`${spec.firstOccurrence}T12:00:00`);
  const from = new Date(`${windowFrom}T00:00:00`);
  const to = new Date(`${windowTo}T00:00:00`);
  if (Number.isNaN(base.getTime()) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    throw new Error('CONTRACT_WINDOW_INVALID');
  }
  const out: ContractOccurrence[] = [];
  let cursor = new Date(base);
  let index = 0;
  while (index < 36 && cursor < to) {
    if (cursor >= from) {
      // Report déterministe au jour de semaine demandé (jamais en arrière).
      const d = new Date(cursor);
      while (d.getDay() !== spec.weekday) d.setDate(d.getDate() + 1);
      const dateIso = d.toISOString().slice(0, 10);
      if (d < to) {
        const time = /^\d{2}:\d{2}$/.test(String(spec.preferredTime || '')) ? String(spec.preferredTime) : '09:00';
        const start = new Date(`${dateIso}T${time}:00`);
        const end = new Date(start.getTime() + Math.max(15, spec.durationMinutes) * 60000);
        out.push({ date: dateIso, startsAt: start.toISOString(), endsAt: end.toISOString(), index });
      }
    }
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + months);
    cursor = next;
    index++;
  }
  return out;
}

/** Libellé lisible du contrat (utilisé par les rendez-vous et le journal). */
export function contractLabel(name: string, frequency: ContractFrequency): string {
  const freqLabels: Record<ContractFrequency, string> = {
    monthly: 'mensuel', bimonthly: 'bimestriel', quarterly: 'trimestriel', semiannual: 'semestriel', annual: 'annuel',
  };
  return `${name} (entretien ${freqLabels[frequency]})`;
}

/** Crée un contrat d'entretien. */
export async function createContract(organizationId: string, input: ContractSpec & { name: string; clientId: string; activityId?: string | null; agreedAmountCents?: number | null; notes?: string; createdBy?: string | null }): Promise<{ id: string }> {
  const name = String(input.name || '').trim().slice(0, 200);
  if (!name || !input.clientId) throw new Error('CONTRACT_INPUT_REQUIRED');
  const row = (await query(
    `insert into maintenance_contracts(organization_id,activity_id,client_id,name,frequency,weekday,preferred_time,duration_minutes,agreed_amount_cents,first_occurrence,notes,created_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12) returning id`,
    [organizationId, input.activityId ?? null, input.clientId, name, input.frequency, input.weekday, input.preferredTime ?? null, Math.max(15, input.durationMinutes), input.agreedAmountCents ?? null, input.firstOccurrence, input.notes ?? '', input.createdBy ?? null],
  )).rows[0];
  await emitOrgEvent(organizationId, {
    type: 'maintenance_contract_created',
    title: `Contrat d'entretien créé : ${name}`,
    description: `Récurrence ${contractLabel(name, input.frequency)}. Les rendez-vous sont proposés à la planification — jamais créés automatiquement.`,
    severity: 'action', source: 'maintenance', internalPath: '/agenda', dedupeKey: `contract-created:${row.id}`,
  });
  return { id: String(row.id) };
}

/**
 * Génère les rendez-vous à VALIDER pour un contrat sur la fenêtre. Les rendez-vous réels ne
 * sont écrits QUE par la validation humaine (route agenda) — ici on renvoie les propositions
 * avec les conflits d'agenda éventuels détectés (même règle que 108).
 */
export async function proposeContractSchedule(exec: SqlExecutor, organizationId: string, contractId: string, windowFrom: string, windowTo: string): Promise<{ contract: any; proposals: Array<ContractOccurrence & { conflict: boolean }> }> {
  const c = (await exec.query(
    `select id,name,client_id as "clientId",frequency,weekday,preferred_time as "preferredTime",duration_minutes as "durationMinutes",first_occurrence as "firstOccurrence",status,agreed_amount_cents as "agreedAmountCents"
     from maintenance_contracts where id=$2 and organization_id=$1`,
    [organizationId, contractId],
  )).rows[0];
  if (!c) throw new Error('CONTRACT_NOT_FOUND');
  const spec: ContractSpec = { frequency: c.frequency, weekday: Number(c.weekday), firstOccurrence: new Date(c.firstOccurrence).toISOString().slice(0, 10), durationMinutes: Number(c.durationMinutes || 120), preferredTime: c.preferredTime };
  const occurrences = generateContractOccurrences(spec, windowFrom, windowTo);
  const proposals = [];
  for (const o of occurrences) {
    const conflict = (await exec.query(
      `select 1 from appointments where organization_id=$1 and starts_at < $3 and ends_at > $2 limit 1`,
      [organizationId, o.startsAt, o.endsAt],
    )).rowCount ?? 0;
    proposals.push({ ...o, conflict: conflict > 0 });
  }
  return { contract: c, proposals };
}
