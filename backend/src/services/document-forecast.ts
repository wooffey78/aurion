import { query } from '../db.js';

export interface DocumentForecastEntries {
  quotesTtc: number;
  savTtc: number;
  entries: number;
}

/**
 * Entrées prévisionnelles documentaires : devis SIGNÉS TTC (acceptés par le client),
 * diminués des SAV financiers (montants négatifs).
 * 15.4.66 (consigne éditeur) : un devis non signé n'est PAS pris en compte dans les
 * calculs — son montant n'intègre « Entrées prévues » qu'au moment de la signature
 * (statut 'accepted', horodaté accepted_at). Accueil et trésorerie doivent réutiliser
 * exactement cette fonction pour éviter deux bases de calcul différentes.
 */
export async function documentForecastEntries(organizationId: string, activityId: string): Promise<DocumentForecastEntries> {
  const row = (await query(`select
      (select coalesce(sum(total_ttc),0)::numeric from quotes
        where organization_id=$1 and activity_id=$2 and document_type='quote'
          and lower(coalesce(status,''))='accepted' and accepted_at is not null
          and lower(coalesce(status,'')) not in ('canceled','cancelled','annulé','annule','rejected','refused','expired','void','deleted')) as quotes_ttc,
      (select coalesce(sum(amount_ttc),0)::numeric from sav_cases
        where organization_id=$1 and activity_id=$2 and sav_type='financial') as sav_ttc`, [organizationId, activityId])).rows[0] || {};
  const quotesTtc = Number(row.quotes_ttc || 0);
  const savTtc = Number(row.sav_ttc || 0);
  return { quotesTtc, savTtc, entries: quotesTtc + savTtc };
}
