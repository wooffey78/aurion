-- 114 — 15.4.50 — Portail client : accès invités vérifiés et acceptation de devis horodatée.
-- Additive et idempotente. Prolonge la fondation de partage par lien (bloc 14) : un CONTACT
-- CLIENT dispose d'un accès nominatif révocable, limité à SES données explicitement
-- partagées. Le jeton est stocké hashé (SHA-256) — jamais en clair — comme share-links.
-- L'acceptation d'un devis depuis le portail appelle la logique métier transactionnelle
-- (statuts 15.4.49) et reste tracée (nom saisi, adresse IP, horodatage).

create table if not exists client_portal_access(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null references clients(id) on delete cascade,
  contact_email varchar(200) not null,
  contact_name varchar(160),
  token_hash varchar(64) not null,  status varchar(20) not null default 'invited' check (status in ('invited','active','revoked')),
  invited_by uuid references users(id) on delete set null,
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  last_seen_at timestamptz,
  -- Unicité GLOBALE du hash : un jeton ne peut jamais correspondre à deux organisations,
  -- la résolution publique est donc déterministe sans filtre tenant (le hash ne révèle rien).
  unique(token_hash)
);
create index if not exists client_portal_access_client_idx on client_portal_access(organization_id, client_id);

create table if not exists quote_client_acceptances(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  access_id uuid references client_portal_access(id) on delete set null,
  signed_name varchar(160) not null,
  remote_ip varchar(64),
  user_agent varchar(300),
  accepted_at timestamptz not null default now(),
  unique(organization_id, quote_id)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'client_portal_access_org_fk') then
    alter table client_portal_access
      add constraint client_portal_access_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quote_client_acceptances_org_fk') then
    alter table quote_client_acceptances
      add constraint quote_client_acceptances_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

alter table client_portal_access enable row level security;
alter table quote_client_acceptances enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'client_portal_access'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.client_portal_access
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'quote_client_acceptances'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.quote_client_acceptances
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_client_portal_trigger on public.client_portal_access;
create trigger aurion_sync_client_portal_trigger after insert or update or delete on public.client_portal_access
  for each row execute function aurion_sync_journal_write_orgkey();
drop trigger if exists aurion_sync_quote_acceptances_trigger on public.quote_client_acceptances;
create trigger aurion_sync_quote_acceptances_trigger after insert or update or delete on public.quote_client_acceptances
  for each row execute function aurion_sync_journal_write_orgkey();
