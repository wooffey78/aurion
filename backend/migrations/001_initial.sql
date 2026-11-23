create extension if not exists pgcrypto;

create table if not exists organizations(
  id uuid primary key,
  name varchar(160) not null,
  activity varchar(160) not null,
  custom_activity varchar(240),
  siren varchar(9),
  siret varchar(14),
  logo_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users(
  id uuid primary key,
  email varchar(254) not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists organization_members(
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role varchar(32) not null check(role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key(organization_id,user_id)
);

create table if not exists modules(
  id uuid primary key default gen_random_uuid(),
  key varchar(80) not null unique,
  name varchar(120) not null,
  description varchar(500) not null,
  sort_order integer not null default 100
);

create table if not exists organization_modules(
  organization_id uuid not null references organizations(id) on delete cascade,
  module_id uuid not null references modules(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(organization_id,module_id)
);

create table if not exists documents(
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  original_name varchar(255) not null,
  mime_type varchar(255) not null,
  size_bytes bigint not null check(size_bytes>0),
  storage_key text not null unique,
  status varchar(32) not null check(status in ('pending','quarantined','clean','rejected','deleted')),
  created_at timestamptz not null default now()
);

create index if not exists idx_members_user on organization_members(user_id);
create index if not exists idx_documents_org_created on documents(organization_id,created_at desc);

insert into modules(key,name,description,sort_order) values
('general','Général','Fonctions communes de l’espace Aurion.',10),
('documents','Documents','Classement et recherche des documents de l’entreprise.',20),
('easyfixit','EasyFixit','Module métier pour réparation et interventions à domicile.',50),
('automation','Automatisations','Tâches planifiées et règles métier.',60),
('ai','Assistant IA','Connecteurs IA, conversations et actions contrôlées.',70)
on conflict(key) do nothing;
