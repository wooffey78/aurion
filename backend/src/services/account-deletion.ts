import crypto from 'node:crypto';
import { adminQuery, adminTransaction } from '../db.js';
import { logAdminAccess } from '../db.js';
import { bumpSessions } from './account.js';
import { deletePrivateObject } from './storage.js';
import { AurionError } from './errors.js';

// §5.5 — traitement réel, idempotent et relançable d'une demande de suppression de compte.
// La preuve du traitement est conservée hors des données personnelles (table account_deletion_audit,
// migration 086) : l'adresse n'y figure que sous forme d'empreinte SHA-256, jamais en clair.

export interface DeletionOutcome {
  alreadyProcessed?: boolean;
  auditReference?: string;
  organizationsClosed?: number;
  organizationsLeft?: number;
  sessionsRevoked?: number;
}

const emailHash = (email: string) => crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

/** Liste paginée des demandes pour la console d'administration (§5.4). */
export async function listAccountDeletionRequests(page = 1, pageSize = 25) {
  const safePage = Math.max(1, Math.min(1000, Math.floor(Number(page) || 1)));
  const safeSize = Math.max(1, Math.min(100, Math.floor(Number(pageSize) || 25)));
  const rows = (await adminQuery(`
    select r.id, r.email, r.reason, r.source, r.status, r.requested_at as "requestedAt",
           r.cancelled_at as "cancelledAt", r.processed_at as "processedAt",
           r.processed_by as "processedBy", r.audit_reference as "auditReference",
           r.rejection_reason as "rejectionReason", r.attempts as attempts,
           r.last_error as "lastError", r.last_step as "lastStep",
           r.processing_started_at as "processingStartedAt",
           u.id is not null as userExists, u.full_name as "fullName",
           (select o.name from organization_members om join organizations o on o.id=om.organization_id
             where om.user_id=r.user_id order by case when om.role='owner' then 0 else 1 end, o.name limit 1) as "organizationName",
           (select count(*)::int from organization_members om2 where om2.user_id=r.user_id) as "organizationCount"
      from account_deletion_requests r
      left join users u on u.id=r.user_id
     order by case when r.status='pending' then 0 else 1 end, r.requested_at desc
     limit $1 offset $2`, [safeSize, (safePage - 1) * safeSize])).rows;
  const total = Number((await adminQuery('select count(*)::int n from account_deletion_requests')).rows[0]?.n || 0);
  const pending = Number((await adminQuery("select count(*)::int n from account_deletion_requests where status='pending'")).rows[0]?.n || 0);
  // Historique des traitements passés (trace minimale, aucune donnée personnelle en clair).
  const history = (await adminQuery(`
    select request_id as "requestId", audit_reference as "auditReference", final_status as "finalStatus",
           processed_at as "processedAt", organizations_closed as "organizationsClosed",
           organizations_left as "organizationsLeft", sessions_revoked as "sessionsRevoked"
      from account_deletion_audit order by created_at desc limit 50`)).rows;
  return { requests: rows, total, pending, page: safePage, pageSize: safeSize, history };
}

/** Traite réellement une demande : réservation atomique, révocations, secrets, espaces,
 *  effacement transactionnel et trace d'audit. Idempotent et relançable. */
const PROCESSING_LEASE_MS = 30 * 60 * 1000;

export async function processAccountDeletion(requestId: string, operatorId: string): Promise<DeletionOutcome> {
  // 1) Réservation ATOMIQUE de la demande : verrou de ligne + statut daté. Deux opérateurs
  //    simultanés ne peuvent plus traiter la même demande ; une reprise n'est possible
  //    qu'après expiration du bail (opérateur interrompu).
  const reserved = await adminTransaction(async client => {
    const request = (await client.query(
      'select id,user_id,email,reason,source,status,requested_at,processing_started_at from account_deletion_requests where id=$1 for update', [requestId])).rows[0];
    if (!request) throw new AurionError('NOT_FOUND', 'Demande de suppression introuvable.', 404);
    const done = (await client.query(
      "select audit_reference as \"auditReference\" from account_deletion_audit where request_id=$1 and final_status='processed' limit 1", [requestId])).rows[0];
    if (done) return { alreadyProcessed: true as const, auditReference: String(done.auditReference) };
    if (request.status === 'processing') {
      const started = request.processing_started_at ? new Date(request.processing_started_at).getTime() : 0;
      if (Date.now() - started < PROCESSING_LEASE_MS) {
        throw new AurionError('INVALID_STATE', 'Cette demande est déjà en cours de traitement par un autre opérateur. Réessayez dans quelques minutes.', 409);
      }
    } else if (request.status !== 'pending') {
      throw new AurionError('INVALID_STATE', `Cette demande est déjà ${request.status}.`, 409);
    }
    await client.query(
      "update account_deletion_requests set status='processing',processing_by=$2,processing_started_at=now(),attempts=coalesce(attempts,0)+1,last_error=null,last_step='reserved',scheduled_at=coalesce(scheduled_at,now()) where id=$1",
      [requestId, operatorId]);
    return { alreadyProcessed: false as const, request };
  });
  if (reserved.alreadyProcessed) return { alreadyProcessed: true, auditReference: reserved.auditReference };
  const request: any = (reserved as any).request;
  const userId = String(request.user_id);
  let step = 'started';
  try {
    // 2) Révocations et objets externes : une erreur n'est PLUS avalée — la demande repasse
    //    en attente avec l'étape fautive enregistrée, pour un nouveau traitement complet.
    step = 'sessions';
    const revoked = (await adminQuery('update native_sessions set revoked_at=now() where user_id=$1 and revoked_at is null', [userId])).rowCount || 0;
    step = 'session-version';
    await bumpSessions(userId);
    step = 'avatar';
    const avatarKey = (await adminQuery('select avatar_key from users where id=$1', [userId])).rows[0]?.avatar_key;
    if (avatarKey) await deletePrivateObject(String(avatarKey));

    // 3) Effacement relationnel dans UNE SEULE transaction : espaces, secrets, réattribution
    //    VIP, trace d'audit puis suppression du compte. Toute erreur annule l'ensemble.
    step = 'erasure';
    const result = await adminTransaction(async client => {
      const locked = (await client.query("select status from account_deletion_requests where id=$1 for update", [requestId])).rows[0];
      if (!locked || locked.status !== 'processing') throw new AurionError('INVALID_STATE', 'La demande n’est plus en cours de traitement.', 409);
      await client.query("update account_deletion_requests set last_step='memberships' where id=$1", [requestId]);
      const memberships = (await client.query('select organization_id from organization_members where user_id=$1', [userId])).rows;
      let organizationsClosed = 0, organizationsLeft = 0;
      for (const membership of memberships) {
        const orgId = String(membership.organization_id);
        const others = Number((await client.query(
          'select count(*)::int n from organization_members where organization_id=$1 and user_id<>$2', [orgId, userId])).rows[0]?.n || 0);
        if (others === 0) {
          // Espace mono-utilisateur : secrets d'intégration et connexions externes supprimés.
          await client.query('delete from google_connections where organization_id=$1', [orgId]);
          await client.query('delete from google_oauth_states where organization_id=$1', [orgId]);
          await client.query('delete from mail_accounts where organization_id=$1', [orgId]);
          await client.query("update billing_payment_requests set status='canceled',paid_at=null where organization_id=$1 and status='pending'", [orgId]);
          organizationsClosed += 1;
        } else {
          organizationsLeft += 1;
        }
        await client.query('delete from organization_members where organization_id=$1 and user_id=$2', [orgId, userId]);
      }
      await client.query("update account_deletion_requests set last_step='audit' where id=$1", [requestId]);
      await client.query('update vip_guest_accounts set invited_by=$2 where invited_by=$1', [userId, operatorId]);
      const auditReference = `SUP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      await client.query(`insert into account_deletion_audit
        (request_id,email_hash,source,requested_at,processed_at,processed_by,audit_reference,final_status,
         organizations_closed,organizations_left,sessions_revoked)
        values ($1,$2,$3,$4,now(),$5,$6,'processed',$7,$8,$9)`,
        [requestId, emailHash(String(request.email)), String(request.source || 'app'), request.requested_at,
          operatorId, auditReference, organizationsClosed, organizationsLeft, revoked]);
      await client.query("update account_deletion_requests set last_step='delete-user' where id=$1", [requestId]);
      await client.query('delete from users where id=$1', [userId]);
      return { auditReference, organizationsClosed, organizationsLeft };
    });
    await logAdminAccess('account-deletion.process', {
      requestId, auditReference: result.auditReference,
      organizationsClosed: result.organizationsClosed, organizationsLeft: result.organizationsLeft,
    });
    return { ...result, sessionsRevoked: revoked };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Relançable : retour en attente, étape et erreur conservées pour l'opérateur.
    await adminQuery("update account_deletion_requests set status='pending' where id=$1 and status='processing'", [requestId]).catch(() => {});
    await adminQuery(
      "update account_deletion_requests set last_error=$2,last_step=$3,processing_by=null,processing_started_at=null where id=$1 and status='pending'",
      [requestId, message.slice(0, 500), step]).catch(() => {});
    throw error;
  }
}

/** Rejet motivé d'une demande (§5.4) : l'utilisateur existe toujours et est informé. */
export async function rejectAccountDeletion(requestId: string, operatorId: string, reason: string) {
  const request = (await adminQuery(
    'select id,user_id,email,status from account_deletion_requests where id=$1', [requestId])).rows[0];
  if (!request) throw new AurionError('NOT_FOUND', 'Demande de suppression introuvable.', 404);
  if (request.status !== 'pending') throw new AurionError('INVALID_STATE', `Cette demande est déjà ${request.status}.`, 409);
  const auditReference = `REJ-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  await adminQuery(`update account_deletion_requests
      set status='rejected',processed_at=now(),processed_by=$2,audit_reference=$3,rejection_reason=$4
    where id=$1`, [requestId, operatorId, auditReference, String(reason || '').slice(0, 2000)]);
  await adminQuery(`insert into account_deletion_audit
    (request_id,email_hash,source,requested_at,processed_at,processed_by,audit_reference,final_status)
    values ($1,$2,$3,$4,now(),$5,$6,'rejected')`,
    [requestId, emailHash(String(request.email)), 'admin', (await adminQuery('select requested_at from account_deletion_requests where id=$1', [requestId])).rows[0]?.requested_at, operatorId, auditReference]).catch(() => {});
  await logAdminAccess('account-deletion.reject', { requestId, auditReference });
  return { auditReference };
}
