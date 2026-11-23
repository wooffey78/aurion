-- 108 — Prompt 09 — Agenda unifié : origine des événements, indisponibilités et dérogations auditées.
-- Additive et idempotente : ré-exécutable sans erreur, sans réécriture des données existantes.
--
-- Règle du prompt 09 : centraliser rendez-vous, indisponibilités et tâches dans un modèle
-- commun ; distinguer événement interne / importé / synchronisé ; détecter les collisions
-- sans empêcher une dérogation EXPLICITEMENT autorisée et AUDITÉE ; ne jamais écraser
-- silencieusement. Le sens de synchronisation Google/iCal (poussée sortante, aucun import)
-- est inchangé et documenté — aucun champ d'import n'est déguisé en bidirectionnel.

-- 1) Origine et métadonnées des rendez-vous. Les rendez-vous existants restent 'internal'
--    (valeur par défaut, jamais de fausse origine).
alter table appointments add column if not exists origin varchar(20) not null default 'internal';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_origin_check') then
    alter table appointments
      add constraint appointments_origin_check
      check (origin in ('internal', 'external_import', 'synchronized'));
  end if;
end $$;
alter table appointments add column if not exists external_uid varchar(255);
alter table appointments add column if not exists timezone varchar(64);
alter table appointments add column if not exists recurrence_rule varchar(200);

-- 2) Indisponibilités de l'entrepreneur (congés, formation, fermeture) : participent à la
--    détection de collisions et à la vue agenda unifiée. Lecture/réplication standard.
create table if not exists calendar_unavailabilities(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  activity_id uuid,
  user_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason varchar(240) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_unavailabilities_org_idx
  on calendar_unavailabilities(organization_id, starts_at);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'calendar_unavailabilities_org_fk') then
    alter table calendar_unavailabilities
      add constraint calendar_unavailabilities_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

alter table calendar_unavailabilities enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'calendar_unavailabilities'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.calendar_unavailabilities
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_unavailabilities_trigger on public.calendar_unavailabilities;
create trigger aurion_sync_unavailabilities_trigger after insert or update or delete on public.calendar_unavailabilities
  for each row execute function aurion_sync_journal_write_orgkey();

-- 3) Audit des dérogations de collision : une réservation en créneau occupé n'est jamais
--    silencieuse — le motif de la dérogation est conservé avec les éléments en conflit.
create table if not exists calendar_override_audit(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  appointment_id uuid,
  conflict_items jsonb not null,
  reason varchar(400) not null,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists calendar_override_audit_org_idx
  on calendar_override_audit(organization_id, created_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'calendar_override_audit_org_fk') then
    alter table calendar_override_audit
      add constraint calendar_override_audit_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

alter table calendar_override_audit enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'calendar_override_audit'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.calendar_override_audit
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_override_audit_trigger on public.calendar_override_audit;
create trigger aurion_sync_override_audit_trigger after insert or update or delete on public.calendar_override_audit
  for each row execute function aurion_sync_journal_write_orgkey();
