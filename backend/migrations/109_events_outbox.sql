-- 109 — Prompt 05 — Fondation de l'outbox transactionnel d'événements métier.
-- Additive et idempotente : ré-exécutable sans erreur, sans réécriture des données existantes.
--
-- Règle du prompt 05 : livraison « au moins une fois » SANS effet métier multiple. L'outbox
-- reçoit les événements DANS la transaction métier de l'opération source (publié = validé) ;
-- le worker livre ensuite vers les canaux disponibles (le journal de bord in-app en premier)
-- avec idempotence par clé unique, reprise après erreur, backoff exponentiel et lettre
-- morte après épuisement. Boucle impossible par construction : le canal journal n'est
-- JAMAIS re-publié dans l'outbox (pas d'événement→action→même événement).
--
-- Le journal de bord existant (dashboard_journal_events, 065) reste inchangé : il devient
-- un canal de livraison de l'outbox, pas un doublon du modèle.

create table if not exists business_events_outbox(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_type varchar(60) not null,
  event_version integer not null default 1,
  actor_id uuid,
  source_entity_type varchar(60),
  source_entity_id uuid,
  correlation_id varchar(120),
  payload jsonb,
  idempotency_key varchar(160) not null,
  status varchar(20) not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed', 'dead_lettered')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(organization_id, idempotency_key)
);
create index if not exists business_events_outbox_dispatch_idx
  on business_events_outbox(status, next_attempt_at);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'business_events_outbox_org_fk') then
    alter table business_events_outbox
      add constraint business_events_outbox_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

alter table business_events_outbox enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'business_events_outbox'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.business_events_outbox
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

-- Réplication inter-instances (086) : l'état de livraison est visible depuis chaque espace.
drop trigger if exists aurion_sync_outbox_trigger on public.business_events_outbox;
create trigger aurion_sync_outbox_trigger after insert or update or delete on public.business_events_outbox
  for each row execute function aurion_sync_journal_write_orgkey();
