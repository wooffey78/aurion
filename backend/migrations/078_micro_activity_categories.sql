-- Bloc 8 — Détection SIRET, activité réelle et calcul des cotisations :
-- référentiel VERSIONNÉ des taux micro-entrepreneur par catégorie d'activité, daté, avec
-- source et date de vérification ; catégories d'activité au niveau du document, des lignes
-- de devis/facture, du catalogue (pièces) et des prestations. Additive et idempotente.
-- Les anciennes règles (taux unique urssaf_rate du document) restent intactes : les calculs
-- historiques sont reproductibles sans réécriture.

-- 1) Versions du référentiel (chaque version est figée, datée, sourcée et vérifiée).
create table if not exists micro_referential_versions(
  id uuid primary key default gen_random_uuid(),
  version varchar(40) not null,
  effective_from date not null,
  effective_to date,
  source text not null,
  verified_on date not null,
  created_at timestamptz not null default now(),
  unique(version)
);

-- 2) Taux par catégorie pour chaque version : cotisations sociales (micro-social),
-- contribution à la formation professionnelle (CFP), versement libératoire (optionnel,
-- bloc 9), assiette explicite. Impôt et cotisations restent distincts.
create table if not exists micro_rates(
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references micro_referential_versions(id) on delete cascade,
  category varchar(30) not null,
  label varchar(160) not null,
  social_rate numeric(5,2) not null check (social_rate >= 0 and social_rate <= 100),
  cfp_rate numeric(5,2) not null default 0 check (cfp_rate >= 0 and cfp_rate <= 100),
  tax_rate numeric(5,2) check (tax_rate >= 0 and tax_rate <= 100),
  basis text not null,
  unique(version_id, category)
);

-- 3) Version 2026 (source : entreprendre.service-public.gouv.fr F36232 et impots.gouv.fr
-- « versement libératoire », vérifiés le 14 novembre 2026) :
--   vente de marchandises (BIC) 12,30 % · CFP 0,10 % · VL 1,00 %
--   prestations de services commerciales ou artisanales (BIC) 21,20 % · CFP 0,30 % · VL 1,70 %
--   autres prestations de services (BNC) 25,60 % · CFP 0,20 % · VL 2,20 %
--   professions libérales réglementées (CIPAV) 23,20 % · CFP 0,20 % · VL 2,20 %
insert into micro_referential_versions(id,version,effective_from,source,verified_on)
select '11111111-1111-4111-8111-111111111111'::uuid,'2026',make_date(2026,1,1),
       'entreprendre.service-public.gouv.fr/vosdroits/F36232 · impots.gouv.fr (versement libératoire)',
       make_date(2026,11,14)
on conflict (version) do nothing;

insert into micro_rates(id,version_id,category,label,social_rate,cfp_rate,tax_rate,basis)
values
  ('22222222-2222-4222-8222-222222222201'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'vente_bic','Vente de marchandises, de biens et fourniture de logement (BIC)',12.30,0.10,1.00,'chiffre d''affaires HT'),
  ('22222222-2222-4222-8222-222222222202'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'services_bic','Prestations de services commerciales ou artisanales (BIC)',21.20,0.30,1.70,'chiffre d''affaires HT'),
  ('22222222-2222-4222-8222-222222222203'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'services_bnc','Autres prestations de services et professions libérales non réglementées (BNC)',25.60,0.20,2.20,'chiffre d''affaires HT'),
  ('22222222-2222-4222-8222-222222222204'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'services_bnc_cipav','Professions libérales réglementées affiliées CIPAV (BNC)',23.20,0.20,2.20,'chiffre d''affaires HT'),
  ('22222222-2222-4222-8222-222222222205'::uuid,'11111111-1111-4111-8111-111111111111'::uuid,'specific','Activité à règles spécifiques (rattachement à confirmer auprès de l''URSSAF)',21.20,0.30,1.70,'chiffre d''affaires HT · taux indicatif, à confirmer')
on conflict (version_id, category) do nothing;

-- 4) Catégorie d'activité par document (valeur par défaut des lignes), par ligne,
-- par pièce du catalogue et par prestation. Vide = non renseigné (jamais un zéro).
alter table quotes add column if not exists activity_category varchar(30);
alter table quote_items add column if not exists activity_category varchar(30);
alter table parts add column if not exists activity_category varchar(30);
alter table interventions add column if not exists activity_category varchar(30);

-- 5) Journalisation du référentiel utilisé pour chaque document (instantané, reproductible) :
-- version + catégories réellement appliquées, écrites à l'enregistrement.
alter table quotes add column if not exists category_snapshot jsonb;

-- 6) Isolation et accès : le référentiel est un référentiel GLOBAL (aucune organization_id),
-- lisible par le rôle applicatif et non modifiable par lui (aucune policy d'écriture →
-- écriture refusée par RLS). La migration (rôle propriétaire) seule écrit le référentiel.
do $$
begin
  execute 'alter table micro_referential_versions enable row level security';
  execute 'drop policy if exists micro_referential_read on micro_referential_versions';
  execute 'create policy micro_referential_read on micro_referential_versions for select to aurion_runtime using (true)';
  execute 'alter table micro_rates enable row level security';
  execute 'drop policy if exists micro_referential_read on micro_rates';
  execute 'create policy micro_referential_read on micro_rates for select to aurion_runtime using (true)';
end $$;

grant select on micro_referential_versions, micro_rates to aurion_runtime;
