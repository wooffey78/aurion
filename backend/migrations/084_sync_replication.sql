-- Bloc 3 — réplication locale contrôlée (prompt maître §4.2-4.3) : journal de changements par
-- entité (curseur du delta incrémental) + idempotence des opérations hors connexion (Bloc 4).
-- Additive, idempotente, RLS selon le motif 074. Le signal global existant (account_sync_versions
-- + triggers 056-059) reste inchangé : le journal est un FLUX de données en plus, pas un remplacement.
-- Colonnes vérifiées le 14/11/2026 : seules les tables avec organization_id sont journalisées ;
-- tables à secrets (mail_accounts) et tables sans organization_id (activity_contributions,
-- supplier_parts, support_messages) ne sont JAMAIS répliquées ; identifiants : id, ou clé
-- naturelle pour organization_members (user_id) et user_drafts (user_id:draft_key).

create table if not exists sync_entity_changes(
  id bigserial primary key,
  organization_id uuid not null,
  entity varchar(60) not null,
  entity_id varchar(80) not null,
  op varchar(10) not null check (op in ('upsert','delete')),
  changed_at timestamptz not null default now()
);
create index if not exists idx_sync_changes_cursor on sync_entity_changes(organization_id, id);
create index if not exists idx_sync_changes_entity on sync_entity_changes(organization_id, entity, entity_id);

create table if not exists sync_applied_ops(
  organization_id uuid not null,
  op_client_id varchar(64) not null,
  kind varchar(40) not null,
  entity varchar(60) not null default '',
  entity_ref varchar(80) not null default '',
  applied_at timestamptz not null default now(),
  result_ref varchar(80) not null default '',
  primary key (organization_id, op_client_id)
);
create index if not exists idx_sync_applied_ops_time on sync_applied_ops(organization_id, applied_at);

alter table sync_entity_changes enable row level security;
alter table sync_applied_ops enable row level security;
drop policy if exists tenant_isolation on sync_entity_changes;
create policy tenant_isolation on sync_entity_changes
  using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
  with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
drop policy if exists tenant_isolation on sync_applied_ops;
create policy tenant_isolation on sync_applied_ops
  using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
  with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));

-- Journal générique : tables disposant d'une colonne id.
create or replace function aurion_sync_journal_write() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r record; v_org uuid;
begin
  r := case when TG_OP = 'DELETE' then old else new end;
  v_org := r.organization_id;
  if v_org is null then return null; end if;
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values (v_org, TG_TABLE_NAME, r.id::text, case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

-- Variantes à clé naturelle : organization_members (organization_id, user_id) et user_drafts
-- (organization_id, user_id, draft_key) — pas de colonne id.
create or replace function aurion_sync_journal_write_member() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r record; v_org uuid;
begin
  r := case when TG_OP = 'DELETE' then old else new end;
  v_org := r.organization_id;
  if v_org is null then return null; end if;
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values (v_org, TG_TABLE_NAME, r.user_id::text, case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

create or replace function aurion_sync_journal_write_draft() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare r record; v_org uuid;
begin
  r := case when TG_OP = 'DELETE' then old else new end;
  v_org := r.organization_id;
  if v_org is null then return null; end if;
  insert into sync_entity_changes(organization_id, entity, entity_id, op)
    values (v_org, TG_TABLE_NAME, r.user_id::text || ':' || r.draft_key, case when TG_OP = 'DELETE' then 'delete' else 'upsert' end);
  return null;
end $fn$;

do $do$
declare t text;
begin
  -- Tables à colonne id + organization_id (registre backend/src/services/sync-replication.ts).
  foreach t in array array[
    'activities','accounting_entries','appointments','bank_transactions','client_intervention_addresses',
    'client_time_sessions','clients','devices','document_price_memory','document_templates','documents',
    'expense_reports','fiscal_options_history','generated_documents','interventions','invoice_installments',
    'invoice_payments','invoice_reminders','parts','quotes','sav_cases','suppliers','supplies',
    'support_tickets','warranties','warranty_policies'] loop
    if to_regclass('public.' || t) is not null
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='organization_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='id') then
      execute format('drop trigger if exists aurion_sync_journal_trigger on public.%I', t);
      execute format('create trigger aurion_sync_journal_trigger after insert or update or delete on public.%I for each row execute function aurion_sync_journal_write()', t);
    end if;
  end loop;
  -- Clés naturelles.
  execute 'drop trigger if exists aurion_sync_journal_trigger on public.organization_members';
  execute 'create trigger aurion_sync_journal_trigger after insert or update or delete on public.organization_members for each row execute function aurion_sync_journal_write_member()';
  execute 'drop trigger if exists aurion_sync_journal_trigger on public.user_drafts';
  execute 'create trigger aurion_sync_journal_trigger after insert or update or delete on public.user_drafts for each row execute function aurion_sync_journal_write_draft()';
end $do$;
