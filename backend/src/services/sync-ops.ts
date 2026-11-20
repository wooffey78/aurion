// Bloc 4 — moteur de rejeu des opérations décidées hors connexion (exigence centrale du
// prompt maître §4.4-4.5). Principes :
//   - ZÉRO divergence de logique métier : chaque opération rejoue la ROUTE RÉELLE via
//     app.inject (mêmes validations, mêmes services, mêmes transactions) — le serveur reste
//     l'unique source de vérité (numérotation, droits, RLS, statuts réglementaires) ;
//   - IDEMPOTENCE : chaque opération porte un opClientId unique ; sync_applied_ops (migration
//     084, clé organisation+opId) garantit qu'un retry, un timeout ou un accusé perdu ne crée
//     JAMAIS de doublon — une opération déjà appliquée renvoie son résultat enregistré ;
//   - RÉFÉRENCES STABLES : l'appareil pré-génère des références locales (localRef) et écrit
//     "@ref:<localRef>" dans les champs qui pointent vers un objet créé hors connexion ; au
//     rejeu, la référence est substituée par l'identifiant serveur de l'opération source ;
//   - INTENTION RESPECTÉE : l'opération rejoue exactement la décision prise hors connexion
//     (créer ≠ émettre ; émettre+envoyer déclenche les deux au Bloc 5) — aucune seconde
//     confirmation n'est demandée pour une instruction complète ;
//   - ERREURS HONNÊTES : erreur permanente → statut « blocked » avec raison (l'appareil garde
//     l'opération et l'explique, jamais d'effacement silencieux) ; erreur serveur → « retry »
//     (transitoire, non enregistrée comme appliquée) ; conflit → « conflict ».
import { z } from 'zod';
import { query } from '../db.js';

export const syncOpSchema = z.object({
  opId: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/, 'opId invalide'),
  kind: z.string().trim().min(2).max(40),
  method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().trim().max(300).regex(/^\//, 'chemin invalide'),
  payload: z.unknown().optional(),
  localRef: z.string().trim().max(80).regex(/^[A-Za-z0-9_-]*$/).optional().default(''),
  dependsOn: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).optional().default(''),
  decidedAt: z.string().trim().max(40).optional().default(''),
});
export type SyncOp = z.infer<typeof syncOpSchema>;

// Chemins de rejeu AUTORISÉS : uniquement les écritures métier de l'utilisateur (Bloc 0 §3).
// Sont exclus par conception : administration plateforme, facturation Aurion (billing),
// authentification, intégrations Google/messagerie, stockage cloud (sa file propre), uploads.
const ALLOWED_PATH_PATTERNS: RegExp[] = [
  /^\/clients(\/[A-Za-z0-9-]+)?(\/intervention-addresses(\/[A-Za-z0-9-]+)?)?$/,
  /^\/suppliers(\/[A-Za-z0-9-]+)?$/,
  /^\/supplies(\/[A-Za-z0-9-]+)?$/,
  /^\/parts(\/[A-Za-z0-9-]+)?(\/prices(\/[A-Za-z0-9-]+)?)?$/,
  /^\/devices(\/[A-Za-z0-9-]+)?$/,
  /^\/sav(\/[A-Za-z0-9-]+)?$/,
  /^\/warranty-policies(\/[A-Za-z0-9-]+)?$/,
  /^\/interventions(\/[A-Za-z0-9-]+)?$/,
  /^\/appointments(\/[A-Za-z0-9-]+)?$/,
  /^\/expense-reports(\/[A-Za-z0-9-]+)?$/,
  /^\/activities(\/[A-Za-z0-9-]+)?$/,
  /^\/quotes(\/[A-Za-z0-9-]+)?(\/invoice)?$/,
  /^\/invoices\/[A-Za-z0-9-]+\/(payments|installments|reminders|penalty|payment-link)$/,
  /^\/settings\/draft$/,
  /^\/document-template-choices$/,
  /^\/fiscal-calendar\/margins$/,
  /^\/forecast\/assumptions$/,
  /^\/journal\/events\/[A-Za-z0-9_-]+$/,
  /^\/support\/tickets(\/[A-Za-z0-9-]+(\/messages)?)?$/,
  /^\/communications\/email\/document$/, // Bloc 4 — intention d'envoi e-mail hors connexion (validations réelles à l'exécution, idempotence opId)
  /^\/documents\/render\/(quote|invoice)\/[A-Za-z0-9-]+$/, // Bloc 4 — intention de rendu PDF/DOCX/ODT d'un document décidé hors connexion
];

const REF_RE = /^@ref:([A-Za-z0-9_-]+)$/;

/**
 * Réécrit les segments de chemin qui référencent une entité créée hors connexion : une
 * référence locale (ex. /clients/loc… créée puis modifiée hors connexion) devient
 * l'identifiant serveur résolu (batch courant ou opérations déjà appliquées, entity_ref).
 */
async function rewritePathRefs(path: string, orgId: string, resolved: Map<string, string>): Promise<string> {
  const [base, queryString = ''] = path.split('?');
  const out: string[] = [];
  for (const seg of base.split('/')) {
    const m = REF_RE.exec(seg);
    if (m) {
      const hit = resolved.get(m[1]);
      if (hit) { out.push(hit); continue; }
      // Dépôt séparé : la référence a été appliquée dans un dépôt antérieur — lookup entity_ref.
      const row = (await query<{ result_ref: string }>(
        'select result_ref from sync_applied_ops where organization_id=$1 and entity_ref=$2 limit 1',
        [orgId, m[1]]
      )).rows[0];
      if (row?.result_ref) { resolved.set(m[1], row.result_ref); out.push(row.result_ref); continue; }
      out.push(seg); // référence inconnue : conservée telle quelle → liste blanche → refus honnête
      continue;
    }
    // Référence locale : identifiant opaque hors format UUID, connu du serveur via entity_ref.
    if (/^[A-Za-z0-9_-]{8,64}$/.test(seg) && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) {
      const hit = resolved.get(seg);
      if (hit) { out.push(hit); continue; }
      const row = (await query<{ result_ref: string }>(
        'select result_ref from sync_applied_ops where organization_id=$1 and entity_ref=$2 limit 1',
        [orgId, seg]
      )).rows[0];
      if (row?.result_ref) { resolved.set(seg, row.result_ref); out.push(row.result_ref); continue; }
    }
    out.push(seg);
  }
  return out.join('/') + (queryString ? `?${queryString}` : '');
}

/** Substitue les références locales "@ref:x" par les identifiants serveur déjà résolus. */
function substitute(payload: unknown, resolved: Map<string, string>): unknown {
  if (typeof payload === 'string') {
    const m = REF_RE.exec(payload);
    if (m) return resolved.get(m[1]) ?? payload; // non résolue → la route refusera (honnête)
    return payload;
  }
  if (Array.isArray(payload)) return payload.map(v => substitute(v, resolved));
  if (payload && typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) out[k] = substitute(v, resolved);
    return out;
  }
  return payload;
}

/** Cherche l'identifiant serveur créé dans la réponse de la route rejouée (id du corps ou d'un objet enfant). */
function extractResultRef(bodyText: string): string {
  try {
    const body = JSON.parse(bodyText);
    const find = (node: unknown, depth = 0): string => {
      if (depth > 2 || !node || typeof node !== 'object') return '';
      if (Array.isArray(node)) return node.length ? find(node[0], depth + 1) : '';
      const rec = node as Record<string, unknown>;
      for (const key of ['id', 'documentId']) {
        const v = rec[key];
        if (typeof v === 'string' && v && v.length <= 80) return v;
      }
      for (const v of Object.values(rec)) { const found = find(v, depth + 1); if (found) return found; }
      return '';
    };
    return find(body);
  } catch { return ''; }
}

const entityFromPath = (path: string) => (path.split('?')[0].match(/^\/([^/]+)/)?.[1] ?? '').slice(0, 60);

export type OpResult = { opId: string; status: 'applied' | 'conflict' | 'blocked' | 'retry' | 'duplicate'; resultRef?: string; error?: string; duplicate?: boolean };

/** Applique une série d'opérations dans l'ordre transmis (l'appareil garantit l'ordre des dépendances). */
export async function applySyncOps(app: { inject: (opts: Record<string, unknown>) => Promise<{ statusCode: number; body: string; json: () => unknown }> }, orgId: string, authHeader: string, ops: SyncOp[]): Promise<OpResult[]> {
  const results: OpResult[] = [];
  const resolved = new Map<string, string>();
  const blockedRefs = new Set<string>();
  for (const op of ops) {
    // 1) Idempotence : une opération déjà appliquée rejoue son résultat enregistré.
    const prior = (await query<{ entity_ref: string; result_ref: string }>(
      'select entity_ref, result_ref from sync_applied_ops where organization_id=$1 and op_client_id=$2 limit 1',
      [orgId, op.opId]
    )).rows[0];
    if (prior) {
      if (op.localRef && prior.result_ref) resolved.set(op.localRef, prior.result_ref);
      results.push({ opId: op.opId, status: 'duplicate', duplicate: true, resultRef: prior.result_ref || undefined });
      continue;
    }
    // 2) Dépendance : une opération dont la source n'est pas appliquée est bloquée (jamais perdue).
    if (op.dependsOn) {
      const dep = (await query<{ result_ref: string }>(
        'select result_ref from sync_applied_ops where organization_id=$1 and op_client_id=$2 limit 1',
        [orgId, op.dependsOn]
      )).rows[0];
      if (!dep || (op.dependsOn && blockedRefs.has(op.dependsOn))) {
        blockedRefs.add(op.opId);
        results.push({ opId: op.opId, status: 'blocked', error: 'DEPENDENCY_NOT_APPLIED' });
        continue;
      }
    }
    if (op.localRef && blockedRefs.has(op.localRef)) { blockedRefs.add(op.opId); results.push({ opId: op.opId, status: 'blocked', error: 'DEPENDENCY_NOT_APPLIED' }); continue; }
    // 3) Chemin autorisé uniquement (jamais d'administration/billing/auth via le rejeu).
    // Les références locales dans le chemin sont d'abord substituées par les identifiants réels.
    const opPath = await rewritePathRefs(op.path, orgId, resolved);
    const basePath = opPath.split('?')[0];
    if (!ALLOWED_PATH_PATTERNS.some(re => re.test(basePath))) {
      results.push({ opId: op.opId, status: 'blocked', error: 'PATH_NOT_ALLOWED' });
      continue;
    }
    // 4) Rejeu de la route réelle, authentifié par le même jeton (même utilisateur, même tenant).
    // Content-Type JSON seulement s'il y a un corps : Fastify refuse un corps vide avec ce type
    // (les DELETE sans corps échoueraient sinon).
    let res: { statusCode: number; body: string };
    try {
      const payload = op.method === 'DELETE' ? undefined : substitute(op.payload, resolved);
      const headers: Record<string, string> = { authorization: authHeader };
      if (payload !== undefined) headers['content-type'] = 'application/json';
      res = await app.inject({ method: op.method, url: opPath, headers, payload });
    } catch {
      results.push({ opId: op.opId, status: 'retry', error: 'REPLAY_FAILED' });
      continue;
    }
    const resultRef = extractResultRef(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      await query(
        `insert into sync_applied_ops(organization_id, op_client_id, kind, entity, entity_ref, result_ref) values($1,$2,$3,$4,$5,$6) on conflict (organization_id, op_client_id) do nothing`,
        [orgId, op.opId, op.kind, entityFromPath(opPath), op.localRef, resultRef]
      );
      if (op.localRef && resultRef) resolved.set(op.localRef, resultRef);
      results.push({ opId: op.opId, status: 'applied', resultRef: resultRef || undefined });
    } else if (res.statusCode === 409) {
      // Conflit réel côté serveur : conservé comme décision exécutée en conflit (versions gardées).
      await query(
        `insert into sync_applied_ops(organization_id, op_client_id, kind, entity, entity_ref, result_ref) values($1,$2,$3,$4,$5,$6) on conflict (organization_id, op_client_id) do nothing`,
        [orgId, op.opId, op.kind, entityFromPath(opPath), op.localRef, resultRef]
      );
      results.push({ opId: op.opId, status: 'conflict', error: 'CONFLICT', resultRef: resultRef || undefined });
    } else if (res.statusCode >= 400 && res.statusCode < 500) {
      const err = (() => { try { const b = res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {}; return String(b.error || 'REJECTED'); } catch { return 'REJECTED'; } })();
      blockedRefs.add(op.opId);
      results.push({ opId: op.opId, status: 'blocked', error: err });
    } else {
      // 5xx : transitoire — PAS enregistré comme appliqué ; l'appareil reprendra (backoff).
      results.push({ opId: op.opId, status: 'retry', error: 'SERVER_ERROR' });
    }
  }
  return results;
}
