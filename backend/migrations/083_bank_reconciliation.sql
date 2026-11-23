-- Bloc 25 — Rapprochement bancaire (optionnel, décision D5 : défaut = IMPORT DE FICHIERS).
-- Aucun agrégateur bancaire, aucun ordre de paiement sortant : l'entrepreneur importe ses
-- relevés (CSV ou OFX) ; chaque rapprochement est validé par lui et peut être annulé ;
-- les écarts sont LISTÉS et jamais résolus silencieusement.
create table if not exists bank_import_configs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name varchar(120) not null,
  column_mapping jsonb not null,
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);

create table if not exists bank_transactions(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  value_date date not null,
  amount numeric(12,2) not null,
  label varchar(500) not null default '',
  external_ref varchar(200),
  fingerprint varchar(64) not null,
  source_file varchar(240) not null default '',
  status varchar(20) not null default 'unmatched' check (status in ('unmatched','matched','ignored')),
  matched_payment_id uuid references invoice_payments(id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id, fingerprint)
);
create index if not exists idx_bank_transactions_org on bank_transactions(organization_id, status, value_date);

-- Isolation multi-tenant (bloc 2).
do $$
declare t text;
begin
  foreach t in array array['bank_import_configs','bank_transactions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
        with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
    $f$, t);
  end loop;
end $$;
