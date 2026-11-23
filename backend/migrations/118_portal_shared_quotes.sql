-- 118 — 15.4.50 — Partage explicit du portail client : quels devis sont visibles par quel accès.
-- Additive et idempotente. Le partage est une DÉCISION de l'entrepreneur (créé, révocable,
-- historisé) : un accès nominatif ne voit QUE les devis explicitement rattachés — jamais
-- les notes internes, marges, coûts ou les documents d'autres clients (prompt 14).

create table if not exists portal_shared_quotes(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  access_id uuid not null,
  quote_id uuid not null,
  shared_by uuid references users(id) on delete set null,
  shared_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(organization_id, access_id, quote_id)
);
create index if not exists portal_shared_quotes_access_idx on portal_shared_quotes(organization_id, access_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'portal_shared_quotes_org_fk') then
    alter table portal_shared_quotes
      add constraint portal_shared_quotes_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'portal_shared_quotes_access_fk') then
    alter table portal_shared_quotes
      add constraint portal_shared_quotes_access_fk
      foreign key (access_id) references client_portal_access(id) on delete cascade;
  end if;
end $$;

alter table portal_shared_quotes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'portal_shared_quotes'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.portal_shared_quotes
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_portal_shared_quotes_trigger on public.portal_shared_quotes;
create trigger aurion_sync_portal_shared_quotes_trigger after insert or update or delete on public.portal_shared_quotes
  for each row execute function aurion_sync_journal_write_orgkey();
