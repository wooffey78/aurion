import { query } from '../db.js';
import { loadSettings, sendOrgMail } from './mail.js';
import { buildIcs } from './ics.js';
import { calendarCreate, calendarUpdate, calendarDelete, connection } from './google.js';
import { companyDisplayName } from './company.js';
import { signatureForEmail, emailBodyHtml } from './signature.js';

export type CalendarAction = 'create' | 'update' | 'cancel';
export interface CalendarResult {
  mode: 'google' | 'invitation' | 'none';
  ok: boolean;            // l'agenda de l'UTILISATEUR a bien été mis à jour / invité
  error?: string;
  client?: 'sent' | 'skipped' | 'failed';
  clientError?: string;
}

export async function loadAppointment(orgId: string, id: string) {
  const r = await query(`select a.*,c.name client_name,c.email client_email,c.address client_address,c.intervention_address client_intervention_address,q.number quote_number,q.total_ttc quote_total_ttc from appointments a left join clients c on c.id=a.client_id left join quotes q on q.id=a.quote_id where a.id=$1 and a.organization_id=$2`, [id, orgId]);
  return r.rows[0] || null;
}

const VERB = { create: 'confirmé', update: 'modifié', cancel: 'annulé' } as const;

/**
 * Met à jour l'agenda de l'UTILISATEUR et prévient le CLIENT, simultanément :
 *  - utilisateur : API Google Agenda si connectée, sinon invitation iCalendar (METHOD:REQUEST) envoyée à SA messagerie ;
 *    le client n'est jamais invité à cet événement : son agenda n'est pas modifié ;
 *  - client (s'il a une adresse e-mail) : e-mail de confirmation / modification / annulation, avec un fichier .ics facultatif (PUBLISH) à ajouter lui-même.
 * N'échoue jamais : le rendez-vous reste enregistré même si un envoi échoue.
 */
export async function syncAppointment(orgId: string, a: any, action: CalendarAction): Promise<CalendarResult> {
  try {
    const start = new Date(a.starts_at), end = new Date(a.ends_at || new Date(start.getTime() + 3600000));
    const company = await companyDisplayName(orgId, a.activity_id);
    const sig = await signatureForEmail(orgId, a.activity_id, 'professional');
    const when = start.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
    const s = await loadSettings(orgId);
    const google = await connection(orgId).catch(() => null);
    const sequence = Number(a.ics_sequence || 0) + (action === 'create' ? 0 : 1);
    const uid = `${a.id}@aurion.local`;

    const userTask = async (): Promise<{ ok: boolean; error?: string; mode: 'google' | 'invitation' | 'none' }> => {
      try {
        if (google) {
          const ev = { title: a.title, startsAt: start.toISOString(), endsAt: end.toISOString() };
          if (action === 'create') {
            const id = await calendarCreate(orgId, ev);
            if (!id) throw new Error('GOOGLE_EVENT_ID_MISSING');
            await query('update appointments set google_event_id=$1 where id=$2 and organization_id=$3', [id, a.id, orgId]);
          }
          else if (a.google_event_id) { if (action === 'update') await calendarUpdate(orgId, a.google_event_id, ev); else await calendarDelete(orgId, a.google_event_id); }
          return { ok: true, mode: 'google' };
        }
        if (!s) return { ok: false, error: 'MAIL_NOT_CONFIGURED', mode: 'none' };
        const ics = buildIcs({
          uid, method: action === 'cancel' ? 'CANCEL' : 'REQUEST', sequence, start, end, summary: a.title,
          description: a.client_name ? `Client : ${a.client_name}` : 'Créé par Aurion',
          organizer: { email: s.email, name: company }, attendees: [{ email: s.email, name: company }],
        });
        const prefix = action === 'cancel' ? 'Annulé : ' : action === 'update' ? 'Modifié : ' : 'Rendez-vous : ';
        await sendOrgMail(orgId, {
          to: s.email, subject: `${prefix}${a.title}`,
          text: `${prefix}${a.title}${a.client_name ? `\nClient : ${a.client_name}` : ''}\n${when}\n\nInvitation pour VOTRE agenda, envoyée par Aurion : ouvrez la pièce jointe ou cliquez sur « Ajouter à l’agenda » dans votre messagerie.${sig.text}`,
          html: emailBodyHtml(`${prefix}${a.title}${a.client_name ? `\nClient : ${a.client_name}` : ''}\n${when}\n\nInvitation pour VOTRE agenda, envoyée par Aurion : ouvrez la pièce jointe ou cliquez sur « Ajouter à l’agenda » dans votre messagerie.`, sig.html),
          attachments: sig.inlineAttachments, icalEvent: { method: action === 'cancel' ? 'CANCEL' : 'REQUEST', content: ics, filename: 'invitation.ics' },
        });
        await query('update appointments set ics_sequence=$1 where id=$2', [sequence, a.id]);
        return { ok: true, mode: 'invitation' };
      } catch (e: any) { return { ok: false, error: String(e?.message || e), mode: 'none' }; }
    };

    const clientTask = async (): Promise<{ state: 'sent' | 'skipped' | 'failed'; error?: string }> => {
      if (!a.client_email) return { state: 'skipped' };
      try {
        const attachments = action === 'cancel' ? [] : [{
          filename: 'rendez-vous.ics', contentType: 'text/calendar; method=PUBLISH',
          content: Buffer.from(buildIcs({ uid: `${uid}-client`, method: 'REQUEST', sequence, start, end, summary: `${a.title} · ${company}`, organizer: { email: s?.email || 'rdv@aurion.local', name: company }, attendees: [] }).replace('METHOD:REQUEST', 'METHOD:PUBLISH')),
        }];
        const subject = `${action === 'cancel' ? 'Annulation' : action === 'update' ? 'Rendez-vous modifié' : 'Confirmation de rendez-vous'} : ${a.title}`;
        await sendOrgMail(orgId, {
          to: a.client_email, subject,
          text: `Bonjour ${a.client_name || ''},\n\nVotre rendez-vous « ${a.title} » est ${VERB[action]}${action === 'cancel' ? '.' : ` : ${when}.`}\n${action === 'cancel' ? 'N’hésitez pas à nous contacter pour convenir d’un nouveau créneau.' : 'Un fichier « rendez-vous.ics » est joint : ouvrez-le pour l’ajouter à votre propre agenda si vous le souhaitez.'}${sig.text}`,
          html: emailBodyHtml(`Bonjour ${a.client_name || ''},\n\nVotre rendez-vous « ${a.title} » est ${VERB[action]}${action === 'cancel' ? '.' : ` : ${when}.`}\n${action === 'cancel' ? 'N’hésitez pas à nous contacter pour convenir d’un nouveau créneau.' : 'Un fichier « rendez-vous.ics » est joint : ouvrez-le pour l’ajouter à votre propre agenda si vous le souhaitez.'}`, sig.html),
          attachments: [...(sig.inlineAttachments||[]),...attachments],
        });
        return { state: 'sent' };
      } catch (e: any) { return { state: 'failed', error: String(e?.message || e) }; }
    };

    const [u, c] = await Promise.all([userTask(), clientTask()]);   // envoi simultané
    return { mode: u.mode, ok: u.ok, error: u.error, client: c.state, clientError: c.error };
  } catch (e: any) {
    return { mode: 'none', ok: false, error: String(e?.message || e) };
  }
}
