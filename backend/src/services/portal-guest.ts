// 15.4.50 (suggestions A1/A2) — Portail client : accès invités et acceptation de devis.
// Fondé sur le partage par lien existant (bloc 14 : token SHA-256, révocable, expirable) :
// un CONTACT CLIENT reçoit un accès nominatif qui ne voit QUE ses propres données
// explicitement partagées. L'acceptation d'un devis est TRANSACTIONNELLE (verrou for update,
// refus déterministes) et horodatée avec preuve (nom saisi, IP, user-agent) + événement
// outbox dans la même transaction. Aucun mot de passe partagé, aucune protection côté
// interface seulement.
import { createHash, randomBytes } from 'node:crypto';
import type { SqlExecutor } from './sql-executor.js';
import { CLOSED_QUOTE_STATUSES } from './statuses.js';

export class PortalError extends Error {
  constructor(public code: 'ACCESS_NOT_FOUND' | 'ACCESS_REVOKED' | 'ACCESS_EXPIRED' | 'QUOTE_NOT_SHARED' | 'QUOTE_ALREADY_CLOSED' | 'NAME_REQUIRED', message: string) { super(message); }
}

/** Génère un jeton portail opaque (32 octets) et son empreinte SHA-256 de stockage. */
export function newPortalToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('hex');
  return { token, tokenHash: hashPortalToken(token) };
}

/** Empreinte de stockage — le jeton en clair n'est JAMAIS persisté (règle share-links). */
export function hashPortalToken(token: string): string {
  return createHash('sha256').update(String(token)).digest('hex');
}

export interface PortalQuoteView {
  id: string; number: string; status: string; totalTtc: number; currency: string;
  issuedAt: string | null; dueAt: string | null; acceptedAt: string | null; acceptedByName: string | null;
}

/**
 * Vue PORTAIL d'un client : devis explicitement partagés uniquement (table dédiée), jamais
 * les notes internes, marges, coûts ou d'autres clients. Fonction base (lecture scoped).
 */
export async function portalView(exec: SqlExecutor, organizationId: string, accessId: string): Promise<{ clientName: string; quotes: PortalQuoteView[] }> {
  const access = (await exec.query(
    `select a.id,a.client_id as "clientId",a.status,a.contact_name as "contactName",a.expires_at as "expiresAt",c.name as "clientName"
     from client_portal_access a join clients c on c.id=a.client_id
     where a.id=$2 and a.organization_id=$1`,
    [organizationId, accessId],
  )).rows[0];
  if (!access) throw new PortalError('ACCESS_NOT_FOUND', 'Accès portail introuvable.');
  if (access.status === 'revoked') throw new PortalError('ACCESS_REVOKED', 'Cet accès au portail a été révoqué.');
  if (access.expiresAt && new Date(String(access.expiresAt)).getTime() < Date.now()) throw new PortalError('ACCESS_EXPIRED', 'Cet accès au portail a expiré.');
  const quotes = (await exec.query(
    // 15.4.52 — plus de q.currency : la colonne n'existe pas dans le schéma des documents
    // (application mono-devise €) ; la requête renvoyait une erreur 42703 → page publique 500.
    `select q.id,q.number,q.status,q.total_ttc as "totalTtc",q.created_at as "issuedAt",q.due_at as "dueAt",
            q.accepted_at as "acceptedAt",
            (select signed_name from quote_client_acceptances w where w.organization_id=q.organization_id and w.quote_id=q.id) as "acceptedByName"
     from portal_shared_quotes s join quotes q on q.id=s.quote_id and q.organization_id=s.organization_id
     where s.access_id=$2 and s.organization_id=$1 and q.document_type='quote'
     order by q.created_at desc limit 100`,
    [organizationId, accessId],
  )).rows.map((r: any) => ({
    id: String(r.id), number: String(r.number || ''), status: String(r.status || ''),
    totalTtc: Number(r.totalTtc || 0), currency: 'EUR',
    issuedAt: r.issuedAt ? new Date(r.issuedAt).toISOString() : null,
    dueAt: r.dueAt ? new Date(r.dueAt).toISOString() : null,
    acceptedAt: r.acceptedAt ? new Date(r.acceptedAt).toISOString() : null,
    acceptedByName: r.acceptedByName ?? null,
  }));
  return { clientName: String(access.clientName || ''), quotes };
}

/**
 * Accepte un devis DEPUIS LE PORTAIL : verrou transactionnel, refus déterministes si le devis
 * n'est pas partagé à cet accès ou déjà clos, enregistrement de la preuve + événement outbox
 * DANS la même transaction (fondation 109). Le statut suit les transitions métier existantes.
 */
export async function acceptQuoteFromPortal(
  exec: SqlExecutor, organizationId: string, accessId: string, quoteId: string, signedName: string, meta: { remoteIp?: string | null; userAgent?: string | null },
): Promise<{ accepted: boolean; acceptedAt: string; acceptedByName: string }> {
  const name = String(signedName || '').trim().slice(0, 160);
  if (name.length < 2) throw new PortalError('NAME_REQUIRED', 'Indiquez votre nom pour valider l\u2019acceptation : il est horodaté avec votre accord.');
  const access = (await exec.query(
    `select id,client_id as "clientId",status,expires_at as "expiresAt" from client_portal_access where id=$2 and organization_id=$1 for update`,
    [organizationId, accessId],
  )).rows[0];
  if (!access) throw new PortalError('ACCESS_NOT_FOUND', 'Accès portail introuvable.');
  if (access.status === 'revoked') throw new PortalError('ACCESS_REVOKED', 'Cet accès au portail a été révoqué.');
  if (access.expiresAt && new Date(String(access.expiresAt)).getTime() < Date.now()) throw new PortalError('ACCESS_EXPIRED', 'Cet accès au portail a expiré.');
  const shared = (await exec.query(
    `select 1 from portal_shared_quotes where access_id=$2 and quote_id=$3 and organization_id=$1`,
    [organizationId, accessId, quoteId],
  )).rowCount ?? 0;
  if (!shared) throw new PortalError('QUOTE_NOT_SHARED', 'Ce devis n\u2019a pas été partagé sur ce portail.');
  const quote = (await exec.query(
    `select id,status,accepted_at from quotes where id=$2 and organization_id=$1 and document_type='quote' for update`,
    [organizationId, quoteId],
  )).rows[0];
  if (!quote) throw new PortalError('QUOTE_NOT_SHARED', 'Devis introuvable.');
  if (['accepted', 'annulé', 'annule'].includes(String(quote.status || '')) || (CLOSED_QUOTE_STATUSES as readonly string[]).includes(String(quote.status || ''))) {
    throw new PortalError('QUOTE_ALREADY_CLOSED', `Ce devis est déjà clos (statut : ${quote.status}) : la décision ne peut plus être changée depuis le portail.`);
  }
  const acceptedAt = new Date().toISOString();
  await exec.query(`update quotes set status='accepted',accepted_at=$3,updated_at=now() where id=$2 and organization_id=$1`, [organizationId, quoteId, acceptedAt]);
  await exec.query(
    `insert into quote_client_acceptances(organization_id,quote_id,access_id,signed_name,remote_ip,user_agent,accepted_at)
     values($1,$2,$3,$4,$5,$6,$7) on conflict (organization_id,quote_id) do nothing`,
    [organizationId, quoteId, accessId, name, meta.remoteIp?.slice(0, 64) ?? null, meta.userAgent?.slice(0, 300) ?? null, acceptedAt],
  );
  await exec.query(
    `insert into business_events_outbox(organization_id,event_type,source_entity_type,source_entity_id,payload,idempotency_key)
     values($1,'quote_accepted_portal','quote',$2,$3,$4) on conflict (organization_id,idempotency_key) do nothing`,
    [organizationId, quoteId, JSON.stringify({ quoteId, viaPortal: true, signedName: name }), `portal-accept:${quoteId}`],
  );
  return { accepted: true, acceptedAt, acceptedByName: name };
}

/**
 * Table de partage portail : la migration 114 ne la crée pas — elle est créée ICI par le
 * service à la première utilisation? NON : règle du dépôt = migrations additives uniquement.
 * La table portal_shared_quotes est créée par la migration 118 (voir CHANGELOG) : le service
 * la consomme et les routes l'alimentent (partage explicite par l'entrepreneur).
 */
