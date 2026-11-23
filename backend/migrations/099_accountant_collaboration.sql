-- 099 — Bloc 15 (prompt 15) : espace de collaboration avec l'expert-comptable.
-- Le document source reste UNIQUE dans le dépôt central : une demande référence un document
-- existant (document_id), jamais une copie divergente. Chaque demande porte un état, un auteur,
-- une échéance et une résolution documentée ; les échanges sont contextualisés et conservés.

create table if not exists accountant_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title varchar(240) not null,
  details text not null default '',
  period_year integer check (period_year between 2000 and 2100),
  state varchar(20) not null default 'open' check (state in ('open','answered','resolved','cancelled')),
  document_id uuid references documents(id) on delete set null,
  author_user_id uuid references users(id) on delete set null,
  author_role varchar(20) not null default 'operator' check (author_role in ('operator','accountant')),
  due_date date,
  resolution_note varchar(1000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_accountant_requests_org on accountant_requests(organization_id, state, created_at desc);
create index if not exists idx_accountant_requests_period on accountant_requests(organization_id, period_year, state);

create table if not exists accountant_request_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  request_id uuid not null references accountant_requests(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  author_role varchar(20) not null default 'operator' check (author_role in ('operator','accountant')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_accountant_request_messages on accountant_request_messages(organization_id, request_id, created_at);

-- Livraison de l'invitation par e-mail (même mécanisme que les invités admin, migration 087) :
-- le jeton n'est plus renvoyé dans les listes ; son remis reste l'envoi ou la transmission manuelle.
alter table public.accountant_invitations add column if not exists email_status varchar(20) check (email_status in ('sent','failed','skipped','pending'));
alter table public.accountant_invitations add column if not exists email_sent_at timestamptz;
alter table public.accountant_invitations add column if not exists email_error varchar(400);

do $$
declare
  t text;
  direct_tables text[] := array[
    'accountant_requests','accountant_request_messages'
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
