-- Bloc 14 — Export pour l'expert-comptable : rôle lecture seule, invité et révocable,
-- journalisé, limité à l'organisation invitante, sans accès aux secrets ni aux paiements admin.
alter table organization_members drop constraint if exists organization_members_role_check;
alter table organization_members add constraint organization_members_role_check
  check (role in ('owner','admin','member','accountant'));

-- Invitations d'expert-comptable (une seule invitation active par e-mail et organisation).
create table if not exists accountant_invitations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email varchar(254) not null,
  token uuid not null default gen_random_uuid(),
  invited_by uuid not null,
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(organization_id, email)
);

-- Journal d'accès du rôle comptable (traçabilité de chaque consultation).
create table if not exists accountant_access_log(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  path varchar(500) not null,
  accessed_at timestamptz not null default now()
);
create index if not exists idx_accountant_access_log_org on accountant_access_log(organization_id, accessed_at);

-- Isolation multi-tenant (bloc 2).
do $$
declare t text;
begin
  foreach t in array array['accountant_invitations','accountant_access_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
        with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
    $f$, t);
  end loop;
end $$;
