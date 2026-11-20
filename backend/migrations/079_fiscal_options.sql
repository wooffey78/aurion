-- Bloc 9 — Situation fiscale déclarée : versement libératoire et périodicité URSSAF.
-- Ces choix ne sont PAS détectables au SIRET : ils sont DÉCLARÉS par l'entrepreneur,
-- avec date d'effet, date de changement et une distinction explicite entre
-- éligibilité théorique (règle d'impots.gouv), option effectivement exercée
-- (déclarée par l'utilisateur) et information non vérifiée (aucune source extérieure).
-- Additive et idempotente ; l'historique est conservé (mise à jour en cours d'année,
-- reconstitution historique, aucun écrasement).

-- 1) Option de versement libératoire déclarée : 'oui' (exercée), 'non' (explicitement
--    écartée), 'inconnu' (valeur par défaut — jamais une affirmation automatique).
alter table organizations add column if not exists vl_option varchar(10) not null default 'inconnu'
  check (vl_option in ('oui','non','inconnu'));
alter table organizations add column if not exists vl_verified boolean not null default false;
alter table organizations add column if not exists vl_effective_from date;

-- 2) Périodicité URSSAF déclarée : 'mensuelle' ou 'trimestrielle'.
alter table organizations add column if not exists urssaf_periodicity varchar(20)
  check (urssaf_periodicity in ('mensuelle','trimestrielle'));
alter table organizations add column if not exists urssaf_periodicity_effective_from date;
alter table organizations add column if not exists urssaf_periodicity_changed_at timestamptz;

-- 3) Historique des changements (mise à jour en cours d'année, reconstitution historique) :
-- chaque changement est horodaté avec sa source de saisie, jamais réécrit.
create table if not exists fiscal_options_history(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  field varchar(40) not null,
  value varchar(40) not null,
  effective_from date not null,
  source varchar(80) not null default 'déclaration utilisateur',
  recorded_at timestamptz not null default now()
);
create index if not exists idx_fiscal_options_history_org on fiscal_options_history(organization_id, field, effective_from);

-- 4) Isolation multi-tenant (bloc 2).
do $$
begin
  execute 'alter table fiscal_options_history enable row level security';
  execute 'drop policy if exists tenant_isolation on fiscal_options_history';
  execute $f$
    create policy tenant_isolation on fiscal_options_history
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
  $f$;
end $$;
