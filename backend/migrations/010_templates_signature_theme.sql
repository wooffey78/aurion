-- Aurion 14 : signature d'e-mail, thème visuel des documents, moteur de modèles (analyse, mapping, versions).
create table if not exists email_signatures(
  organization_id uuid primary key references organizations(id) on delete cascade,
  enabled boolean not null default true,
  first_name varchar(120), last_name varchar(120), job_title varchar(160), company varchar(200),
  phone varchar(60), website varchar(240), address varchar(300), extra text,
  updated_at timestamptz not null default now()
);
create table if not exists document_themes(
  organization_id uuid primary key references organizations(id) on delete cascade,
  accent char(7) not null,
  dark char(7) not null,
  font varchar(10) not null default 'sans' check (font in ('sans','serif')),
  radius varchar(10) not null default 'round' check (radius in ('round','square')),
  customized boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table document_templates add column if not exists source varchar(12) not null default 'imported';
alter table document_templates add column if not exists file_format varchar(10);
alter table document_templates add column if not exists analysis jsonb;
alter table document_templates add column if not exists mapping jsonb;
alter table document_templates add column if not exists mapping_status varchar(20) not null default 'none';
alter table document_templates add column if not exists version integer not null default 1;
create table if not exists template_versions(
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references document_templates(id) on delete cascade,
  version integer not null,
  storage_key text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_template_versions_tpl on template_versions(template_id, version desc);
