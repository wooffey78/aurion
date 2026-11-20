-- 075 — Boîte de réception des factures fournisseurs électroniques (bloc 3, plateforme agréée).
-- Additive et idempotente : ré-exécutable sans erreur sur une base déjà migrée.
--
-- Principe (bloc 3 du cahier des charges) : Aurion est un logiciel de gestion/facturation
-- compatible connecté à une plateforme agréée (PA) choisie par l'entrepreneur — il n'est pas
-- lui-même une PA et ne transmet rien à l'administration fiscale. La réception des factures
-- fournisseurs transite par un webhook authentifié serveur-à-serveur (signature HMAC, horodatage,
-- tolérance anti-rejeu), avec idempotence par événement, détection des doublons de contenu,
-- archivage du fichier original sans altération, statuts de cycle de vie, journal d'événements
-- et reprise après erreur depuis la charge utile conservée.
--
-- Aucune écriture comptable irréversible n'est produite automatiquement : l'approbation d'une
-- facture reçue reste un geste utilisateur explicite (PATCH /pa/inbox/:id), journalisé.

-- 1) Points d'entrée webhook par organisation (URL + jeton à configurer dans la PA choisie).
create table if not exists pa_webhook_endpoints(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider varchar(60) not null,
  token uuid not null default gen_random_uuid(),
  active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Un point d'entrée actif par couple (organisation, plateforme) ; le jeton est l'élément secret
-- de l'URL (équivalent d'un identifiant de rappel, résolu côté serveur avant tout traitement).
create unique index if not exists uq_pa_endpoints_org_provider
  on pa_webhook_endpoints(organization_id, provider) where active;
create unique index if not exists uq_pa_endpoints_token on pa_webhook_endpoints(token);

-- 2) Registre d'idempotence des événements entrants : chaque (provider, event_id, organisation)
--    n'est traité qu'une fois, quel que soit le nombre de re-tentatives de la PA.
--    La charge utile validée est conservée pour permettre la reprise après erreur (bloc 3).
--    Type json (et non jsonb) : jsonb réordonne les clés, ce qui rendrait le contrôle
--    d'intégrité de la reprise (comparaison du digest canonique) instable ; le registre doit
--    refléter exactement le texte reçu.
create table if not exists pa_webhook_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider varchar(60) not null,
  event_id varchar(200) not null,
  endpoint_id uuid references pa_webhook_endpoints(id) on delete set null,
  event_type varchar(120) not null,
  payload json,
  payload_sha256 char(64) not null,
  status varchar(20) not null default 'received',
  error_code varchar(80),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index if not exists uq_pa_events_provider_event_org
  on pa_webhook_events(provider, event_id, organization_id);
create index if not exists idx_pa_events_org_status
  on pa_webhook_events(organization_id, status, received_at desc);

-- 3) Factures fournisseurs électroniques reçues (boîte de réception).
--    L'original est archivé dans le stockage privé de l'organisation, clé référencée par
--    original_storage_key, jamais modifié après écriture ; content_sha256 scelle le contenu.
create table if not exists supplier_electronic_invoices(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider varchar(60) not null,
  event_id varchar(200) not null,
  pa_invoice_id varchar(200),
  status varchar(20) not null default 'received',
  original_storage_key text,
  original_filename varchar(200),
  mime_type varchar(100),
  size_bytes bigint,
  content_sha256 char(64) not null,
  payload jsonb not null,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_match_status varchar(20) not null default 'unmatched',
  supplier_name varchar(180),
  supplier_siren varchar(9),
  supplier_siret varchar(14),
  invoice_number varchar(80),
  issue_date date,
  due_date date,
  currency char(3) not null default 'EUR',
  total_ht numeric(12,2) not null default 0,
  total_tva numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  accounting_category varchar(80),
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  duplicate_of uuid references supplier_electronic_invoices(id) on delete set null,
  error_code varchar(80),
  error_message text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_electronic_invoices_status_check
    check (status in ('received','duplicate','reviewed','approved','rejected')),
  constraint supplier_electronic_invoices_match_check
    check (supplier_match_status in ('unmatched','matched','ambiguous'))
);
create index if not exists idx_pa_inbox_org_status
  on supplier_electronic_invoices(organization_id, status, received_at desc);
create index if not exists idx_pa_inbox_org_digest
  on supplier_electronic_invoices(organization_id, provider, content_sha256);
create index if not exists idx_pa_inbox_supplier on supplier_electronic_invoices(supplier_id);

-- 4) Journal d'événements de la boîte de réception : traçabilité complète (réception, signature
--    invalide, doublon, stockage, erreur, correction, approbation, reprise…).
create table if not exists supplier_electronic_invoice_events(
  id bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid references supplier_electronic_invoices(id) on delete cascade,
  provider_event_id varchar(200),
  kind varchar(60) not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_pa_journal_org_created
  on supplier_electronic_invoice_events(organization_id, created_at desc);
create index if not exists idx_pa_journal_invoice
  on supplier_electronic_invoice_events(invoice_id, created_at desc);

-- 5) Isolation multi-tenant (RLS 074) : les quatre nouvelles tables portent organization_id et
--    portent la même politique tenant_isolation que les tables métier existantes. En l'absence
--    de contexte tenant, elles échouent fermé ; le webhook, sans session utilisateur, résout le
--    point d'entrée via le pool d'administration journalisé puis inscrit le contexte tenant
--    (withTenant) pour toute écriture métier.
do $$
declare
  t text;
  direct_tables text[] := array[
    'pa_webhook_endpoints','pa_webhook_events',
    'supplier_electronic_invoices','supplier_electronic_invoice_events'
  ];
begin
  foreach t in array direct_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
        with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
    $f$, t);
  end loop;
end
$$;
