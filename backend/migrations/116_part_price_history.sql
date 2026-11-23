-- 116 — 15.4.50 — Historique de prix des matériaux et alertes de variation.
-- Additive et idempotente. Chaque prix d'achat réellement constaté (réception, saisie
-- fournisseur) est horodaté ; l'analyse de tendance est calculée depuis cet historique —
-- AUCUN scraping ni source externe : uniquement les achats réels de l'entreprise (prompt 10).
-- Les alertes de hausse alimentent le journal de bord via le moteur d'événements existant.

create table if not exists part_price_history(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  part_id uuid not null,
  supplier_id uuid,
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  currency varchar(3) not null default 'EUR',
  observed_at date not null,
  source varchar(30) not null default 'manual' check (source in ('manual','receipt','purchase_order','import')),
  recorded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists part_price_history_trend_idx
  on part_price_history(organization_id, part_id, observed_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'part_price_history_org_fk') then
    alter table part_price_history
      add constraint part_price_history_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

alter table part_price_history enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'part_price_history'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.part_price_history
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_part_price_history_trigger on public.part_price_history;
create trigger aurion_sync_part_price_history_trigger after insert or update or delete on public.part_price_history
  for each row execute function aurion_sync_journal_write_orgkey();
