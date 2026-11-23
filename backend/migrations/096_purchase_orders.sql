-- 096 — Bloc 10 (prompt 10) : achats fournisseurs — commande, réception partielle/complète, retour.
-- Additif strict. Les achats n'alimentent le stock qu'à la RÉCEPTION CONFIRMÉE (mouvement
-- « receipt » créé par le service), sans aucune écriture comptable automatique (invariant
-- identique à la boîte de réception PA 075 : la comptabilisation reste une action humaine).
-- Le statut d'une commande suit : draft → ordered → partially_received → received, avec
-- annulation possible tant qu'aucune réception n'a été confirmée.

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid references activities(id) on delete set null,
  supplier_id uuid not null references suppliers(id) on delete restrict,
  status varchar(30) not null default 'draft' check (status in ('draft','ordered','partially_received','received','cancelled')),
  reference varchar(160),
  note text,
  ordered_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_purchase_orders_org on purchase_orders(organization_id, status, created_at desc);
create index if not exists idx_purchase_orders_supplier on purchase_orders(organization_id, supplier_id, status);

create table if not exists purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  part_id uuid references parts(id) on delete set null,
  label varchar(240) not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  received_quantity numeric(12,2) not null default 0 check (received_quantity >= 0),
  unit varchar(20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (received_quantity <= quantity)
);
create index if not exists idx_purchase_order_lines_order on purchase_order_lines(organization_id, purchase_order_id);
create index if not exists idx_purchase_order_lines_part on purchase_order_lines(organization_id, part_id);

-- Réceptions confirmées (une ligne de réception = un mouvement de stock « receipt »).
create table if not exists purchase_receptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  note varchar(400),
  received_by uuid references users(id) on delete set null,
  received_at timestamptz not null default now()
);
create index if not exists idx_purchase_receptions_order on purchase_receptions(organization_id, purchase_order_id, received_at desc);

create table if not exists purchase_reception_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  reception_id uuid not null references purchase_receptions(id) on delete cascade,
  order_line_id uuid references purchase_order_lines(id) on delete set null,
  part_id uuid references parts(id) on delete set null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_cost numeric(14,2),
  movement_id uuid references stock_movements(id) on delete set null
);
create index if not exists idx_purchase_reception_lines_reception on purchase_reception_lines(organization_id, reception_id);

do $$
declare
  t text;
  direct_tables text[] := array[
    'purchase_orders','purchase_order_lines','purchase_receptions','purchase_reception_lines'
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
