-- 076 — Émission de factures électroniques : mentions obligatoires du 1er septembre 2026
--        et cycle de vie de transmission (bloc 4, plateforme agréée).
-- Additive et idempotente : ré-exécutable sans erreur sur une base déjà migrée.
--
-- Principe (bloc 4 du cahier des charges) : produire des factures structurées conformes
-- (UBL 2.1 / CII D16B profil Factur-X BASIC) et les transmettre via une plateforme agréée
-- avec accusés vérifiables. Une facture n'est JAMAIS marquée « transmise » sans confirmation
-- réelle de la PA : l'état applicatif reflète uniquement les accusés archivés.
--
-- Les quatre mentions applicables depuis le 1er septembre 2026 (art. 242 ter I CGI,
-- cf. economie.gouv.fr « tout savoir sur la facturation électronique ») :
--   1. le numéro SIREN du client                              -> quotes.einvoice_buyer_siren
--   2. la catégorie de l'opération (BT-23) : LB / PS / LBPS   -> quotes.einvoice_operation_category
--   3. l'option pour le paiement de la TVA sur les débits     -> quotes.einvoice_vat_on_payment
--      (mention « le cas échéant »)
--   4. l'adresse complète de livraison si différente          -> quotes.einvoice_delivery_address
--      de l'adresse de facturation

-- 1) Mentions électroniques sur les devis/factures (instantané du document, comme
--    billing_address_snapshot : les mentions restent figées dans le document historique).
alter table quotes add column if not exists einvoice_operation_category varchar(8);
alter table quotes add column if not exists einvoice_vat_on_payment boolean not null default false;
alter table quotes add column if not exists einvoice_delivery_address varchar(500);
alter table quotes add column if not exists einvoice_buyer_siren varchar(9);
alter table quotes drop constraint if exists quotes_einvoice_operation_category_check;
alter table quotes add constraint quotes_einvoice_operation_category_check
  check (einvoice_operation_category is null
         or einvoice_operation_category in ('LB','PS','LBPS'));
alter table quotes drop constraint if exists quotes_einvoice_buyer_siren_check;
alter table quotes add constraint quotes_einvoice_buyer_siren_check
  check (einvoice_buyer_siren is null or einvoice_buyer_siren ~ '^\d{9}$');

-- 2) Points d'entrée d'émission par organisation : URL du service d'émission de la PA choisie
--    + secret de signature partagé, chiffré AES-256-GCM (services/secrets.ts), jamais stocké
--    en clair ni journalisé. Configuré explicitement par l'organisation (owner/admin).
create table if not exists pa_outgoing_endpoints(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider varchar(60) not null,
  base_url text not null,
  secret_encrypted text not null,
  identifier varchar(120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_pa_out_endpoints_org_provider
  on pa_outgoing_endpoints(organization_id, provider) where active;

-- 3) Transmissions électroniques sortantes : un enregistrement par facture émise, portant le
--    document structuré archivé (XML dans le stockage privé, clé référencée, SHA-256 scellé),
--    l'identifiant d'idempotence transmis à la PA (stable entre les re-tentatives : une reprise
--    après timeout ne peut JAMAIS créer de doublon côté PA), et le cycle de vie
--    prepared -> submitted -> accepted | rejected | timeout.
--    « timeout » signifie « issue non confirmée » : aucune donnée n'a été acquittée par la PA ;
--    le statut réglementaire de la facture reste « non transmise » tant qu'aucun accusé signé
--    n'est archivé.
create table if not exists outgoing_electronic_invoices(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  format varchar(8) not null,
  pa_transmission_id varchar(80) not null,
  status varchar(20) not null default 'prepared',
  payload_storage_key text not null,
  payload_filename varchar(200) not null,
  payload_mime varchar(100) not null default 'application/xml',
  payload_sha256 char(64) not null,
  ack_storage_key text,
  ack_filename varchar(200),
  ack_mime varchar(100),
  ack_sha256 char(64),
  pa_reference varchar(200),
  rejection_code varchar(80),
  rejection_message text,
  error_code varchar(80),
  error_message text,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  submitted_at timestamptz,
  settled_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outgoing_ei_status_check
    check (status in ('prepared','submitted','accepted','rejected','timeout')),
  constraint outgoing_ei_format_check
    check (format in ('ubl','cii'))
);
-- Une seule transmission active (préparée ou en vol) par facture : garantie anti-doublon au
-- niveau du schéma, sans empêcher la consultation des transmissions réglées historiques.
create unique index if not exists uq_outgoing_ei_open
  on outgoing_electronic_invoices(organization_id, quote_id)
  where status in ('prepared','submitted');
create index if not exists idx_outgoing_ei_org_status
  on outgoing_electronic_invoices(organization_id, status, created_at desc);
create index if not exists idx_outgoing_ei_quote
  on outgoing_electronic_invoices(organization_id, quote_id);

-- 4) Journal des transmissions : traçabilité complète (préparation, régénération, envoi,
--    accusé accepté/rejeté, transport indisponible, re-tentative…), horodaté, non modifiable
--    par l'application au-delà des insertions.
create table if not exists outgoing_transmission_events(
  id bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  transmission_id uuid references outgoing_electronic_invoices(id) on delete cascade,
  quote_id uuid references quotes(id) on delete cascade,
  kind varchar(60) not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_outgoing_events_org_created
  on outgoing_transmission_events(organization_id, created_at desc);
create index if not exists idx_outgoing_events_transmission
  on outgoing_transmission_events(transmission_id, created_at desc);

-- 5) Isolation multi-tenant (RLS 074) : les trois nouvelles tables portent organization_id et
--    la même politique tenant_isolation que les tables métier existantes (échec fermé sans
--    contexte). Total : 65 politiques (15.4.2) + 3 nouvelles = 68 politiques vérifiées par test.
do $$
declare
  t text;
  direct_tables text[] := array[
    'pa_outgoing_endpoints','outgoing_electronic_invoices','outgoing_transmission_events'
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
