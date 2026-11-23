// 15.4.50 (suggestion A7) — Expansion déterministe des récurrences d'agenda et de contrats.
// Sous-ensemble RRULE documenté et testé : freq=weekly|monthly, interval (1..52), count
// (1..366), until (date ISO), bymonthday implicite (même jour du mois). Aucune bibliothèque
// externe, aucune IA : une boucle de dates explicite, honnête sur les limites (heure d'été :
// l'heure locale est conservée, la durée reste celle du modèle).
export interface RecurrenceRule {
  freq: 'weekly' | 'monthly';
  interval?: number;
  count?: number;
  until?: string;
}

export class RecurrenceError extends Error {
  constructor(public code: 'INVALID_RULE' | 'INVALID_INPUT', message: string) { super(message); }
}

/** Parse une règle depuis son stockage (jsonb agenda recurrence_rule). Fonction PURE. */
export function parseRecurrenceRule(raw: unknown): RecurrenceRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as any;
  if (r.freq !== 'weekly' && r.freq !== 'monthly') return null;
  const out: RecurrenceRule = { freq: r.freq };
  if (r.interval != null) {
    const i = Math.round(Number(r.interval));
    if (!Number.isFinite(i) || i < 1 || i > 52) throw new RecurrenceError('INVALID_RULE', 'interval doit être un entier entre 1 et 52.');
    out.interval = i;
  }
  if (r.count != null) {
    const c = Math.round(Number(r.count));
    if (!Number.isFinite(c) || c < 1 || c > 366) throw new RecurrenceError('INVALID_RULE', 'count doit être un entier entre 1 et 366 occurrences.');
    out.count = c;
  }
  if (r.until != null) {
    const u = String(r.until);
    if (!/^\d{4}-\d{2}-\d{2}/.test(u)) throw new RecurrenceError('INVALID_RULE', 'until doit être une date ISO (AAAA-MM-JJ).');
    out.until = u.slice(0, 10);
  }
  if (out.count == null && !out.until) out.count = 26; // borne par défaut documentée (6 mois hebdo)
  return out;
}

/**
 * Développe les occurrences d'un événement récurrent dans une fenêtre [windowStart, windowEnd)
 * (ISO, inclusif/exclusif). `startIso` = premier événement (base). Fonction PURE — testée
 * sans base : la fenêtre borne le rendu, la règle borne l'étendue, jamais l'inverse.
 */
export function expandRecurrence(
  rule: RecurrenceRule,
  startIso: string,
  windowStartIso: string,
  windowEndIso: string,
): string[] {
  const base = new Date(startIso);
  if (Number.isNaN(base.getTime())) throw new RecurrenceError('INVALID_INPUT', 'Premier événement invalide.');
  const windowStart = new Date(windowStartIso);
  const windowEnd = new Date(windowEndIso);
  if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime()) || windowEnd <= windowStart) {
    throw new RecurrenceError('INVALID_INPUT', 'Fenêtre d expansion invalide (fin <= début).');
  }
  const stepMs = rule.freq === 'weekly' ? 7 * 86400000 : 0;
  const interval = rule.interval ?? 1;
  const out: string[] = [];
  let occurrence = 0;
  let cursor = new Date(base);
  const hardEnd = rule.until ? new Date(`${rule.until}T23:59:59`) : null;
  while (occurrence < (rule.count ?? 366)) {
    if (hardEnd && cursor > hardEnd) break;
    if (cursor >= windowEnd) break;
    if (cursor >= windowStart) out.push(cursor.toISOString());
    occurrence++;
    if (rule.freq === 'weekly') {
      cursor = new Date(cursor.getTime() + stepMs * interval);
    } else {
      const d = new Date(cursor);
      d.setMonth(d.getMonth() + interval);
      cursor = d;
    }
  }
  return out;
}
