import { query } from '../db.js';

const PLACEHOLDER_NAMES = ['', 'nouvelle entreprise', 'à configurer', 'a configurer'];

/**
 * Nom d'entreprise à afficher (signatures d'e-mails, documents) :
 * le nom saisi dans Paramètres ; tant qu'il n'est pas renseigné, le nom de l'activité ; à défaut « Aurion ».
 */
export async function companyDisplayName(orgId: string, activityId?: string | null) {
  const o = (await query('select name from organizations where id=$1', [orgId])).rows[0];
  const name = String(o?.name || '').trim();
  if (name && !PLACEHOLDER_NAMES.includes(name.toLowerCase())) return name;
  const a = activityId
    ? await query('select name from activities where id=$1 and organization_id=$2', [activityId, orgId])
    : await query('select name from activities where organization_id=$1 and active=true order by created_at limit 1', [orgId]);
  const an = String(a.rows[0]?.name || '').trim();
  if (an && an.toLowerCase() !== 'activité principale') return an;
  return name || 'Aurion';
}

export const signatureText = (company: string) => `\n\nCordialement,\n${company}`;
