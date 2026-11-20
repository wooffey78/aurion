-- Aurion 15.3.0 : parcours guidé, suivi administratif et adresses d'intervention multiples.
-- Migration additive : aucune migration historique ni aucun document émis n'est réécrit.

create table if not exists onboarding_journeys (
  organization_id uuid primary key references organizations(id) on delete cascade,
  status varchar(20) not null default 'in_progress' check (status in ('not_started','in_progress','paused','completed')),
  current_step smallint not null default 1 check (current_step between 1 and 7),
  business_status varchar(20) check (business_status in ('existing','to_create')),
  data jsonb not null default '{}'::jsonb,
  first_redirect_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dashboard_journal_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_type varchar(60) not null,
  title varchar(240) not null,
  description text not null default '',
  severity varchar(20) not null default 'info' check (severity in ('action','info','warning','error','success')),
  source varchar(60) not null default 'journey',
  internal_path varchar(500),
  external_url text,
  dedupe_key varchar(240) not null,
  is_read boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, dedupe_key)
);
create index if not exists idx_dashboard_journal_org_date on dashboard_journal_events(organization_id, resolved_at, is_read, created_at desc);

create table if not exists administrative_formalities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid references activities(id) on delete set null,
  title varchar(240) not null,
  organization_name varchar(180),
  category varchar(80) not null default 'to_verify',
  applicability varchar(24) not null default 'to_verify' check (applicability in ('applicable','potentially_applicable','not_applicable','missing_information','to_verify')),
  status varchar(36) not null default 'to_verify' check (status in ('to_complete','missing_information','ready_to_prepare','to_do','awaiting_user_send','sent','awaiting_response','response_received','action_required','to_correct','validated_by_evidence','completed','not_applicable','to_verify')),
  official_url text,
  source_label varchar(240),
  source_checked_at timestamptz,
  certainty varchar(20) not null default 'low' check (certainty in ('low','medium','high')),
  missing_information jsonb not null default '[]'::jsonb,
  prerequisites jsonb not null default '[]'::jsonb,
  next_action text,
  rationale text,
  notes text,
  prepared_email jsonb,
  provider_message_id text,
  manual_evidence text,
  declared_completed_at timestamptz,
  proven_completed_at timestamptz,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_admin_formalities_org_status on administrative_formalities(organization_id, status, updated_at desc);

-- Verrou/idempotence d'envoi : une même préparation ne peut déclencher deux envois concurrents.
create table if not exists administrative_mail_send_locks (
  organization_id uuid not null references organizations(id) on delete cascade,
  formality_id uuid primary key references administrative_formalities(id) on delete cascade,
  status varchar(16) not null check (status in ('sending','sent','uncertain')),
  message_id varchar(240),
  attempted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,formality_id)
);
create index if not exists idx_admin_mail_send_locks_org on administrative_mail_send_locks(organization_id,status,updated_at desc);

create table if not exists administrative_document_links (
  organization_id uuid not null references organizations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  formality_id uuid references administrative_formalities(id) on delete set null,
  purpose varchar(80) not null default 'administrative_support',
  created_at timestamptz not null default now(),
  primary key (organization_id, document_id)
);
create index if not exists idx_admin_document_formality on administrative_document_links(organization_id, formality_id, created_at desc);

create table if not exists administrative_mail_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  formality_id uuid references administrative_formalities(id) on delete set null,
  provider varchar(24) not null,
  provider_message_id varchar(240) not null,
  thread_id varchar(240),
  sender text,
  subject text,
  received_at timestamptz,
  category varchar(40) not null default 'uncategorized' check (category in ('acknowledgement','filing_confirmation','document_request','correction_request','fees','appointment','processing_confirmation','decision','possible_rejection','uncategorized')),
  confidence numeric(4,3) not null default 0,
  minimal_excerpt text,
  safe_open_url text,
  user_confirmed boolean,
  created_at timestamptz not null default now(),
  unique(organization_id, provider, provider_message_id)
);
create index if not exists idx_admin_mail_org_received on administrative_mail_items(organization_id, received_at desc);

create table if not exists client_intervention_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  label varchar(120),
  address varchar(1000) not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, organization_id, client_id)
);
create index if not exists idx_client_intervention_addresses_client on client_intervention_addresses(organization_id, client_id, is_active, is_default desc, created_at);
create unique index if not exists uq_client_intervention_default on client_intervention_addresses(client_id) where is_default = true and is_active = true;

-- Préserve la donnée historique : l'adresse actuellement enregistrée devient la première adresse par défaut.
insert into client_intervention_addresses(organization_id, client_id, label, address, is_default)
select c.organization_id, c.id, 'Adresse principale', c.intervention_address, true
from clients c
where nullif(trim(c.intervention_address), '') is not null
  and not exists (select 1 from client_intervention_addresses a where a.client_id=c.id and a.is_active=true);

-- Snapshot d'adresse d'intervention pour que les documents historiques ne changent jamais après édition/suppression.
alter table quotes add column if not exists intervention_address_id uuid;
alter table quotes add column if not exists intervention_address_snapshot text;
create index if not exists idx_quotes_intervention_address on quotes(organization_id, intervention_address_id) where intervention_address_id is not null;

-- Les champs de signature restent compatibles : les nouvelles options sont additives.
alter table email_signatures add column if not exists signature_html text;
alter table email_signatures add column if not exists signature_text text;
alter table email_signatures add column if not exists include_quotes boolean not null default true;
alter table email_signatures add column if not exists include_invoices boolean not null default true;
alter table email_signatures add column if not exists include_professional boolean not null default true;

-- Journal d'événements : aucun événement ancien ou document émis n'est supprimé.

alter table administrative_formalities add column if not exists provider_thread_id text;
alter table administrative_formalities add column if not exists expected_sender_domain varchar(255);
alter table administrative_formalities add column if not exists reference_tokens jsonb not null default '[]'::jsonb;

create table if not exists administrative_mail_connections (
  organization_id uuid primary key references organizations(id) on delete cascade,
  google_email varchar(254),
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  last_sync_at timestamptz,
  last_sync_error varchar(160),
  locked_until timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Les entreprises historiques ne sont jamais enrôlées de force dans le parcours.
-- Une simple note apparaît dans le journal Aurion si leur configuration est toujours incomplète.
insert into dashboard_journal_events(organization_id,event_type,title,description,severity,source,internal_path,dedupe_key)
select o.id,'configuration_incomplete','Configuration à compléter',
       'Certains éléments de la fiche entreprise restent à vérifier. Vous pouvez reprendre le guide ou modifier les paramètres manuellement.',
       'action','migration','/onboarding?step=2','legacy-configuration-incomplete'
from organizations o
where coalesce(o.configuration_incomplete,true)=true
on conflict(organization_id,dedupe_key) do nothing;

create table if not exists administrative_mail_oauth_states (
  state_hash varchar(64) primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  purpose varchar(16) not null default 'read' check (purpose in ('read','send')),
  created_at timestamptz not null default now()
);
alter table administrative_mail_oauth_states add column if not exists purpose varchar(16) not null default 'read';
create table if not exists administrative_mail_send_connections (
  organization_id uuid primary key references organizations(id) on delete cascade,
  google_email varchar(254),
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table administrative_mail_connections add column if not exists sync_page_token text;
