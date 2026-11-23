-- Aurion : pause réelle du compteur client + contrôle SAV sous garantie.
alter table client_time_sessions drop constraint if exists client_time_sessions_status_check;
alter table client_time_sessions add constraint client_time_sessions_status_check
  check(status in ('running','paused','completed','abandoned'));

create index if not exists idx_client_time_active_status
  on client_time_sessions(organization_id,user_id,status,client_id);

-- Les sessions déjà terminées restent des historiques valides.
