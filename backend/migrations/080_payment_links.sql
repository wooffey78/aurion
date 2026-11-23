-- Bloc 13 — Paiement en ligne des factures clients (adaptateur isolé, décision D3 non tranchée).
-- Aucun prestataire n'est codé en dur : le lien de paiement est généré par l'adaptateur choisi
-- via AURION_PAY_PROVIDER (vide = fonction désactivée explicitement). Le statut de paiement
-- n'est mis à jour QUE sur confirmation vérifiée (webhook signé, idempotent, anti-rejeu).
-- Aucun numéro de carte n'est jamais stocké : les données sensibles restent chez le prestataire.
create table if not exists payment_links(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid not null references quotes(id) on delete cascade,
  amount_ttc numeric(12,2) not null check (amount_ttc > 0),
  invoice_total_at_creation numeric(12,2) not null,
  currency varchar(3) not null default 'EUR',
  status varchar(20) not null default 'active' check (status in ('active','paid','partially_paid','cancelled','invalidated')),
  provider varchar(40) not null,
  provider_ref varchar(200),
  link_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(link_token)
);
create index if not exists idx_payment_links_invoice on payment_links(organization_id, invoice_id);

create table if not exists payment_webhook_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider varchar(40) not null,
  event_id varchar(200) not null,
  payload json not null,
  signature_valid boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, event_id, organization_id)
);

-- Isolation multi-tenant (bloc 2).
do $$
declare t text;
begin
  foreach t in array array['payment_links','payment_webhook_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
        with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
    $f$, t);
  end loop;
end $$;
