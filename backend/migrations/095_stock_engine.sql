-- 095 — Bloc 10 (prompt 10) : moteur de stock traçable et réservations de pièces.
-- Additif strict : aucune table ni colonne existante n'est modifiée en rupture. La colonne
-- `parts.stock` conserve son rôle de STOCK PHYSIQUE ; toute variation passe désormais par un
-- mouvement traçable (quantité signée, motif, acteur, lien opérationnel), et les réservations
-- diminue le STOCK DISPONIBLE (physique − réservations actives) sans toucher le physique.
-- Les unités, seuils de réapprovisionnement et emplacements de rangement deviennent des
-- attributs explicites de l'article (source de vérité unique : la table `parts`).

-- 1) Attributs d'article nécessaires au prompt 10 (valeurs neutres par défaut).
alter table public.parts add column if not exists unit varchar(20);
alter table public.parts add column if not exists min_stock_threshold numeric(12,2) not null default 0;
alter table public.parts add column if not exists storage_location varchar(160);

-- 2) Mouvements de stock : chaque variation de quantité est une ligne historisée.
--    quantity est signé (+ entrée, − sortie) ; quantity_after est le stock physique résultant.
create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  part_id uuid not null references parts(id) on delete cascade,
  movement_type varchar(30) not null check (movement_type in ('initial','receipt','consumption','adjustment','return','damage','loss')),
  quantity numeric(12,2) not null,
  quantity_after numeric(12,2) not null,
  reason varchar(400),
  origin varchar(200),
  destination varchar(200),
  actor_id uuid references users(id) on delete set null,
  op_type varchar(30),
  op_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_stock_movements_part on stock_movements(organization_id, part_id, created_at desc);
create index if not exists idx_stock_movements_op on stock_movements(organization_id, op_type, op_id);

-- 3) Réservations de pièces : liées à un devis ou à un rendez-vous (intervention).
--    `active` diminue le disponible ; `consumed` crée le mouvement réel ; `released`/`cancelled`
--    libèrent sans mouvement. La quantité est toujours strictement positive.
create table if not exists part_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  part_id uuid not null references parts(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  quantity numeric(12,2) not null check (quantity > 0),
  status varchar(20) not null default 'active' check (status in ('active','consumed','released','cancelled')),
  created_by uuid references users(id) on delete set null,
  note varchar(400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_part_reservations_part on part_reservations(organization_id, part_id, status);
create index if not exists idx_part_reservations_quote on part_reservations(organization_id, quote_id, status);
create index if not exists idx_part_reservations_appointment on part_reservations(organization_id, appointment_id, status);

-- 4) Isolation multi-tenant (même politique que la RLS 074 : échec fermé hors contexte).
do $$
declare
  t text;
  direct_tables text[] := array[
    'stock_movements','part_reservations'
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
