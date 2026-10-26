-- Strict alignment: client SIRET + resumable timer sessions.
alter table clients add column if not exists siret varchar(14);
create index if not exists idx_clients_org_activity_siret on clients(organization_id,activity_id,siret);
alter table client_time_sessions add column if not exists accumulated_seconds integer not null default 0;
alter table client_time_sessions add column if not exists paused_at timestamptz;
