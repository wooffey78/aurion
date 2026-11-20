-- Aurion 15.4.36 : traitement transactionnel, verrouillé et contrôlable des demandes de
-- suppression de compte (P1). Migration strictement additive et idempotente : aucune
-- colonne existante n'est modifiée, aucune donnée n'est réécrite.
--
-- processing_started_at : bail de traitement (un opérateur ne peut pas traiter une demande
--   déjà réservée par un autre avant expiration du bail de 30 minutes).
-- attempts / last_step / last_error : reprise contrôlée étape par étape, diagnostic visible
--   dans la console d'administration.
alter table account_deletion_requests add column if not exists processing_started_at timestamptz;
alter table account_deletion_requests add column if not exists attempts integer not null default 0;
alter table account_deletion_requests add column if not exists last_error text;
alter table account_deletion_requests add column if not exists last_step varchar(40);

create index if not exists account_deletion_requests_processing_idx
  on account_deletion_requests(status, processing_started_at) where status = 'processing';
