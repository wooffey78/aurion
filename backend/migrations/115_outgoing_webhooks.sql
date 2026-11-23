-- 115 — 15.4.50 — Webhooks sortants signés (canal de l'outbox 109 vers les outils partenaires).
-- Additive et idempotente. L'endpoint est déclaré par le chef d'entreprise ; le secret HMAC
-- n'est JAMAIS stocké en clair : seule son empreinte SHA-256 permet la vérification côté
-- Aurion, la signature est calculée depuis le secret chiffré par le stockage des secrets
-- existant (services/secrets.ts). Livraison au moins une fois, idempotence, backoff et
-- lettre morte : le même contrat que l'outbox métier (aucun faux succès).

create table if not exists webhook_endpoints(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  label varchar(120) not null,
  url varchar(400) not null,
  events text[] not null default '{}',
  status varchar(20) not null default 'active' check (status in ('active','paused','revoked')),
  secret_cipher text not null,
  secret_fingerprint varchar(64) not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, label)
);
create index if not exists webhook_endpoints_org_idx on webhook_endpoints(organization_id, status);

create table if not exists webhook_deliveries(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  endpoint_id uuid not null,
  event_type varchar(60) not null,
  source_entity_type varchar(60),
  source_entity_id uuid,
  payload jsonb not null,
  idempotency_key varchar(160) not null,
  status varchar(20) not null default 'pending'
    check (status in ('pending','processing','processed','failed','dead_lettered')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(organization_id, idempotency_key)
);
create index if not exists webhook_deliveries_dispatch_idx
  on webhook_deliveries(status, next_attempt_at);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'webhook_endpoints_org_fk') then
    alter table webhook_endpoints
      add constraint webhook_endpoints_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'webhook_deliveries_org_fk') then
    alter table webhook_deliveries
      add constraint webhook_deliveries_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'webhook_deliveries_endpoint_fk') then
    alter table webhook_deliveries
      add constraint webhook_deliveries_endpoint_fk
      foreign key (endpoint_id) references webhook_endpoints(id) on delete cascade;
  end if;
end $$;

alter table webhook_endpoints enable row level security;
alter table webhook_deliveries enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'webhook_endpoints'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.webhook_endpoints
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'webhook_deliveries'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.webhook_deliveries
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_webhook_endpoints_trigger on public.webhook_endpoints;
create trigger aurion_sync_webhook_endpoints_trigger after insert or update or delete on public.webhook_endpoints
  for each row execute function aurion_sync_journal_write_orgkey();
drop trigger if exists aurion_sync_webhook_deliveries_trigger on public.webhook_deliveries;
create trigger aurion_sync_webhook_deliveries_trigger after insert or update or delete on public.webhook_deliveries
  for each row execute function aurion_sync_journal_write_orgkey();
