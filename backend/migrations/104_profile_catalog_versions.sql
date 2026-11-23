-- 104 — Prompt 02 — Versionnage du catalogue de métiers (profils professionnels).
-- Additive et idempotente : ré-exécutable sans erreur, sans réécriture des données existantes.
--
-- Règle du prompt 02 : chaque profil du catalogue porte une VERSION, une provenance et une
-- date d'effet ; l'évolution du catalogue ne réécrit JAMAIS rétroactivement les décisions
-- historiques (le choix de métier retenu conserve la version du catalogue en vigueur au
-- moment de la décision). Le catalogue vivant reste dans le code (profiles.ts, testé par le
-- corpus de calibrage) ; la table enregistre les versions identifiables et consultables,
-- selon le même modèle que le référentiel micro (078) : global, lisible, non modifiable par
-- le rôle applicatif.

-- 1) Versions du catalogue (chaque version est figée, datée, sourcée et vérifiée).
create table if not exists profile_catalog_versions(
  id uuid primary key default gen_random_uuid(),
  version varchar(40) not null,
  effective_from date not null,
  effective_to date,
  source text not null,
  verified_on date not null,
  created_at timestamptz not null default now(),
  unique(version)
);

-- 2) Entrées par profil pour chaque version (code, libellé, résumé — le contenu complet
--    reste porté par le code testé ; la table rend la version identifiable et auditable).
create table if not exists profile_catalog_entries(
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references profile_catalog_versions(id) on delete cascade,
  profile_code varchar(120) not null,
  title varchar(240) not null,
  payload jsonb,
  unique(version_id, profile_code)
);

-- 3) Version « 2026.11 » : 30 profils livrés avec la 15.4.48 (source : catalogue embarqué
--    Aurion, vérifié par le corpus de calibrage v2-profile-calibration). L'insertion est
--    idempotente ; les versions suivantes naîtront de nouvelles insertions (jamais d'UPDATE).
insert into profile_catalog_versions(id,version,effective_from,source,verified_on)
select '33333333-3333-4333-8333-333333333301'::uuid,'2026.11',make_date(2026,11,21),
       'Catalogue métiers embarqué Aurion (backend/src/services/profiles.ts) · corpus de calibrage 15.4.44',
       make_date(2026,11,21)
on conflict (version) do nothing;

-- Les entrées de la version 2026.11 sont insérées par le service au premier accès
-- (registerProfileCatalogEntries) : la liste des profils reste la source unique du code,
-- la table ne la duplique qu'une fois, sans risque de divergence à l'écriture.

-- 4) La décision de métier retenue référence la version du catalogue en vigueur à la
--    décision (NULL pour les décisions antérieures : jamais de réécriture rétroactive).
alter table activity_profile_overrides add column if not exists profile_version varchar(40);

-- 5) Isolation et accès : référentiel GLOBAL (aucune organization_id), lisible par le rôle
--    applicatif et non modifiable par lui (aucune policy d'écriture → écriture refusée par
--    RLS), exactement comme le référentiel micro (078).
do $$
begin
  execute 'alter table profile_catalog_versions enable row level security';
  execute 'drop policy if exists profile_catalog_read on profile_catalog_versions';
  execute 'create policy profile_catalog_read on profile_catalog_versions for select to aurion_runtime using (true)';
  execute 'alter table profile_catalog_entries enable row level security';
  execute 'drop policy if exists profile_catalog_read on profile_catalog_entries';
  execute 'create policy profile_catalog_read on profile_catalog_entries for select to aurion_runtime using (true)';
end $$;

grant select on profile_catalog_versions, profile_catalog_entries to aurion_runtime;
