-- 097 — Bloc 11 (prompt 11) : comptabilité — verrou de période clôturée, correction de règlement
-- auditée, attribution du rapprochement bancaire.
-- Additif strict. Le verrou interdit TOUTE écriture comptable nouvelle sur une année clôturée
-- (paiements, écritures SAV, corrections) ; la clôture reste réversible par une action humaine
-- explicite (rouverture journalisée). La correction d'un règlement est une ANNUALATION TRACÉE :
-- l'original est conservé intégralement (jsonb) dans payment_corrections, jamais supprimé
-- silencieusement ; les années clôturées sont bloquées.

create table if not exists accounting_closed_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_year integer not null check (period_year between 2000 and 2100),
  closed_by uuid references users(id) on delete set null,
  note varchar(400),
  reopened_at timestamptz,
  reopened_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Une seule ligne par année ; une ligne avec reopened_at renseigné = période rouverte (non bloquante).
  unique (organization_id, period_year)
);

-- Correction de règlement : copie intégrale du règlement supprimé + de son écriture comptable,
-- avec motif et acteur. L'opération est toujours traçable et reconstituable.
create table if not exists payment_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid references quotes(id) on delete set null,
  payment_id uuid not null,
  payment_payload jsonb not null,
  accounting_entry_id uuid,
  accounting_entry_payload jsonb,
  reason varchar(400) not null,
  actor_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_payment_corrections_org on payment_corrections(organization_id, created_at desc);
create index if not exists idx_payment_corrections_invoice on payment_corrections(organization_id, invoice_id);

-- Rapprochement bancaire : attribution explicite (qui a validé / annulé) — audit du prompt 11.
alter table public.bank_transactions add column if not exists matched_by uuid references users(id) on delete set null;
alter table public.bank_transactions add column if not exists unmatched_by uuid references users(id) on delete set null;
alter table public.bank_transactions add column if not exists unmatched_at timestamptz;

-- Crosse de cohérence : un règlement rapproché ne peut pas être corrigé sans annuler d'abord le
-- rapprochement (garde applicative) ; l'index accélère la vérification.
create index if not exists idx_bank_transactions_matched_payment on bank_transactions(matched_payment_id) where matched_payment_id is not null;

do $$
declare
  t text;
  direct_tables text[] := array[
    'accounting_closed_periods','payment_corrections'
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
