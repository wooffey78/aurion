-- 077 — E-reporting : déclarations de données de transaction et de paiement (bloc 5,
--        plateforme agréée). Additive et idempotente : ré-exécutable sans erreur sur une
--        base déjà migrée.
--
-- Doctrine officielle vérifiée le 14 novembre 2026 (impots.gouv.fr, BOFiP ACTU-2026-00145 du
-- 30 septembre 2026) : l'e-reporting comprend DEUX composantes — les données de TRANSACTION
-- et les données de PAIEMENT. Sont notamment concernées : les ventes/prestations en relation
-- avec un non-assujetti (B2C) dues de TVA française, et les opérations B2B avec un assujetti
-- NON établi en France lorsque la TVA française est due. Sont notamment exclues : les
-- opérations exonérées de TVA (exportations, livraisons intracommunautaires, art. 261 à 261 E
-- du CGI dispensées de facturation), les importations de biens et les contrats défense/
-- sécurité. Échéances : 1er septembre 2026 (GE/ETI), 1er septembre 2027 (micro-entreprises et
-- PME, avec option d'anticipation). Les données de paiement portent : date de collecte,
-- montant collecté par taux de TVA, numéro de facture lorsque la TVA devient exigible au
-- paiement (services, acomptes). La périodicité suit le régime de TVA de l'entreprise
-- (mensuelle/trimestrielle), et non un dépôt quotidien facture par facture.
--
-- Principes (bloc 5 du cahier des charges) :
--   - AUCUNE inférence silencieuse : la catégorie d'acheteur (assujetti établi en France,
--     assujetti non établi, non-assujetti) et l'exonération sont DÉCLARÉES par l'utilisateur
--     (champs dédiés) et instantanées dans le document historique ; le moteur de matrice
--     classe à partir de ces déclarations, jamais à partir du seul type de facture.
--   - Le B2B domestique (assujetti établi en France) relève de l'ÉMISSION électronique
--     (bloc 4, UBL/CII via la PA) et NON de l'e-reporting : la matrice l'exclut avec motif.
--   - Une déclaration n'est JAMAIS marquée transmise sans accusé signé de la PA (même
--     garantie que le bloc 4 : seul un accusé authentifié règle l'état).
--   - Idempotence : identifiant de transmission STABLE entre re-tentatives (même contrat
--     sortant generic que le bloc 4, format « ereporting », X-Aurion-PA-Format).
--   - Corrections : une déclaration de correction référence la déclaration corrigée, fige
--     ses propres lignes recalculées à partir des données CORRIGÉES ; l'originale reste
--     archivée sans altération (aucune réécriture de l'historique).
--   - Rapport d'écarts : toute facture de la période non classifiable (données manquantes)
--     est listée explicitement ; la préparation REFUSE (422) tant qu'une facture n'est ni
--     classée ni explicitement exclue — jamais de donnée inventée ni de ligne omise en
--     silence.

-- 1) Classification déclarée de l'acheteur, côté client (tiers professionnel ou particulier).
--    Null = non renseigné : la matrice signale alors un écart (aucune classement automatique).
alter table clients add column if not exists buyer_category varchar(20);
alter table clients add column if not exists country_code varchar(2);
alter table clients add column if not exists vat_number varchar(32);
alter table clients drop constraint if exists clients_buyer_category_check;
alter table clients add constraint clients_buyer_category_check
  check (buyer_category is null or buyer_category in ('assujetti_fr','assujetti_etranger','non_assujetti'));
alter table clients drop constraint if exists clients_country_code_check;
alter table clients add constraint clients_country_code_check
  check (country_code is null or country_code ~ '^[A-Z]{2}$');

-- 2) Exonération déclarée sur la facture (instantané du document historique, comme les
--    mentions électroniques du bloc 4). Motif obligatoire lorsque exonération déclarée.
alter table quotes add column if not exists ereporting_exempt boolean not null default false;
alter table quotes add column if not exists ereporting_exempt_reason varchar(200);
alter table quotes drop constraint if exists quotes_ereporting_exempt_reason_check;
alter table quotes add constraint quotes_ereporting_exempt_reason_check
  check (ereporting_exempt = false or (ereporting_exempt_reason is not null and length(btrim(ereporting_exempt_reason)) > 0));

-- 3) Déclarations e-reporting : une déclaration couvre une PÉRIODE (mensuelle ou
--    trimestrielle, selon le régime de TVA de l'entreprise). Cycle de vie :
--    prepared -> submitted -> accepted | rejected | timeout.
--    « timeout » = « issue non confirmée » : aucune donnée n'a été acquittée par la PA ;
--    la déclaration reste réglementairement non transmise tant qu'aucun accusé signé
--    n'est archivé.
create table if not exists ereporting_declarations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind varchar(12) not null default 'initial',
  corrects_declaration_id uuid references ereporting_declarations(id) on delete set null,
  period_start date not null,
  period_end date not null,
  periodicity varchar(10) not null default 'monthly',
  status varchar(20) not null default 'prepared',
  payload_storage_key text,
  payload_filename varchar(200),
  payload_mime varchar(100) not null default 'application/json',
  payload_sha256 char(64),
  ack_storage_key text,
  ack_filename varchar(200),
  ack_mime varchar(100),
  ack_sha256 char(64),
  pa_transmission_id varchar(80),
  pa_reference varchar(200),
  rejection_code varchar(80),
  rejection_message text,
  error_code varchar(80),
  error_message text,
  transaction_count integer not null default 0,
  payment_count integer not null default 0,
  total_ht numeric(14,2) not null default 0,
  total_vat numeric(14,2) not null default 0,
  total_ttc numeric(14,2) not null default 0,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  submitted_at timestamptz,
  settled_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ereporting_kind_check check (kind in ('initial','correction')),
  constraint ereporting_periodicity_check check (periodicity in ('monthly','quarterly')),
  constraint ereporting_status_check
    check (status in ('prepared','submitted','accepted','rejected','timeout')),
  constraint ereporting_period_order_check check (period_end >= period_start),
  constraint ereporting_correction_ref_check
    check (kind = 'initial' or (kind = 'correction' and corrects_declaration_id is not null))
);
-- Une seule déclaration ouverte (préparée ou en vol) par organisation/période/kind :
-- garantie anti-doublon au niveau du schéma ; les déclarations réglées restent consultables.
create unique index if not exists uq_ereporting_open
  on ereporting_declarations(organization_id, period_start, period_end, kind)
  where status in ('prepared','submitted');
create index if not exists idx_ereporting_org_status
  on ereporting_declarations(organization_id, status, period_start desc);

-- 4) Lignes figées d'une déclaration : données de transaction (une ligne par facture de la
--    période classée en périmètre) et données de paiement (une ligne par paiement de la
--    période sur les factures en périmètre TVA exigible à l'encaissement). Les lignes sont
--    scellées à la préparation : une correction recrée ses propres lignes, jamais une
--    réécriture de celles de la déclaration originale.
create table if not exists ereporting_lines(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  declaration_id uuid not null references ereporting_declarations(id) on delete cascade,
  line_number integer not null,
  source_kind varchar(12) not null,
  quote_id uuid references quotes(id) on delete set null,
  invoice_number varchar(40),
  transaction_date date,
  transaction_category varchar(8),
  buyer_name varchar(180),
  buyer_category varchar(20),
  buyer_country varchar(2),
  buyer_vat_number varchar(32),
  vat_rate numeric(5,2),
  amount_ht numeric(14,2) not null default 0,
  amount_vat numeric(14,2) not null default 0,
  amount_ttc numeric(14,2) not null default 0,
  payment_date date,
  payment_amount numeric(14,2),
  payment_method varchar(20),
  inclusion_reason varchar(40) not null,
  constraint ereporting_line_source_check check (source_kind in ('transaction','payment')),
  constraint ereporting_line_reason_check check (inclusion_reason in
    ('b2c_domestic_transaction','b2b_international_transaction',
     'b2c_domestic_payment','b2b_international_payment')),
  constraint ereporting_line_category_check
    check (transaction_category is null or transaction_category in ('LB','PS','LBPS'))
);
create index if not exists idx_ereporting_lines_declaration
  on ereporting_lines(organization_id, declaration_id, source_kind, line_number);
create index if not exists idx_ereporting_lines_quote
  on ereporting_lines(organization_id, quote_id);

-- 5) Journal des déclarations : traçabilité complète (préparation, correction, envoi,
--    accusé accepté/rejeté, transport indisponible, re-tentative…), horodaté.
create table if not exists ereporting_events(
  id bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  declaration_id uuid references ereporting_declarations(id) on delete cascade,
  kind varchar(60) not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ereporting_events_org_created
  on ereporting_events(organization_id, created_at desc);
create index if not exists idx_ereporting_events_declaration
  on ereporting_events(declaration_id, created_at desc);

-- 6) Isolation multi-tenant (RLS 074) : les trois nouvelles tables portent organization_id et
--    la même politique tenant_isolation que les tables métier existantes (échec fermé sans
--    contexte). Les clients et quotes existantes sont déjà couvertes depuis 074/076.
do $$
declare
  t text;
  direct_tables text[] := array[
    'ereporting_declarations','ereporting_lines','ereporting_events'
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
