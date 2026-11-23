-- 105 — Prompt 04 — Seuils réglementaires VERSIONNÉS et métadonnées du référentiel micro.
-- Additive et idempotente : ré-exécutable sans erreur, sans réécriture des données existantes.
--
-- Règle du prompt 04 : les paramètres calculatoires (seuils micro, franchise TVA) doivent
-- être datés, sourcés et versionnés en base comme le sont déjà les cotisations micro (078),
-- afin qu'une future révision annuelle (2027…) s'applique À SA DATE D'EFFET sans réécrire
-- l'historique. En l'absence de version en base pour une date donnée, les constantes du code
-- restent le repli déterministe documenté (aucun taux inventé).

-- 1) Seuils réglementaires par domaine et date d'effet (valeurs dans `values` jsonb).
create table if not exists regulatory_thresholds(
  id uuid primary key default gen_random_uuid(),
  domain varchar(60) not null,
  effective_from date not null,
  effective_to date,
  source text not null,
  verified_on date not null,
  values jsonb not null,
  created_at timestamptz not null default now(),
  unique(domain, effective_from)
);

-- 2) Version « micro 2026 » : valeurs IDENTIQUES aux constantes du code
--    (backend/src/services/fiscal-calendar.ts, THRESHOLDS_2026, vérifiées le 14/11/2026).
insert into regulatory_thresholds(id,domain,effective_from,source,verified_on,values)
select '44444444-4444-4444-8444-444444444401'::uuid,'micro',make_date(2026,1,1),
       'economie.gouv.fr (seuils micro 2026) · entreprendre.service-public.gouv.fr / impots.gouv.fr (franchise TVA)',
       make_date(2026,11,14),
       $${"sale":203100,"services":83600,"vatSaleBase":85000,"vatServicesBase":37500,"vatSaleMajorated":93500,"vatServicesMajorated":41250}$$::jsonb
on conflict (domain, effective_from) do nothing;

-- 3) Métadonnées complètes du référentiel micro (078) : date de publication, juridiction,
--    champ d'application et statut de vérification — colonnes additives à valeurs par
--    défaut neutres, aucune donnée historique réécrite.
alter table micro_referential_versions add column if not exists published_on date;
alter table micro_referential_versions add column if not exists jurisdiction varchar(60) not null default 'FR';
alter table micro_referential_versions add column if not exists scope text;
alter table micro_referential_versions add column if not exists verification_status varchar(20) not null default 'verified';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'micro_referential_versions_verification_status_check') then
    alter table micro_referential_versions
      add constraint micro_referential_versions_verification_status_check
      check (verification_status in ('draft', 'verified', 'to_reverify', 'unverified'));
  end if;
end $$;

-- 4) Isolation et accès : référentiel GLOBAL lisible et non modifiable par le rôle
--    applicatif (même contrat RLS que 078).
do $$
begin
  execute 'alter table regulatory_thresholds enable row level security';
  execute 'drop policy if exists regulatory_thresholds_read on regulatory_thresholds';
  execute 'create policy regulatory_thresholds_read on regulatory_thresholds for select to aurion_runtime using (true)';
end $$;

grant select on regulatory_thresholds to aurion_runtime;
