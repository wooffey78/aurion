-- 093 — V2 (chantier 2) — Moteur de propositions de métiers : origine du choix retenu
-- et journal des propositions. Additive et idempotente : ré-exécutable sans erreur sur
-- une base déjà migrée, sans réécriture des données existantes.
--
-- Règle fondamentale (conception V2) : un métier choisi ou corrigé manuellement devient
-- la référence retenue par l'utilisateur ; une détection automatique ne l'écrase jamais.
-- La table activity_profile_overrides porte donc désormais l'ORIGINE du choix :
--   'auto'      : proposé puis accepté sans correction par le parcours guidé,
--   'confirmed' : proposition du moteur confirmée explicitement par l'utilisateur,
--   'manual'    : sélectionné ou corrigé entièrement à la main (valeur par défaut des
--                 surcharges préexistantes, pour ne jamais rétrograder un choix déjà posé).
-- Le journal profile_proposal_events trace propositions, confirmations, changements
-- manuels et retraits : on peut reconstruire ce que l'utilisateur a vu et décidé.

-- 1) Origine du choix sur la sélection retenue (surcharges préexistantes = 'manual').
alter table activity_profile_overrides add column if not exists origin varchar(20) not null default 'manual';
alter table activity_profile_overrides add column if not exists chosen_from_proposal varchar(64);
alter table activity_profile_overrides add column if not exists chosen_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'activity_profile_overrides_origin_check') then
    alter table activity_profile_overrides
      add constraint activity_profile_overrides_origin_check
      check (origin in ('auto', 'confirmed', 'manual'));
  end if;
end $$;

-- 2) Journal des propositions et des décisions (aucune donnée client : uniquement le
-- cycle de vie du choix de métier, avec le contenu affiché de la proposition).
create table if not exists profile_proposal_events(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  activity_id uuid not null,
  kind varchar(30) not null check (kind in
    ('proposed', 'applied', 'confirmed', 'manual_change', 'removed', 'ignored')),
  profile_code varchar(120),
  confidence varchar(20),
  reasons jsonb,
  proposal jsonb,
  created_at timestamptz not null default now()
);
create index if not exists profile_proposal_events_org_activity_idx
  on profile_proposal_events(organization_id, activity_id, created_at desc);

-- 3) Isolation multi-tenant : la table porte organization_id, politique standard 074
-- (contexte tenant transactionnel ou rôle membre de aurion_admin ; échec fermé sinon).
alter table profile_proposal_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'profile_proposal_events'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.profile_proposal_events
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;
