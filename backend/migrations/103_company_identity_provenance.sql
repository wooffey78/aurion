-- 103 — Prompt 01 — Provenance et historique des identifiants légaux de la fiche entreprise.
-- Additive et idempotente : ré-exécutable sans erreur sur une base déjà migrée, sans
-- réécriture des données existantes.
--
-- Règle du prompt 01 : la fiche entreprise est l'unique source de vérité des identifiants
-- légaux ; la provenance (registre public ou saisie manuelle) et la date de consultation
-- sont conservées, ainsi que l'HISTORIQUE de chaque modification effective des champs
-- d'identité (nom, SIREN, SIRET, forme juridique, adresse). Aucune valeur n'est réécrite
-- rétroactivement : les lignes d'historique naissent uniquement des changements futurs.
--
-- Le modèle est calqué sur les fournisseurs (migrations 020/022 : registry_source,
-- registry_checked_at), qui portaient déjà cette provenance ; la fiche entreprise la
-- rejoint au même niveau d'exigence.

-- 1) Provenance sur la fiche entreprise (NULL = aucune consultation du registre enregistrée :
--    les organisations préexistantes restent telles quelles, jamais de fausse provenance).
alter table organizations add column if not exists identity_source varchar(40);
alter table organizations add column if not exists identity_checked_at timestamptz;

-- 2) Historique des modifications des champs d'identité (ancienne valeur, nouvelle valeur,
--    source déclarée de l'écriture, acteur identifié). Conserve la trace même après un
--    retour arrière : une ligne par changement effectif, jamais de mise à jour destructive.
create table if not exists organization_identity_history(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  field varchar(40) not null,
  old_value text,
  new_value text,
  source varchar(40) not null default 'saisie manuelle',
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists organization_identity_history_org_idx
  on organization_identity_history(organization_id, created_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organization_identity_history_org_fk') then
    alter table organization_identity_history
      add constraint organization_identity_history_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

-- 3) Isolation multi-tenant : politique standard 074 (contexte tenant transactionnel ou
--    rôle membre de aurion_admin ; échec fermé sinon) — même contrat que 093.
alter table organization_identity_history enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'organization_identity_history'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.organization_identity_history
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

-- 4) Réplication inter-instances : trigger orgkey 086 (même traitement que 094) — les
--    changements d'identité sont visibles depuis chaque instance de l'espace.
drop trigger if exists aurion_sync_identity_trigger on public.organization_identity_history;
create trigger aurion_sync_identity_trigger after insert or update or delete on public.organization_identity_history
  for each row execute function aurion_sync_journal_write_orgkey();
