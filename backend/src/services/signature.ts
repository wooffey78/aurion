import { query } from '../db.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileFromKey } from './storage.js';
import { companyDisplayName } from './company.js';

export type SignaturePurpose = 'quote' | 'invoice' | 'professional';
export interface SignatureFields {
  enabled: boolean; firstName?: string; lastName?: string; jobTitle?: string; company?: string;
  phone?: string; website?: string; address?: string; extra?: string;
  includeQuotes?: boolean; includeInvoices?: boolean; includeProfessional?: boolean;
  signatureHtml?: string; signatureText?: string;
}
const clean = (s: unknown) => String(s ?? '').replace(/[\r\t]+/g, ' ').trim().slice(0, 1000);
const escapeHtml = (s: unknown) => clean(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const safeHttps = (value: unknown) => { try { const u=new URL(clean(value)); return u.protocol==='https:'&&!u.username&&!u.password?u.toString():''; } catch { return ''; } };

function values(f: SignatureFields | null, fallbackCompany: string) {
  const name = [clean(f?.firstName), clean(f?.lastName)].filter(Boolean).join(' ');
  const company = clean(f?.company) || clean(fallbackCompany);
  return [name, clean(f?.jobTitle), company, clean(f?.phone), clean(f?.website), clean(f?.address), ...clean(f?.extra).split(/\n/).map(clean)].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
}

export async function loadSignature(orgId: string): Promise<SignatureFields | null> {
  const r = (await query(`select es.*,o.name org_name,o.website org_website,trim(concat_ws(' · ',nullif(o.address,''),nullif(trim(concat_ws(' ',o.postal_code,o.city)),''))) org_address from organizations o left join email_signatures es on es.organization_id=o.id where o.id=$1`, [orgId])).rows[0];
  if (!r) return null;
  const fields: SignatureFields = {
    enabled: r.enabled ?? true, firstName: r.first_name, lastName: r.last_name, jobTitle: r.job_title,
    company: r.company || r.org_name, phone: r.phone, website: r.website || r.org_website,
    address: r.address || r.org_address, extra: r.extra,
    includeQuotes: r.include_quotes ?? true, includeInvoices: r.include_invoices ?? true,
    includeProfessional: r.include_professional ?? true,
  };
  fields.signatureText = values(fields, String(r.org_name||'')).join('\n');
  fields.signatureHtml = renderSignatureHtml(fields, String(r.org_name||''));
  return fields;
}

export async function saveSignature(orgId: string, f: SignatureFields) {
  const normalized: SignatureFields = {
    enabled: f.enabled !== false, firstName:clean(f.firstName), lastName:clean(f.lastName), jobTitle:clean(f.jobTitle),
    company:clean(f.company), phone:clean(f.phone), website:clean(f.website), address:clean(f.address), extra:clean(f.extra),
    includeQuotes:f.includeQuotes !== false, includeInvoices:f.includeInvoices !== false, includeProfessional:f.includeProfessional !== false,
  };
  const company = await companyDisplayName(orgId);
  const signatureText = values(normalized, company).join('\n');
  const signatureHtml = renderSignatureHtml(normalized, company);
  await query(`insert into email_signatures(organization_id,enabled,first_name,last_name,job_title,company,phone,website,address,extra,include_quotes,include_invoices,include_professional,signature_html,signature_text)
    values($1,$2,nullif($3,''),nullif($4,''),nullif($5,''),nullif($6,''),nullif($7,''),nullif($8,''),nullif($9,''),nullif($10,''),$11,$12,$13,$14,$15)
    on conflict(organization_id) do update set enabled=excluded.enabled,first_name=excluded.first_name,last_name=excluded.last_name,job_title=excluded.job_title,company=excluded.company,phone=excluded.phone,website=excluded.website,address=excluded.address,extra=excluded.extra,include_quotes=excluded.include_quotes,include_invoices=excluded.include_invoices,include_professional=excluded.include_professional,signature_html=excluded.signature_html,signature_text=excluded.signature_text,updated_at=now()`,
    [orgId,normalized.enabled,normalized.firstName,normalized.lastName,normalized.jobTitle,normalized.company,normalized.phone,normalized.website,normalized.address,normalized.extra,normalized.includeQuotes,normalized.includeInvoices,normalized.includeProfessional,signatureHtml,signatureText]);
  return {signatureHtml,signatureText};
}

/** HTML minimal, construit à partir de texte échappé ; aucun HTML fourni par l'utilisateur n'est interprété. */
export function renderSignatureHtml(f: SignatureFields | null, fallbackCompany: string) {
  if (f?.enabled === false) return '';
  const lines = values(f, fallbackCompany);
  return `<div class="aurion-email-signature" style="font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#333">${lines.map((line,i)=>{
    const href=safeHttps(line);
    const content=href?`<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(line)}</a>`:escapeHtml(line);
    return i===0?`<strong>${content}</strong>`:content;
  }).join('<br>')}</div>`;
}

/** Texte de signature compatible avec les messageries textuelles. */
export function renderSignature(f: SignatureFields | null, fallbackCompany: string) {
  if (f?.enabled === false) return '';
  const lines = values(f, fallbackCompany);
  return lines.length ? `\n\nCordialement,\n${lines.join('\n')}` : '';
}
export async function signatureFor(orgId: string, activityId?: string | null, purpose: SignaturePurpose = 'professional') {
  const signature=await loadSignature(orgId);
  if(signature?.enabled===false) return '';
  if(purpose==='quote'&&signature?.includeQuotes===false) return '';
  if(purpose==='invoice'&&signature?.includeInvoices===false) return '';
  if(purpose==='professional'&&signature?.includeProfessional===false) return '';
  return renderSignature(signature, await companyDisplayName(orgId, activityId));
}


/** Deux rendus cohérents de la même signature, selon les catégories activées. */
export async function signatureForEmail(orgId: string, activityId?: string | null, purpose: SignaturePurpose = 'professional') {
  const signature = await loadSignature(orgId);
  if (signature?.enabled === false) return { text: '', html: '' };
  if (purpose === 'quote' && signature?.includeQuotes === false) return { text: '', html: '' };
  if (purpose === 'invoice' && signature?.includeInvoices === false) return { text: '', html: '' };
  if (purpose === 'professional' && signature?.includeProfessional === false) return { text: '', html: '' };
  const company = await companyDisplayName(orgId, activityId);
  const text = renderSignature(signature, company);
  const markup = renderSignatureHtml(signature, company);
  let html = markup ? `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#333"><br><br>Cordialement,<br>${markup}</div>` : '';
  const inlineAttachments: Array<{filename:string;content:Buffer;contentType:string;cid:string}> = [];
  if (html) {
    const logoKey = (await query('select logo_key from organizations where id=$1',[orgId])).rows[0]?.logo_key;
    if (logoKey) {
      try {
        const ext = path.extname(String(logoKey)).toLowerCase();
        if (['.png','.jpg','.jpeg'].includes(ext)) {
          const content = await readFile(fileFromKey(String(logoKey)));
          if (content.length > 0 && content.length <= 5 * 1024 * 1024) {
            const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';
            inlineAttachments.push({filename:`logo${ext}`,content,contentType,cid:'aurion-logo'});
            html = html.replace('<div class="aurion-email-signature"', '<div class="aurion-email-signature"');
            html = html.replace('<br><br>Cordialement,<br>', `<br><br>Cordialement,<br><img src="cid:aurion-logo" alt="Logo de ${escapeHtml(company)}" style="display:block;max-width:180px;max-height:70px;width:auto;height:auto;margin:0 0 8px 0"><br>`);
          }
        }
      } catch { /* Un logo absent ou illisible n'empêche jamais l'envoi du message. */ }
    }
  }
  return { text, html, inlineAttachments };
}

/** Convertit uniquement le texte fourni en HTML échappé, puis ajoute le fragment de signature construit côté serveur. */
export function emailBodyHtml(body: string, signatureHtml = '') {
  const escaped = String(body ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const withBreaks = escaped.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${withBreaks}</div>${signatureHtml || ''}`;
}
