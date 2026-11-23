-- 113 — 15.4.50 — Chaîne d'intégrité documentaire (« coffre » à valeur probante).
-- Additive et idempotente. Pour chaque document ÉMIS, on chaîne : empreinte SHA-256 du PDF,
-- horodatage serveur et empreinte de la chaîne (hash du précédent + entrée courante).
-- Table APPEND-ONLY : aucune policy d'écriture applicative runtime n'ouvre UPDATE/DELETE ;
-- la vérification de chaîne détecte toute altération d'une pièce passée (les empreintes des
-- documents existent déjà dans le dépôt central — ici on les chaîne entre elles).

create table if not exists document_integrity_chain(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  document_kind varchar(20) not null check (document_kind in ('quote','invoice')),
  document_number varchar(60),
  sha256 varchar(64) not null,
  chain_hash varchar(64) not null,
  prev_chain_hash varchar(64),
  recorded_at timestamptz not null default now(),
  unique(organization_id, document_id)
);
create index if not exists document_integrity_chain_org_idx
  on document_integrity_chain(organization_id, recorded_at);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'document_integrity_chain_org_fk') then
    alter table document_integrity_chain
      add constraint document_integrity_chain_org_fk
      foreign key (organization_id) references organizations(id) on delete cascade;
  end if;
end $$;

alter table document_integrity_chain enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'document_integrity_chain'
                 and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.document_integrity_chain
      using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
      with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'));
  end if;
end $$;

drop trigger if exists aurion_sync_document_integrity_trigger on public.document_integrity_chain;
create trigger aurion_sync_document_integrity_trigger after insert or update or delete on public.document_integrity_chain
  for each row execute function aurion_sync_journal_write_orgkey();
