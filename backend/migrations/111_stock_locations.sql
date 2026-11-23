-- 111 — 15.4.50 — Emplacements de stock (atelier, camion, dépôt) et transferts traçables.
-- Additive et idempotente. Le stock physique reste la source de vérité de la table parts
-- (moteur 095 inchangé) : l'emplacement ne fait qu'ajouter la DIMENSION où se trouve la
-- quantité, portée par les mouvements existants (aucune quantité parallèle à réconcilier).

create table if not exists stock_locations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name varchar(120) not null,
  kind varchar(20) not null default 'depot' check (kind in ('depot','truck','workshop','other')),
  is_default boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);
create index if not exists stock_locations_org_idx on stock_locations(organization_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_locations_org_fk') then
    alter table stock_locations
      add constraint stock_locations_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

-- Le mouvement existant porte l'emplacement : null = « sans emplacement tracé » (données
-- historiques et mouvements sans dimension), jamais une valeur inventée.
alter table stock_movements add column if not exists location_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_movements_location_fk') then
    alter table stock_movements
      add constraint stock_movements_location_fk
      foreign key (location_id) references stock_locations(id) on delete set null;
  end if;
end $$;
create index if not exists stock_movements_location_idx
  on stock_movements(organization_id, location_id, created_at desc);

alter table stock_locations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'stock_locations'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.stock_locations
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_stock_locations_trigger on public.stock_locations;
create trigger aurion_sync_stock_locations_trigger after insert or update or delete on public.stock_locations
  for each row execute function aurion_sync_journal_write_orgkey();
