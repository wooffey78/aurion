-- Aurion 15.4.35 : traitement effectif (numérotée 089 dans la séquence fusionnée) des demandes de suppression de compte (prompt §5.4/§5.5).
-- Migration strictement additive et idempotente : aucune colonne existante n'est modifiée,
-- aucune donnée n'est réécrite. Les colonnes ajoutées complètent 085 pour la traçabilité
-- administrative (opérateur, référence d'audit non sensible, motif de rejet, planification).
alter table account_deletion_requests add column if not exists scheduled_at timestamptz;
alter table account_deletion_requests add column if not exists processed_by uuid;
alter table account_deletion_requests add column if not exists audit_reference varchar(40);
alter table account_deletion_requests add column if not exists rejection_reason text;

-- Statuts explicités au niveau applicatif ; la contrainte est NOT VALID pour ne pas
-- réécrire ni bloquer des lignes historiques, et idempotente si rejouée.
alter table account_deletion_requests drop constraint if exists account_deletion_requests_status_chk;
alter table account_deletion_requests add constraint account_deletion_requests_status_chk
  check (status in ('pending','processing','processed','cancelled','rejected')) not valid;

-- La suppression d'un utilisateur ne doit pas perdre la preuve qu'une demande a été
-- traitée (prompt §3.3) : la table account_deletion_requests cascadait avec users(id).
-- Cette table d'audit conserve la trace minimale (jamais le contenu personnel) après
-- l'effacement du compte : empreinte SHA-256 de l'adresse, dates, statut final,
-- opérateur, référence d'audit et décompte des espaces traités.
create table if not exists account_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  email_hash char(64) not null,
  source varchar(20) not null,
  requested_at timestamptz not null,
  processed_at timestamptz,
  processed_by uuid,
  audit_reference varchar(40) not null,
  final_status varchar(20) not null,
  organizations_closed integer not null default 0,
  organizations_left integer not null default 0,
  sessions_revoked integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists account_deletion_audit_request_idx on account_deletion_audit(request_id);
create index if not exists account_deletion_audit_reference_idx on account_deletion_audit(audit_reference);
