-- 094 — V2 (chantier 2, suite) — Intégrations standard du journal profile_proposal_events.
-- Additive et idempotente : ré-exécutable sans erreur sur une base déjà migrée.
--
-- 1) Clé étrangère standard : toutes les tables portant organization_id référencent
-- organizations(id) ON DELETE CASCADE (convention 001-004). Le journal des propositions
-- suit donc le même cycle de vie que les données métier de l'espace : si l'organisation
-- venait à être supprimée par l'exploitation, le journal est purgé avec elle (aucun
-- reliquat orphelin, aucun écart à la convention).
--
-- 2) Réplication : le journal reçoit le trigger de journalisation orgkey (086), même
-- traitement que support_status_events — les décisions de choix de métier sont visibles
-- depuis chaque instance de l'espace, sans divergence.

-- 1) Clé étrangère standard (nettoyage défensif des orphelins avant pose).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profile_proposal_events_org_fk') then
    delete from profile_proposal_events
      where organization_id not in (select id from organizations where id is not null);
    alter table profile_proposal_events
      add constraint profile_proposal_events_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

-- 2) Journal de synchronisation orgkey (086) : toute écriture du journal des propositions
-- est enregistrée dans sync_entity_changes pour la réplication inter-instances.
drop trigger if exists aurion_sync_journal_trigger on public.profile_proposal_events;
create trigger aurion_sync_journal_trigger after insert or update or delete on public.profile_proposal_events
  for each row execute function aurion_sync_journal_write_orgkey();
