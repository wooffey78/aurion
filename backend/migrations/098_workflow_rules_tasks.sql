-- 098 — Bloc 13 (prompt 13) : automatisations déterministes (sans IA) et tâches internes.
-- Moteur de règles réutilisant les événements existants : déclencheur (événement/calendrier/
-- seuil), conditions explicites, actions internes (alerte de journal, tâche), simulation à
-- blanc, journal d'exécution avec clé d'idempotence (aucune action répétée), versionnage des
-- règles et activation/désactivation. Les entités `tasks` donnent un support aux actions
-- « créer une tâche » et deviennent une source de vérité consommable par le dashboard.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid references activities(id) on delete set null,
  title varchar(240) not null,
  description text not null default '',
  status varchar(20) not null default 'todo' check (status in ('todo','done','cancelled')),
  due_at timestamptz,
  source varchar(60) not null default 'manual',
  source_id uuid,
  created_by uuid references users(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_org_status on tasks(organization_id, status, due_at);
create index if not exists idx_tasks_source on tasks(organization_id, source, source_id);

create table if not exists workflow_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name varchar(160) not null,
  trigger_type varchar(40) not null check (trigger_type in ('invoice_overdue','stock_below_threshold','deadline_reminder')),
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  version integer not null default 1,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  rule_id uuid references workflow_rules(id) on delete cascade,
  rule_version integer not null default 1,
  trigger_type varchar(40) not null,
  trigger_ref varchar(200) not null,
  status varchar(20) not null default 'executed' check (status in ('simulated','executed','failed','cancelled')),
  actions jsonb not null default '[]'::jsonb,
  result jsonb,
  error text,
  idempotency_key varchar(240) not null,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Idempotence du prompt 13 : la même règle sur le même déclencheur n'est exécutée qu'une fois.
  unique (organization_id, idempotency_key)
);
create index if not exists idx_workflow_runs_rule on workflow_runs(organization_id, rule_id, created_at desc);
create index if not exists idx_workflow_runs_trigger on workflow_runs(organization_id, trigger_type, trigger_ref);

do $$
declare
  t text;
  direct_tables text[] := array[
    'tasks','workflow_rules','workflow_runs'
  ];
begin
  foreach t in array direct_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
        with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
    $f$, t);
  end loop;
end
$$;
