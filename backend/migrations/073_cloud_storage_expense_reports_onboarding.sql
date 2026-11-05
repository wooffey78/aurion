-- Aurion 15.4.0 — Stockage documentaire dans le cloud personnel (Google Drive),
-- notes de frais, parcours d'accueil repensé et rétractation dans « Mon compte ».
-- Migration strictement additive et idempotente : aucune table, colonne ou donnée existante
-- n'est supprimée ni réécrite. Retour arrière : voir docs/CLOUD-STOCKAGE-15.4.0.md (§ Retour arrière).

-- 1. Fonction de l'utilisateur (étape « Vous » du parcours, reprise dans la signature et « Mon compte »).
alter table users add column if not exists job_title varchar(160);

-- 2. Connexion au cloud personnel : distincte de la connexion Google « messagerie & agenda ».
create table if not exists cloud_connections (
  organization_id uuid primary key references organizations(id) on delete cascade,
  provider varchar(24) not null default 'google_drive' check (provider in ('google_drive')),
  account_email varchar(254),
  status varchar(24) not null default 'connected' check (status in ('connected','revoked','error','disconnected')),
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text,
  root_folder_id varchar(200),
  quota_limit_bytes bigint,
  quota_usage_bytes bigint,
  quota_drive_usage_bytes bigint,
  quota_trash_usage_bytes bigint,
  quota_aurion_usage_bytes bigint,
  quota_checked_at timestamptz,
  quota_error varchar(80),
  quota_level varchar(16) not null default 'ok' check (quota_level in ('ok','warning','alert','critical','full','unknown')),
  last_error_code varchar(80),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cloud_oauth_states (
  state varchar(120) primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  return_path varchar(200) not null default '/dashboard',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cloud_oauth_states_expiry on cloud_oauth_states(expires_at);

-- Identifiants distants des dossiers : la création de l'arborescence est idempotente.
create table if not exists cloud_folders (
  organization_id uuid not null references organizations(id) on delete cascade,
  provider varchar(24) not null default 'google_drive',
  folder_key varchar(60) not null,
  remote_id varchar(200) not null,
  name varchar(200) not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz not null default now(),
  primary key (organization_id, provider, folder_key)
);

-- Métadonnées documentaires : le fichier original reste dans le cloud personnel.
create table if not exists cloud_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider varchar(24) not null default 'google_drive',
  client_ref varchar(80) not null,
  business_ref varchar(160),
  source_kind varchar(30) not null default 'file' check (source_kind in ('file','quote','invoice','expense_receipt','accounting_export','other')),
  source_id uuid,
  folder_key varchar(60) not null,
  file_name varchar(255) not null,
  mime_type varchar(120) not null,
  size_bytes bigint not null default 0,
  sha256 char(64),
  remote_id varchar(200),
  remote_md5 varchar(64),
  remote_version bigint,
  version integer not null default 1,
  status varchar(20) not null default 'pending' check (status in ('pending','syncing','synced','error','conflict')),
  error_code varchar(80),
  locked boolean not null default false,
  supersedes_id uuid references cloud_documents(id) on delete set null,
  uploaded_by uuid references users(id) on delete set null,
  device_label varchar(120),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, client_ref)
);
create index if not exists idx_cloud_documents_org_status on cloud_documents(organization_id, status, updated_at desc);
create index if not exists idx_cloud_documents_business_ref on cloud_documents(organization_id, business_ref);
create index if not exists idx_cloud_documents_source on cloud_documents(organization_id, source_kind, source_id);

-- Journal des opérations sensibles du cloud : jamais de jeton ni de contenu de document.
create table if not exists cloud_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action varchar(60) not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_cloud_audit_org_date on cloud_audit_events(organization_id, created_at desc);

-- 3. Notes de frais : comptabilité et trésorerie.
create table if not exists expense_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  spent_on date not null default current_date,
  label varchar(240) not null,
  category varchar(60) not null default 'autre',
  amount_ttc numeric(12,2) not null check (amount_ttc >= 0),
  vat_amount numeric(12,2) not null default 0 check (vat_amount >= 0),
  payment_method varchar(40),
  status varchar(20) not null default 'to_reimburse' check (status in ('to_reimburse','reimbursed','paid_by_company')),
  reimbursed_on date,
  notes text,
  receipt_name varchar(255),
  receipt_mime varchar(120),
  receipt_size bigint,
  receipt_sha256 char(64),
  receipt_client_ref varchar(80),
  cloud_document_id uuid references cloud_documents(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_reports_vat_le_ttc check (vat_amount <= amount_ttc)
);
create index if not exists idx_expense_reports_activity_date on expense_reports(organization_id, activity_id, spent_on desc);

-- 4. Rétractation consultable dans « Mon compte » : rattachement facultatif au compte.
alter table contract_withdrawal_requests add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table contract_withdrawal_requests add column if not exists user_id uuid references users(id) on delete set null;
create index if not exists idx_contract_withdrawal_user on contract_withdrawal_requests(user_id, submitted_at desc);

-- 5. Synchronisation multi-appareils : les nouvelles tables métier rejoignent la liste blanche.
DO $$
DECLARE t text;
BEGIN
  IF to_regprocedure('aurion_bump_account_sync()') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['expense_reports','cloud_documents','cloud_connections'] LOOP
      IF to_regclass(format('public.%I',t)) IS NOT NULL THEN
        EXECUTE format('DROP TRIGGER IF EXISTS aurion_account_sync_trigger ON public.%I',t);
        EXECUTE format('CREATE TRIGGER aurion_account_sync_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION aurion_bump_account_sync()',t);
      END IF;
    END LOOP;
  END IF;
END $$;
