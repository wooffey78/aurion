// Bloc 1 — bootstrap hors connexion unique du tableau de bord.
// Résout l'identité authentifiée UNE fois (promesse partagée), puis initialise dans le MÊME
// espace de noms : file outbox, réplication (sync-manager) et documents récents. Le tableau de
// bord ATTEND ce bootstrap avant d'accepter une écriture hors connexion — plus jamais de
// `setOutboxOwner()` sans identité (défaut §2.2-1 corrigé). Renvoie l'identité ou null ; ne
// lève jamais (l'app en ligne doit continuer de fonctionner sans stockage persistant).
import { getIdentity } from './session-identity.js';
import { setOutboxOwner } from './outbox.js';
import { setSyncOwner } from './sync-manager.js';
import { setDocumentsOwner } from './recent-documents.js';

let done = null;
export function bootstrapOffline() {
  if (!done) {
    done = (async () => {
      const identity = await getIdentity();
      if (!identity) return null;
      await Promise.all([setOutboxOwner(identity), setSyncOwner(identity), setDocumentsOwner(identity)]);
      return identity;
    })().catch(() => null);
  }
  return done;
}
