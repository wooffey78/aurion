-- Aurion 15.2.25 — formes juridiques et détail des cotisations par activité.
-- Additif uniquement : les colonnes existantes restent la source de compatibilité des calculs historiques.
create table if not exists activity_contributions(
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  name varchar(180) not null,
  rate numeric(8,4),
  basis varchar(80) not null default 'chiffre d’affaires HT',
  mandatory boolean not null default true,
  variable boolean not null default false,
  source varchar(240),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(activity_id,name)
);
create index if not exists idx_activity_contributions_activity on activity_contributions(activity_id,position);
