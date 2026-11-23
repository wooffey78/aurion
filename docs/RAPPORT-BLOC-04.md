# RAPPORT-BLOC-04 — Outbox métier : intentions e-mail et rendu de documents, chaîne complète (15.4.32)

## Objectif (prompt §5-BLOC 4)
Rejeu automatique sans seconde validation ; chaîne client→devis→facture numérotée→PDF→e-mail ; intentions précises, réessayables, jamais simulées.

## Constat (Bloc 0)
L'outbox existante (bail, `@ref`, ordre topologique, idempotence opId, bootstrap d'identité) est conforme et conservée. La liste blanche omettait l'intention d'envoi e-mail et le rendu de documents ; aucune chaîne E2E complète numérotée n'était testée.

## Changements
1. **`backend/src/services/sync-ops.ts`** — liste blanche étendue (2 motifs, examen droits/idempotence fait) :
   - `/communications/email/document` : la route réelle valide les droits (auth + organisation), l'existence du document, la présence d'un e-mail client, la configuration messagerie (`MAIL_NOT_CONFIGURED` précis), rend le PDF au moment du rejeu, horodate `sent_at` côté serveur et crée les garanties. Idempotence opId : jamais deux envois pour une même décision ; une perte de réponse après commit est absorbée par `sync_applied_ops`.
   - `/documents/render/(quote|invoice)/:id` : intention de rendu PDF/DOCX/ODT décidée hors connexion ; le serveur rend et stocke le document (droits + tenant vérifiés, idempotence opId).
2. **Test `bloc4-email` (dans `bloc4-sync-ops.test.mjs`)** — chaîne complète via `/sync/ops` :
   client → devis (`@ref`) → **conversion facture** (numérotation réglementaire SERVEUR `FAC-YYYY-NNNN` attribuée au rejeu) → **intention de rendu** (PDF stocké, `generated_documents.pdf_key`) → **intention e-mail** sans messagerie configurée : **jamais « appliqué »**, `sent_at` NULL, opération **réessayable** (non consommée dans `sync_applied_ops`) ; **rejeu de la conversion = même numéro, aucun doublon** (idempotence opId). **3/3 verts.**

## Découvertes honnêtes (documentées)
- Le PDF n'est rendu qu'au moment où la décision d'envoi/rendu s'exécute (la garde messagerie précède le rendu dans la route e-mail) : sans SMTP configuré, la décision e-mail reste bloquée-réessayable et le rendu passe par l'intention de rendu séparée — aucun faux statut « envoyé ».
- Les actes PA/e-reporting restent hors outbox tant qu'aucune PA réelle n'est connectée (Bloc 15) — aucune intention ne peut créer un faux « transmis ».

## Limites
L'envoi e-mail réel (SMTP configuré) et le parcours complet jusqu'au reçu nécessitent la configuration Brevo de l'éditeur (Bloc 16) : le test prouve la chaîne jusqu'au refus précis et réessayable, pas un envoi réel.

## Actions éditeur
Aucune pour ce bloc (Bloc 16 pour la messagerie réelle).

## Confirmation
Aucun push, aucun déploiement, aucune dépense, aucune donnée réelle.

## État du bloc : **validé** (chaîne E2E testée sans seconde confirmation ni doublon ; intentions précises).
