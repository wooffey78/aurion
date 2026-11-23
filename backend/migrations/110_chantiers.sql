-- 110 — 15.4.50 — Chantiers : regroupement métier des éléments d'un même ouvrage.
-- Additive et idempotente : ré-exécutable sans erreur, sans réécriture des données existantes.
--
-- Objet « chantier » (suggestion 15.4.50 B1) : l'entrepreneur regroupe devis, rendez-vous,
-- interventions, temps, pièces et factures d'un même ouvrage. Le chantier n'est PAS une
-- seconde fiche de vérité : les objets restent la propriété de leurs modules (sources de
-- vérité 15.4.49) ; le chantier ne fait que les référencer pour agréger la rentabilité
-- réelle (coût réel vs devis accepté) et détecter la dérive avant facturation.

create table if not exists chantiers(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  activity_id uuid references activities(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  name varchar(200) not null,
  location varchar(300),
  status varchar(20) not null default 'active' check (status in ('active','completed','archived')),
  quote_amount_cents bigint,
  notes text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chantiers_org_idx on chantiers(organization_id, status, created_at desc);

create table if not exists chantier_links(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  chantier_id uuid not null,
  object_type varchar(30) not null check (object_type in ('quote','appointment','intervention','sav_case','time_session','expense','document')),
  object_id uuid not null,
  linked_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(organization_id, chantier_id, object_type, object_id)
);
create index if not exists chantier_links_object_idx on chantier_links(organization_id, object_type, object_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chantiers_org_fk') then
    alter table chantiers
      add constraint chantiers_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chantier_links_org_fk') then
    alter table chantier_links
      add constraint chantier_links_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chantier_links_chantier_fk') then
    alter table chantier_links
      add constraint chantier_links_chantier_fk
      foreign key (chantier_id) references chantiers(id) on delete cascade;
  end if;
end $$;

alter table chantiers enable row level security;
alter table chantier_links enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'chantiers'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.chantiers
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'chantier_links'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.chantier_links
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

-- Réplication inter-instances (086) : les deux tables suivent le même mécanisme que l'outbox 109.
drop trigger if exists aurion_sync_chantiers_trigger on public.chantiers;
create trigger aurion_sync_chantiers_trigger after insert or update or delete on public.chantiers
  for each row execute function aurion_sync_journal_write_orgkey();
drop trigger if exists aurion_sync_chantier_links_trigger on public.chantier_links;
create trigger aurion_sync_chantier_links_trigger after insert or update or delete on public.chantier_links
  for each row execute function aurion_sync_journal_write_orgkey();
