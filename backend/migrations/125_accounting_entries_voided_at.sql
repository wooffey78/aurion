-- 15.5.0 — contrat SQL des écritures comptables annulées.
--
-- L’annulation d’un règlement ne supprime plus l’écriture : elle la retire du périmètre actif
-- en renseignant `voided_at`. Les rapports et exports comptables filtrent déjà cette colonne
-- (`voided_at is null`), mais le schéma historique ne la créait pas. Sur une base neuve, ces
-- requêtes échouaient donc avec `column "voided_at" does not exist`.
--
-- Migration strictement additive et idempotente : aucune donnée existante n’est modifiée,
-- aucune écriture historique n’est marquée annulée rétroactivement.
alter table if exists accounting_entries
  add column if not exists voided_at timestamptz;

comment on column accounting_entries.voided_at is
  'Date d’annulation logique de l’écriture. NULL = écriture active ; une écriture annulée reste conservée pour l’audit et les corrections de règlement.';

-- Index partiel : les lectures courantes (journal, rapports, exports) ne parcourent que les
-- écritures actives. L’index reste petit même après plusieurs années de corrections.
create index if not exists idx_accounting_entries_active
  on accounting_entries(organization_id, activity_id, entry_date desc)
  where voided_at is null;
