-- 112 — 15.4.50 — Contrats d'entretien (maintenance récurrente déterministe).
-- Additive et idempotente. Le contrat décrit la RÉCURRENCE convenue (fréquence, fenêtre
-- horaire, prix) ; les occurrences réelles restent des rendez-vous de l'agenda unifié (108)
-- et la facturation suit le cycle commercial existant : aucun second modèle d'agenda ni de
-- facture. La génération des rendez-vous est explicite, idempotente et auditée (pas d'automate
-- fermé : l'entrepreneur valide la planification proposée).

create table if not exists maintenance_contracts(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  activity_id uuid references activities(id) on delete set null,
  client_id uuid not null references clients(id) on delete restrict,
  name varchar(200) not null,
  frequency varchar(20) not null check (frequency in ('monthly','bimonthly','quarterly','semiannual','annual')),
  weekday smallint not null default 1 check (weekday between 0 and 6),
  preferred_time varchar(5),
  duration_minutes integer not null default 120,
  agreed_amount_cents bigint,
  first_occurrence date not null,
  status varchar(20) not null default 'active' check (status in ('active','paused','ended')),
  notes text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maintenance_contracts_org_idx on maintenance_contracts(organization_id, status);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'maintenance_contracts_org_fk') then
    alter table maintenance_contracts
      add constraint maintenance_contracts_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

alter table maintenance_contracts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'maintenance_contracts'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.maintenance_contracts
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_maintenance_contracts_trigger on public.maintenance_contracts;
create trigger aurion_sync_maintenance_contracts_trigger after insert or update or delete on public.maintenance_contracts
  for each row execute function aurion_sync_journal_write_orgkey();
