-- 117 — 15.4.50 — Bibliothèque de prestations types par profil métier.
-- Modèle 078/104 : les tables GLOBALES sont lisibles par le runtime applicatif et NON
-- modifiables par lui (aucune policy d'écriture → écriture refusée par RLS) ; une évolution
-- naît d'une livraison (migration/seed), jamais d'une écriture applicative. Les
-- personnalisations de l'entreprise vivent dans la table ORGANISATION (overrides) et
-- PRÉSERVENT toujours les valeurs confirmées manuellement (prompt 02).

create table if not exists profile_service_library(
  id uuid primary key default gen_random_uuid(),
  profile_code varchar(40) not null,
  label varchar(160) not null,
  description varchar(400) not null default '',
  unit varchar(30) not null default 'forfait',
  default_price_cents bigint,
  typical_minutes integer,
  source varchar(60) not null default 'catalogue-embarque',
  catalog_version varchar(20) not null default '2026.11',
  created_at timestamptz not null default now(),
  unique(profile_code, label, catalog_version)
);
create index if not exists profile_service_library_profile_idx on profile_service_library(profile_code);

create table if not exists profile_service_overrides(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  profile_code varchar(40) not null,
  label varchar(160) not null,
  unit varchar(30),
  default_price_cents bigint,
  typical_minutes integer,
  origin varchar(20) not null default 'confirmed' check (origin in ('confirmed','proposed')),
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(organization_id, profile_code, label)
);
create index if not exists profile_service_overrides_org_idx on profile_service_overrides(organization_id, profile_code);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profile_service_overrides_org_fk') then
    alter table profile_service_overrides
      add constraint profile_service_overrides_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

-- Table globale : lecture seule pour le runtime applicatif (même modèle que 104).
do $$ begin
  execute 'drop policy if exists profile_service_library_read on profile_service_library';
  execute 'create policy profile_service_library_read on profile_service_library for select to aurion_runtime using (true)';
end $$;
grant select on profile_service_library to aurion_runtime;

alter table profile_service_overrides enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'profile_service_overrides'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.profile_service_overrides
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_service_overrides_trigger on public.profile_service_overrides;
create trigger aurion_sync_service_overrides_trigger after insert or update or delete on public.profile_service_overrides
  for each row execute function aurion_sync_journal_write_orgkey();
