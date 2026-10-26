import { query } from '../db.js';
import { companyDisplayName } from './company.js';

export interface SignatureFields { enabled: boolean; firstName?: string; lastName?: string; jobTitle?: string; company?: string; phone?: string; website?: string; address?: string; extra?: string }
const clean = (s: unknown) => String(s ?? '').replace(/[\r\t]+/g, ' ').trim();

export async function loadSignature(orgId: string): Promise<SignatureFields | null> {
  const r = (await query(`select es.*,o.name org_name,o.website org_website,trim(concat_ws(' · ',nullif(o.address,''),nullif(trim(concat_ws(' ',o.postal_code,o.city)),''))) org_address from organizations o left join email_signatures es on es.organization_id=o.id where o.id=$1`, [orgId])).rows[0];
  if (!r) return null;
  return { enabled: r.enabled ?? true, firstName: r.first_name, lastName: r.last_name, jobTitle: r.job_title, company: r.company || r.org_name, phone: r.phone, website: r.website || r.org_website, address: r.address || r.org_address, extra: r.extra };
}
export async function saveSignature(orgId: string, f: SignatureFields) {
  await query(`insert into email_signatures(organization_id,enabled,first_name,last_name,job_title,company,phone,website,address,extra)
    values($1,$2,nullif($3,''),nullif($4,''),nullif($5,''),nullif($6,''),nullif($7,''),nullif($8,''),nullif($9,''),nullif($10,''))
    on conflict(organization_id) do update set enabled=excluded.enabled,first_name=excluded.first_name,last_name=excluded.last_name,job_title=excluded.job_title,company=excluded.company,phone=excluded.phone,website=excluded.website,address=excluded.address,extra=excluded.extra,updated_at=now()`,
    [orgId, f.enabled !== false, clean(f.firstName), clean(f.lastName), clean(f.jobTitle), clean(f.company), clean(f.phone), clean(f.website), clean(f.address), clean(f.extra)]);
}

/** Bloc de signature en texte : uniquement les lignes renseignées (jamais de libellé ni de ligne vide). */
export function renderSignature(f: SignatureFields | null, fallbackCompany: string) {
  const name = [clean(f?.firstName), clean(f?.lastName)].filter(Boolean).join(' ');
  const company = clean(f?.company) || fallbackCompany;
  const lines = f && f.enabled === false ? [company] : [name, clean(f?.jobTitle), company, clean(f?.phone), clean(f?.website), clean(f?.address), ...clean(f?.extra).split(/\n/).map(clean)].filter(Boolean);
  return `\n\nCordialement,\n${[...new Set(lines.length ? lines : [company])].join('\n')}`;
}
export async function signatureFor(orgId: string, activityId?: string | null) {
  return renderSignature(await loadSignature(orgId), await companyDisplayName(orgId, activityId));
}
