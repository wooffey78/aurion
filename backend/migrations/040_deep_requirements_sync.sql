-- Deep synchronization hardening for automatic detection / propagation.
alter table organizations add column if not exists updated_at timestamptz not null default now();
alter table activities add column if not exists social_auto_detected boolean not null default false;
alter table activities add column if not exists vat_auto_detected boolean not null default false;
create index if not exists idx_org_updated_at on organizations(id,updated_at);
create index if not exists idx_activity_updated_at on activities(id,updated_at);
