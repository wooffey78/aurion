-- Aurion 13 : lignes de devis (avec quantités), messagerie de l'entreprise, suivi des invitations agenda.
create table if not exists quote_items(
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  position integer not null default 0,
  label varchar(240) not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_cost numeric(12,2) not null default 0,
  part_id uuid references parts(id) on delete set null
);
create index if not exists idx_quote_items_quote on quote_items(quote_id, position);

create table if not exists mail_accounts(
  organization_id uuid primary key references organizations(id) on delete cascade,
  provider varchar(40) not null default 'custom',
  email varchar(254) not null,
  username varchar(254) not null,
  password_enc text not null,
  smtp_host varchar(255) not null,
  smtp_port integer not null check (smtp_port between 1 and 65535),
  security varchar(10) not null default 'ssl' check (security in ('ssl','starttls','none')),
  from_name varchar(160),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table appointments add column if not exists ics_sequence integer not null default 0;
