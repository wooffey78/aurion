// Bloc 10 — Calendrier fiscal et alertes de seuils (micro-entrepreneur).
//
// Règles du prompt : donner à l'entrepreneur les échéances et les seuils qui comptent,
// SANS conseil fiscal et SANS décision automatique. Une alerte n'entraîne JAMAIS un
// blocage ni une modification de facturation. Messages factuels renvoyant vers l'URSSAF,
// le portail autoentrepreneur ou l'expert-comptable. Aucun e-mail de rappel sans
// consentement explicite (ce module n'envoie aucun e-mail : affichage seul).
//
// Sources (vérifiées le 14 novembre 2026) :
//  - Seuils micro 2026 : economie.gouv.fr « que se passe-t-il quand le seuil est dépassé » :
//    203 100 € vente de marchandises · 83 600 € prestations de services / hébergement ;
//    activité mixte : global ≤ 203 100 € dont services ≤ 83 600 €.
//  - Franchise en base de TVA 2026 (impots.gouv / entreprendre.service-public.gouv.fr) :
//    seuil de base 85 000 € (ventes) / 37 500 € (services), seuils majorés 93 500 € / 41 250 €.
//  - Déclarations URSSAF : périodicité mensuelle ou trimestrielle déclarée (bloc 9) ;
//    la déclaration ET le paiement interviennent au plus tard à la fin du mois suivant la
//    période (convention URSSAF) ; une échéance tombant un week-end ou jour férié est
//    reportée au prochain jour ouvré.
import { query } from '../db.js';

export interface ThresholdRef { version: string; verifiedOn: string; source: string; sale: number; services: number; vatSaleBase: number; vatServicesBase: number; vatSaleMajorated: number; vatServicesMajorated: number }

export const THRESHOLDS_2026: ThresholdRef = {
  version: '2026',
  verifiedOn: '2026-11-14',
  source: 'economie.gouv.fr (seuils micro 2026) · entreprendre.service-public.gouv.fr / impots.gouv.fr (franchise TVA)',
  sale: 203100,
  services: 83600,
  vatSaleBase: 85000,
  vatServicesBase: 37500,
  vatSaleMajorated: 93500,
  vatServicesMajorated: 41250,
};

/** Jours fériés France (jour de l'an, Pâques calculé, 1er/8 mai, Ascension, 14 juillet, 15 août, 1er/11 novembre, Noël). */
export function frenchPublicHolidays(year: number): Set<string> {
  // Dimanche de Pâques : algorithme de Gauss/Butcher (calendrier grégorien).
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(Date.UTC(year, month - 1, day));
  const mk = (dt: Date) => dt.toISOString().slice(0, 10);
  const plus = (dt: Date, days: number) => new Date(dt.getTime() + days * 86400000);
  return new Set([
    `${year}-01-01`, `${year}-05-01`, `${year}-05-08`, `${year}-07-14`, `${year}-08-15`,
    `${year}-11-01`, `${year}-11-11`, `${year}-12-25`,
    mk(easter), mk(plus(easter, 1)), mk(plus(easter, 39)), mk(plus(easter, 50)),
  ]);
}

/** Reporte au prochain jour ouvré (week-end et jours fériés métropolitains exclus). */
export function nextBusinessDay(dateISO: string): string {
  const holidays = frenchPublicHolidays(Number(dateISO.slice(0, 4)));
  const holidaysNext = frenchPublicHolidays(Number(dateISO.slice(0, 4)) + 1);
  for (const h of holidaysNext) holidays.add(h);
  let d = new Date(`${dateISO}T00:00:00Z`);
  for (let i = 0; i < 30; i++) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) return iso;
    d = new Date(d.getTime() + 86400000);
  }
  return dateISO;
}

export type Periodicity = 'mensuelle' | 'trimestrielle';

export interface FiscalDeadline {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  /** Déclaration ET paiement URSSAF (micro : la même échéance porte les deux). */
  dueDate: string;
  shifted: boolean;
  kind: 'urssaf_declaration_paiement';
}

/** Échéances URSSAF de l'année : périodes mensuelles ou trimestrielles selon la périodicité déclarée (bloc 9). */
export function urssafDeadlines(year: number, periodicity: Periodicity | null): FiscalDeadline[] {
  const periods: Array<[string, string]> = [];
  if (periodicity === 'trimestrielle') {
    for (let q = 0; q < 4; q++) {
      const start = new Date(Date.UTC(year, q * 3, 1));
      const end = new Date(Date.UTC(year, q * 3 + 3, 0));
      periods.push([start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]);
    }
  } else if (periodicity === 'mensuelle') {
    for (let m = 0; m < 12; m++) {
      const start = new Date(Date.UTC(year, m, 1));
      const end = new Date(Date.UTC(year, m + 1, 0));
      periods.push([start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]);
    }
  } else {
    // Périodicité non déclarée : une seule période indicative de l'année, sans date fiable.
    return [];
  }
  return periods.map(([start, end]) => {
    // Fin du mois suivant la période (UTC), puis report au jour ouvré si week-end/férié.
    const endMonth = Number(end.slice(5, 7)) - 1, endYear = Number(end.slice(0, 4));
    // Date.UTC(year, endMonth + 2, 0) = dernier jour du mois suivant la période.
    const due = new Date(Date.UTC(endYear, endMonth + 2, 0)).toISOString().slice(0, 10);
    const shifted = nextBusinessDay(due) !== due;
    const label = periodicity === 'trimestrielle'
      ? `Trimestre ${Math.floor(endMonth / 3) + (endYear - year) * 4 + 1} ${endYear}`
      : new Date(`${end}T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return { periodLabel: label, periodStart: start, periodEnd: end, dueDate: shifted ? nextBusinessDay(due) : due, shifted, kind: 'urssaf_declaration_paiement' as const };
  });
}

export type MicroCategoryForThreshold = 'vente' | 'services';

export interface ThresholdStatus {
  kind: MicroCategoryForThreshold | 'vat_sale' | 'vat_services';
  label: string;
  caHt: number;
  threshold: number;
  ratio: number;
  alertLevels: Array<{ level: number; percent: number; message: string }>;
  message: string;
}

const CONFIGURABLE_MARGINS = [0.8, 0.9, 1.0];

/**
 * Statuts de seuils pour le CA de l'année par nature d'activité + franchise TVA.
 * Marges configurables (par défaut 80 % / 90 % / 100 %) ; les alertes sont factuelles,
 * ne bloquent rien et renvoient vers l'URSSAF / le portail autoentrepreneur.
 */
export function thresholdStatuses(
  caByCategory: Array<{ kind: MicroCategoryForThreshold; caHt: number }>,
  year: number,
  margins: number[] = CONFIGURABLE_MARGINS,
  ref: ThresholdRef = THRESHOLDS_2026,
): ThresholdStatus[] {
  const levels = (margins.length ? margins : CONFIGURABLE_MARGINS).slice().sort((a, b) => a - b);
  const urssafUrl = 'https://www.autoentrepreneur.urssaf.fr';
  const rows: ThresholdStatus[] = [];
  for (const [kind, caHt, threshold, label,vatBase, vatMajorated, vatLabel] of [
    ['vente', caByCategory.find(c => c.kind === 'vente')?.caHt || 0, ref.sale, 'Vente de marchandises (BIC)', ref.vatSaleBase, ref.vatSaleMajorated, 'Franchise TVA · ventes'],
    ['services', caByCategory.find(c => c.kind === 'services')?.caHt || 0, ref.services, 'Prestations de services (BIC/BNC)', ref.vatServicesBase, ref.vatServicesMajorated, 'Franchise TVA · services'],
  ] as Array<[MicroCategoryForThreshold, number, number, string, number, number, string]>) {
    const ratio = threshold > 0 ? caHt / threshold : 0;
    const pct = Math.round(ratio * 1000) / 10;
    const alertLevels = levels.filter(l => ratio >= l).map(l => ({
      level: Math.round(l * 100),
      percent: Math.round(l * 100),
      message: `Seuil ${Math.round(l * 100)} % atteint (${Math.round(caHt)} € / ${threshold} €) pour ${label}. Aucun blocage : vérifiez les règles applicables sur le portail autoentrepreneur ou auprès de l'URSSAF.`,
    }));
    rows.push({
      kind, label, caHt: Math.round(caHt * 100) / 100, threshold, ratio: Math.round(ratio * 1000) / 1000, alertLevels,
      message: ratio >= 1
        ? `Seuil ${threshold} € atteint ou dépassé pour ${label} (${pct} %). Rapprochez-vous de l'URSSAF ou de votre expert-comptable pour connaître les conséquences exactes (sortie du régime, TVA…) — aucune modification automatique n'a été appliquée.`
        : ratio > 0
          ? `${pct} % du seuil ${threshold} € pour ${label} (référentiel ${ref.version}).`
          : `Aucun chiffre d'affaires ${label} enregistré en ${year}.`,
    });
    // Franchise TVA (seuils de base et majorés) — information, jamais de bascule automatique de facturation.
    const vatRatio = vatBase > 0 ? caHt / vatBase : 0;
    rows.push({
      kind: (kind === 'vente' ? 'vat_sale' : 'vat_services') as ThresholdStatus['kind'],
      label: vatLabel, caHt: Math.round(caHt * 100) / 100, threshold: vatBase, ratio: Math.round(vatRatio * 1000) / 1000,
      alertLevels: levels.filter(l => vatRatio >= l).map(l => ({
        level: Math.round(l * 100), percent: Math.round(l * 100),
        message: `Seuil TVA ${Math.round(l * 100)} % (${vatBase} € base / ${vatMajorated} € majoré) pour ${vatLabel}. Franchise en base : à vérifier sur impots.gouv.fr — aucune facture n'est modifiée automatiquement.`,
      })),
      message: vatRatio >= 1
        ? `Seuil de franchise TVA ${vatBase} € dépassé (seuil majoré ${vatMajorated} €) pour ${vatLabel}. Vérifiez votre situation sur impots.gouv.fr — aucune bascule automatique de TVA dans vos documents.`
        : `${Math.round(vatRatio * 1000) / 10} % du seuil TVA ${vatBase} € (majoré ${vatMajorated} €).`,
    });
  }
  return rows;
}

/** Alertes de seuil persistées au journal de bord (une seule par seuil : déduplication `dedupe_key`). */
export async function recordThresholdAlerts(orgId: string, year: number, statuses: ThresholdStatus[]) {
  for (const s of statuses) {
    for (const a of s.alertLevels) {
      const key = `fiscal-threshold-${year}-${s.kind}-${a.level}`;
      const exists = await query('select 1 from dashboard_journal_events where organization_id=$1 and dedupe_key=$2', [orgId, key]);
      if (exists.rowCount) continue;
      await query(
        `insert into dashboard_journal_events(organization_id,event_type,title,description,severity,source,dedupe_key,internal_path)
         values($1,'fiscal_threshold',$2,$3,'warning','fiscal_calendar',$4,'/accounting')
         on conflict (organization_id,dedupe_key) do nothing`,
        [orgId, `Seuil fiscal ${a.percent} % · ${s.label} (${year})`, a.message, key],
      );
    }
  }
}
