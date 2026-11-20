-- 085 — Réplication : extension du journal aux tables métier manquantes (Bloc 2, prompt §4-BLOC 2).
-- Lignes de documents (quote_items), journal du tableau de bord (dashboard_journal_events) et
-- état de facturation électronique (ereporting_*). Additive et idempotente.
-- quote_items n'a PAS de colonne organization_id (tenant via quotes) : fonction de journal
-- dédiée qui résout l'organisation par le devis/facture parent, pour INSERT/UPDATE/DELETE.
-- Les quatre autres tables disposent de id + organization_id : fonction générique de 084
-- (non modifiée). Aucune migration historique n'est touchée.
create or replace function aurion_sync_journal_write_quote_item() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_quote uuid;
begin
  v_quote := case when TG_OP = 'DELETE' then old.quote_id else new.quote_id end;
  if v_quote is null then return null; end if;
  select organization_id into v_org from quotes where id = v_quote;
  if v_org is null then return null; end if;
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values (v_org, 'quote_items', (case when TG_OP = 'DELETE' then old else new end).id::text, case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

do $do$
declare t text;
begin
  -- Tables à colonnes id + organization_id (même garde que 084).
  foreach t in array array[
    'dashboard_journal_events',
    'ereporting_declarations','ereporting_events','ereporting_lines'] loop
    if to_regclass('public.' || t) is not null
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='organization_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='id') then
      execute format('drop trigger if exists aurion_sync_journal_trigger on public.%I', t);
      execute format('create trigger aurion_sync_journal_trigger after insert or update or delete on public.%I for each row execute function aurion_sync_journal_write()', t);
    end if;
  end loop;
  -- Lignes de documents : tenant résolu par le document parent.
  execute 'drop trigger if exists aurion_sync_journal_trigger on public.quote_items';
  execute 'create trigger aurion_sync_journal_trigger after insert or update or delete on public.quote_items for each row execute function aurion_sync_journal_write_quote_item()';
end $do$;
