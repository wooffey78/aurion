-- 106 — Prompt 07 — Cycle commercial : décisions explicites du devis et historique des statuts.
-- Additive et idempotente : ré-exécutable sans erreur, sans réécriture des données existantes.
--
-- Règle du prompt 07 : le cycle prospect→devis→acceptation/refus/expiration→facture→paiement
-- →clôture est explicite. Les décisions (acceptation, refus, expiration, annulation) deviennent
-- des états horodatés sur le document, chaque transition de statut est historisée avec son
-- acteur et son motif. Les statuts antérieurs ('draft', 'issued', 'paid'…) restent inchangés.

-- 1) Décisions horodatées sur les documents (NULL = décision jamais prise ; les documents
--    existants ne sont pas réécrits).
alter table quotes add column if not exists accepted_at timestamptz;
alter table quotes add column if not exists rejected_at timestamptz;
alter table quotes add column if not exists rejection_reason varchar(400);
alter table quotes add column if not exists expired_at timestamptz;
alter table quotes add column if not exists canceled_at timestamptz;
alter table quotes add column if not exists canceled_reason varchar(400);

-- 2) Historique des transitions de statut (ancien → nouveau, acteur, motif, horodatage).
--    L'historique n'est JAMAIS détruit : même une annulation de document conserve ses lignes.
create table if not exists document_status_history(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  from_status varchar(30),
  to_status varchar(30) not null,
  reason varchar(400),
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists document_status_history_doc_idx
  on document_status_history(organization_id, document_id, created_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'document_status_history_org_fk') then
    alter table document_status_history
      add constraint document_status_history_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

alter table document_status_history enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'document_status_history'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.document_status_history
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_status_history_trigger on public.document_status_history;
create trigger aurion_sync_status_history_trigger after insert or update or delete on public.document_status_history
  for each row execute function aurion_sync_journal_write_orgkey();
