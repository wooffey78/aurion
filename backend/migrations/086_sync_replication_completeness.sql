-- 086 — Réplication : complétude du registre métier (Bloc 2, prompt maître « finalisation » §5-BLOC 2).
-- Additive et idempotente : n'ajoute que des TRIGGERS de journal sur des tables métier qui avaient
-- une valeur hors connexion et une clé stable, sans toucher aux migrations historiques ni aux
-- fonctions 084/085. Les exclusions restent documentées dans backend/src/services/sync-replication.ts
-- (secrets, sessions, billing, numérotation serveur, tables sans organization_id, fonctions retirées).
--
-- Trois familles :
--   a) tables avec id + organization_id → fonction générique 084 (aurion_sync_journal_write) ;
--   b) activity_forecast_assumptions (clé naturelle activity_id, organization_id présent)
--      → fonction dédiée (entity_id = activity_id) ;
--   c) enfants sans organization_id : template_versions (parent document_templates),
--      support_status_events (parent support_tickets) → fonctions dédiées résolvant le tenant.
-- RLS : sync_entity_changes est déjà cloisonné (084) ; les fonctions sont SECURITY DEFINER avec
-- search_path fixé, elles n'exposent que l'écriture du journal interne.

create or replace function aurion_sync_journal_write_forecast_assumptions() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values ((case when TG_OP = 'DELETE' then old else new end).organization_id::uuid,
            'activity_forecast_assumptions',
            (case when TG_OP = 'DELETE' then old else new end).activity_id::text,
            case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

-- Tables 1:1 par organisation (organization_id EST la clé primaire) : entity_id = organization_id.
create or replace function aurion_sync_journal_write_orgkey() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_entity text; v_org uuid;
begin
  v_entity := TG_TABLE_NAME;
  v_org := case when TG_OP = 'DELETE' then old.organization_id else new.organization_id end;
  if v_org is null then return null; end if;
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values (v_org, v_entity, v_org::text, case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

create or replace function aurion_sync_journal_write_activity_key() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_entity text; v_org uuid; v_key text;
begin
  v_entity := TG_TABLE_NAME;
  v_org := case when TG_OP = 'DELETE' then old.organization_id else new.organization_id end;
  v_key := case when TG_OP = 'DELETE' then old.activity_id else new.activity_id end;
  if v_org is null or v_key is null then return null; end if;
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values (v_org, v_entity, v_key::text, case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

create or replace function aurion_sync_journal_write_template_version() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_tpl uuid;
begin
  v_tpl := case when TG_OP = 'DELETE' then old.template_id else new.template_id end;
  if v_tpl is null then return null; end if;
  select organization_id into v_org from document_templates where id = v_tpl;
  if v_org is null then return null; end if;
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values (v_org, 'template_versions', (case when TG_OP = 'DELETE' then old else new end).id::text,
            case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

create or replace function aurion_sync_journal_write_support_status() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_ticket uuid;
begin
  v_ticket := case when TG_OP = 'DELETE' then old.ticket_id else new.ticket_id end;
  if v_ticket is null then return null; end if;
  select organization_id into v_org from support_tickets where id = v_ticket;
  if v_org is null then return null; end if;
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values (v_org, 'support_status_events', (case when TG_OP = 'DELETE' then old else new end).id::text,
            case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

do $block$
declare t text;
begin
  -- a) tables à id + organization_id (garde : table et colonnes présentes).
  foreach t in array array[
    'bank_import_configs','cloud_documents','notification_jobs','outgoing_electronic_invoices',
    'outgoing_transmission_events','payment_links','supplier_electronic_invoices'] loop
    if to_regclass('public.' || t) is not null
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='organization_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='id') then
      execute format('drop trigger if exists aurion_sync_journal_trigger on public.%I', t);
      execute format('create trigger aurion_sync_journal_trigger after insert or update or delete on public.%I for each row execute function aurion_sync_journal_write()', t);
    end if;
  end loop;
end $block$;

drop trigger if exists aurion_sync_journal_trigger on public.activity_forecast_assumptions;
create trigger aurion_sync_journal_trigger after insert or update or delete on public.activity_forecast_assumptions
  for each row execute function aurion_sync_journal_write_forecast_assumptions();

drop trigger if exists aurion_sync_journal_trigger on public.document_themes;
create trigger aurion_sync_journal_trigger after insert or update or delete on public.document_themes
  for each row execute function aurion_sync_journal_write_orgkey();

drop trigger if exists aurion_sync_journal_trigger on public.email_signatures;
create trigger aurion_sync_journal_trigger after insert or update or delete on public.email_signatures
  for each row execute function aurion_sync_journal_write_orgkey();

drop trigger if exists aurion_sync_journal_trigger on public.electronic_invoice_profiles;
create trigger aurion_sync_journal_trigger after insert or update or delete on public.electronic_invoice_profiles
  for each row execute function aurion_sync_journal_write_orgkey();

-- activity_profile_overrides : SANS organization_id (tenant via activities, clé activity_id).
create or replace function aurion_sync_journal_write_profile_override() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organization_id into v_org from activities where id = (case when TG_OP = 'DELETE' then old.activity_id else new.activity_id end);
  if v_org is null then return null; end if;
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values (v_org, 'activity_profile_overrides', (case when TG_OP = 'DELETE' then old.activity_id else new.activity_id end)::text,
            case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

drop trigger if exists aurion_sync_journal_trigger on public.activity_profile_overrides;
create trigger aurion_sync_journal_trigger after insert or update or delete on public.activity_profile_overrides
  for each row execute function aurion_sync_journal_write_profile_override();

drop trigger if exists aurion_sync_journal_trigger on public.template_versions;
create trigger aurion_sync_journal_trigger after insert or update or delete on public.template_versions
  for each row execute function aurion_sync_journal_write_template_version();

drop trigger if exists aurion_sync_journal_trigger on public.support_status_events;
create trigger aurion_sync_journal_trigger after insert or update or delete on public.support_status_events
  for each row execute function aurion_sync_journal_write_support_status();
