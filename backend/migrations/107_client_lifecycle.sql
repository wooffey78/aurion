-- 107 — Prompt 06 — CRM : instantanés client des documents, archivage et fusion auditée.
-- Additive et idempotente : ré-exécutable sans erreur, sans réécriture des données existantes.
--
-- Règle du prompt 06 : les documents émis conservent des INSTANTANÉS légaux (les corrections
-- de la fiche client ne réécrivent jamais les anciens documents) ; la suppression d'une fiche
-- liée à des documents émis est refusée au profit de l'ARCHIVAGE ; la fusion de doublons est
-- uniquement contrôlée et auditée (jamais automatique), la fiche absorbée reste consultable.

-- 1) Instantanés client écrits À LA CRÉATION du document (nom, e-mail, téléphone —
--    l'adresse de facturation disposait déjà de billing_address_snapshot depuis 065).
alter table quotes add column if not exists client_name_snapshot varchar(240);
alter table quotes add column if not exists client_email_snapshot varchar(254);
alter table quotes add column if not exists client_phone_snapshot varchar(80);

-- 2) Archivage de la fiche client (désactivation réversible, jamais une perte d'historique).
alter table clients add column if not exists archived_at timestamptz;
alter table clients add column if not exists archived_by uuid;

-- 3) Fusion de doublons : la fiche absorbée reste en base (référence vers la fiche
--    conservatrice) ; la piste d'audit conserve la décision complète.
alter table clients add column if not exists merged_into uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clients_merged_into_fk') then
    alter table clients
      add constraint clients_merged_into_fk
      foreign key (merged_into) references clients(id) on delete set null;
  end if;
end $$;

create table if not exists client_merges(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  survivor_id uuid not null,
  absorbed_id uuid not null,
  reason varchar(400) not null,
  actor_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists client_merges_org_idx on client_merges(organization_id, created_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_merges_org_fk') then
    alter table client_merges
      add constraint client_merges_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

alter table client_merges enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'client_merges'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.client_merges
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_client_merges_trigger on public.client_merges;
create trigger aurion_sync_client_merges_trigger after insert or update or delete on public.client_merges
  for each row execute function aurion_sync_journal_write_orgkey();
