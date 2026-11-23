-- 074 — Isolation multi-tenant par Row Level Security (RLS) PostgreSQL.
-- Additive et idempotente : ré-exécutable sans erreur sur une base déjà migrée.
--
-- Principe : chaque table métier portant organization_id est protégée par une politique
-- « organization_id = contexte tenant courant » OU « rôle membre de aurion_admin » (accès
-- inter-entreprises explicite : console d'administration, travaux planifiés, webhook Stripe).
-- En l'absence de contexte tenant (current_setting('app.current_organization') absent ou vide),
-- la politique ne correspond AUCUNE ligne : échec fermé, y compris pour les INSERT (WITH CHECK).
--
-- Le contexte est posé par l'application au niveau transactionnel (SET LOCAL via
-- set_config(..., true)) : il disparaît au COMMIT/ROLLBACK et ne peut jamais contaminer
-- une connexion réutilisée du pool.
--
-- Périmètre volontairement exclu (tables d'identité accédées avant toute organisation active :
-- connexion, inscription, sélection d'organisation, rafraîchissement de session, états OAuth
-- à usage unique lus par les callbacks publics) : users, organizations, organization_members,
-- native_sessions, password_reset_tokens, webauthn_challenges, webauthn_credentials,
-- google_oauth_states, cloud_oauth_states, plans, modules, platform_admins, legal_documents,
-- legal_acceptances, billing_webhook_events, admin_guest_invites, vip_guest_accounts.
-- Ces tables restent protégées par les contrôles applicatifs existants.
--
-- ENABLE (sans FORCE) : l'application n'est jamais propriétaire des tables (rôle runtime
-- distinct du rôle de migration, exigé en production par config.ts) ; le rôle de migration,
-- propriétaire, reste libre d'exécuter d'éventuels compléments de données.

-- 1) Fonction de contexte tenant (NULL si absent ou vide → échec fermé).
create or replace function aurion_tenant_org() returns uuid
language sql stable as $$
  select nullif(current_setting('app.current_organization', true), '')::uuid
$$;

-- 2) Journal des accès inter-entreprises explicites (écrit uniquement par le rôle d'administration).
create table if not exists platform_admin_access_log(
  id bigserial primary key,
  operation text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
revoke all on table public.platform_admin_access_log from public;

-- 3) Rôle SQL du chemin d'administration inter-entreprises (sans login ; le login dédié est
--    créé par l'exploitation/CI : CREATE ROLE … LOGIN IN ROLE aurion_admin).
--    Les grants couvrent la table d'audit créée ci-dessus ET les tables futures.
do $$
declare
  owner text := current_user;
begin
  if not exists (select 1 from pg_roles where rolname = 'aurion_admin') then
    create role aurion_admin nologin;
  end if;
end
$$;
grant usage on schema public to aurion_admin;
grant select, insert, update, delete on all tables in schema public to aurion_admin;
grant usage, select, update on all sequences in schema public to aurion_admin;
do $$
declare
  owner text := current_user;
begin
  execute format('alter default privileges for role %I in schema public grant select, insert, update, delete on tables to aurion_admin', owner);
  execute format('alter default privileges for role %I in schema public grant usage, select, update on sequences to aurion_admin', owner);
end
$$;

-- 4) Politiques d'isolation : tables métier portant organization_id.
--    Idempotent : la politique existante est supprimée puis recréée à l'identique.
do $$
declare
  t text;
  direct_tables text[] := array[
    'account_sync_versions','accounting_entries','activities','activity_forecast_assumptions',
    'administrative_document_links','administrative_formalities','administrative_mail_connections',
    'administrative_mail_items','administrative_mail_oauth_states','administrative_mail_send_connections',
    'administrative_mail_send_locks','appointments','billing_payment_requests','client_intervention_addresses',
    'client_time_sessions','clients','cloud_audit_events','cloud_connections','cloud_documents','cloud_folders',
    'contract_withdrawal_requests','dashboard_journal_events','devices','document_number_sequences',
    'document_price_memory','document_templates','document_themes','documents','electronic_invoice_profiles',
    'email_signatures','expense_reports','generated_documents','google_connections','interventions',
    'invoice_installments','invoice_payments','invoice_reminders','mail_accounts','notification_jobs',
    'onboarding_journeys','organization_modules','parts','quotes','recommendation_patterns','sav_cases',
    'subscription_events','subscription_invoices','subscriptions','suppliers','supplies','support_tickets',
    'user_drafts','warranties','warranty_policies'
  ];
begin
  foreach t in array direct_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
        with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
    $f$, t);
  end loop;
end
$$;

-- 5) Tables liées sans colonne organization_id : isolation via la table mère.
do $$
declare
  t text;
  parent text;
  fk text;
  joins text[] := array[
    'quote_items:quotes:quote_id',
    'support_messages:support_tickets:ticket_id',
    'support_status_events:support_tickets:ticket_id',
    'supplier_parts:suppliers:supplier_id',
    'template_versions:document_templates:template_id',
    'activity_contributions:activities:activity_id',
    'activity_profile_overrides:activities:activity_id'
  ];
  parts text[];
begin
  foreach t in array joins loop
    parts := string_to_array(t, ':');
    parent := parts[2];
    fk := parts[3];
    execute format('alter table public.%I enable row level security', parts[1]);
    execute format('drop policy if exists tenant_isolation on public.%I', parts[1]);
    execute format($f$
      create policy tenant_isolation on public.%I
        using (
          exists (select 1 from public.%I p where p.id = %I and p.organization_id = aurion_tenant_org())
          or pg_has_role(current_user, 'aurion_admin', 'member')
        )
        with check (
          exists (select 1 from public.%I p where p.id = %I and p.organization_id = aurion_tenant_org())
          or pg_has_role(current_user, 'aurion_admin', 'member')
        )
    $f$, parts[1], parent, fk, parent, fk);
  end loop;
end
$$;

-- 6) Le rôle runtime ne doit ni lire ni écrire le journal des accès administratifs
--    (géré par migrate.ts via REVOKE, comme pour schema_migrations).

-- 7) Fonctions trigger de synchronisation de compte (056/057) : elles incrémentent
--    account_sync_versions — table protégée par la RLS — notamment depuis les triggers des
--    tables d'identité (organizations, organization_members) sollicitées hors contexte tenant
--    (inscription, sélection d'organisation). SECURITY DEFINER avec search_path verrouillé :
--    la fonction ne modifie que la ligne de l'organisation reçue en paramètre.
alter function public.touch_account_sync(uuid) security definer set search_path = public;
alter function public.aurion_bump_account_sync() security definer set search_path = public;
alter function public.aurion_bump_user_sync() security definer set search_path = public;
alter function public.aurion_bump_author_sync() security definer set search_path = public;
