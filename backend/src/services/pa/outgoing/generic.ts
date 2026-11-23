// Adaptateur PA « generic » sortant — contrat de référence d'ÉMISSION, documenté dans
// docs/PLATEFORME-AGREEE.md (§ 8) ; miroir exact du contrat entrant du bloc 3.
//
// ATTENTION (bloc 4 du cahier des charges) : cet adaptateur n'est connecté à AUCUNE plateforme
// agréée réelle. Il définit un contrat serveur-à-serveur signé HMAC-SHA256 que les tests de
// contrat exercent de bout en bout contre un serveur HTTP de recette réel (boucle locale).
// Toute connexion à une PA contractuelle exige un adaptateur dédié validé en sandbox — aucun
// endpoint ni identifiant réel n'est codé en dur ici.
//
// Contrat sortant :
//   POST {baseUrl}
//   En-têtes :
//     X-Aurion-PA-Transmission-Id : identifiant d'idempotence (stable entre re-tentatives ;
//                                   la PA déduplique dessus et ré-acquitte le premier verdict)
//     X-Aurion-PA-Format          : « ubl » | « cii » | « ereporting » (bloc 5)
//     X-Aurion-PA-Signature       : t=<unix>,v1=<hex(HMAC-SHA256(secret, "<t>.<corps brut>))>
//     Content-Type                : application/xml (UBL/CII) | application/json (ereporting)
//   Corps : octets du document structuré (XML UTF-8) ou du flux e-reporting (JSON UTF-8).
//
// Accusé (réponse 2xx, JSON signé par la PA) :
//   X-Aurion-PA-Signature : même schéma, calculé sur le corps de la réponse.
//   { "status": "accepted", "paReference": "…" }
//   | { "status": "rejected", "code": "…", "message": "…" }
//   Un accusé non signé, mal formé ou de statut inconnu => invalid_ack : l'émission refuse de
//   conclure (« issue non confirmée ») — aucune facture n'est jamais marquée transmise sur
//   une réponse douteuse. Toute réponse non 2xx ou indisponible => transport_error (reprise
//   possible ; l'idempotence côté PA garantit l'absence de doublon).

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaOutgoingAdapter, PaOutgoingEndpoint, PaOutgoingResult, PaOutgoingTransmission } from './types.js';

export const GENERIC_PA_OUT_SIGNATURE_HEADER = 'x-aurion-pa-signature';

function sign(secret: string, body: Buffer, timestampSeconds: number): string {
  const v1 = createHmac('sha256', secret).update(`${timestampSeconds}.`, 'utf8').update(body).digest('hex');
  return `t=${timestampSeconds},v1=${v1}`;
}

/** Vérifie la signature d'un accusé PA (miroir du schéma entrant, comparaison à temps constant). */
export function verifyAckSignature(rawAck: Buffer, header: string, secret: string, toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !header || !Buffer.isBuffer(rawAck)) return false;
  const fields = header.split(',').map(part => part.trim().split('=', 2));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`, 'utf8')
    .update(rawAck)
    .digest();
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value || '');
  return signatures.some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

type AckPayload = {
  status?: unknown;
  paReference?: unknown;
  code?: unknown;
  message?: unknown;
};

/** Parse strict de l'accusé JSON (champs connus uniquement, tailles bornées). */
export function parseAck(rawAck: Buffer): { ok: true; ack: AckPayload } | { ok: false; message: string } {
  if (!rawAck.length || rawAck.length > 64 * 1024) return { ok: false, message: 'Accusé de réception illisible (taille).' };
  let json: unknown;
  try { json = JSON.parse(rawAck.toString('utf8')); }
  catch { return { ok: false, message: 'Accusé de réception illisible (JSON).' }; }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, message: 'Accusé de réception mal formé.' };
  const ack = json as AckPayload;
  if (typeof ack.status !== 'string') return { ok: false, message: 'Accusé sans statut.' };
  if (ack.paReference !== undefined && typeof ack.paReference !== 'string') return { ok: false, message: 'Référence PA invalide.' };
  if (ack.code !== undefined && typeof ack.code !== 'string') return { ok: false, message: 'Code de rejet invalide.' };
  if (ack.message !== undefined && typeof ack.message !== 'string') return { ok: false, message: 'Message d’accusé invalide.' };
  return { ok: true, ack };
}

export const genericPaOutgoingAdapter: PaOutgoingAdapter = {
  provider: 'generic',

  async transmit(endpoint: PaOutgoingEndpoint, transmission: PaOutgoingTransmission, timeoutMs: number): Promise<PaOutgoingResult> {
    const body = Buffer.isBuffer(transmission.bytes) ? transmission.bytes : Buffer.from(String(transmission.bytes ?? ''), 'utf8');
    if (!endpoint.baseUrl || !endpoint.secret || !body.length) {
      return { kind: 'transport_error', message: 'Point d’entrée d’émission incomplet.', timedOut: false };
    }
    let url: URL;
    try { url = new URL(endpoint.baseUrl); }
    catch { return { kind: 'transport_error', message: 'URL du point d’entrée d’émission invalide.', timedOut: false }; }

    const timestamp = Math.floor(Date.now() / 1000);
    const contentType = transmission.format === 'ereporting' ? 'application/json' : 'application/xml';
    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': contentType,
            'x-aurion-pa-transmission-id': transmission.transmissionId,
            'x-aurion-pa-format': transmission.format,
            'x-aurion-pa-signature': sign(endpoint.secret, body, timestamp),
          },
          body: new Uint8Array(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (error: unknown) {
      const timedOut = error instanceof Error && (error.name === 'AbortError' || String(error.message).includes('abort'));
      return { kind: 'transport_error', message: timedOut ? `Délai d’attente dépassé (${timeoutMs} ms).` : `Transport indisponible : ${error instanceof Error ? error.message : 'erreur réseau'}`, timedOut };
    }

    const rawAck = Buffer.from(await response.arrayBuffer());
    const rawContentType = String(response.headers.get('content-type') || '').split(';')[0].trim() || '';
    if (!response.ok) {
      return { kind: 'transport_error', message: `La PA a répondu HTTP ${response.status} ; issue non confirmée.`, timedOut: false };
    }
    const header = String(response.headers.get(GENERIC_PA_OUT_SIGNATURE_HEADER) || '');
    if (!verifyAckSignature(rawAck, header, endpoint.secret)) {
      return { kind: 'invalid_ack', message: 'Signature de l’accusé invalide : l’accusé n’est pas authentifié.', raw: rawAck, rawContentType };
    }
    const parsed = parseAck(rawAck);
    if (!parsed.ok) return { kind: 'invalid_ack', message: parsed.message, raw: rawAck, rawContentType };
    const { status, paReference, code, message } = parsed.ack;
    if (status === 'accepted') {
      return { kind: 'accepted', paReference: typeof paReference === 'string' && paReference.trim() ? paReference.trim().slice(0, 200) : null, raw: rawAck, rawContentType };
    }
    if (status === 'rejected') {
      if (!code || !String(code).trim()) return { kind: 'invalid_ack', message: 'Accusé de rejet sans code.', raw: rawAck, rawContentType };
      return { kind: 'rejected', code: String(code).trim().slice(0, 80), message: typeof message === 'string' ? message.slice(0, 2000) : null, raw: rawAck, rawContentType };
    }
    return { kind: 'invalid_ack', message: `Statut d’accusé inconnu : ${String(status).slice(0, 40)}`, raw: rawAck, rawContentType };
  },
};

/** Génère un accusé signé (usage : serveur HTTP de recette et tests uniquement). */
export function signGenericAck(secret: string, ackBody: Buffer, timestampSeconds?: number): string {
  const t = timestampSeconds ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.`, 'utf8').update(ackBody).digest('hex');
  return `t=${t},v1=${v1}`;
}

export { sign };
