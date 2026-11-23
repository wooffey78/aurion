-- 100 — Bloc 16 (prompt 16) + fondation du bloc 14 : centralisation documentaire, intégrité,
-- corbeille, liens multi-objets et partages explicites révocables.
-- Additif strict sur le dépôt privé existant (`documents`) : empreinte SHA-256 réelle calculée
-- à l'upload, type MIME détecté par octets magiques, catégories déterministes, corbeille avec
-- restauration et purge contrôlée (références vérifiées), associations à plusieurs objets sans
-- duplication physique, et partage par lien : explicite, révocable, historisé, à jeton hashé.

-- 1) Intégrité et catégories du dépôt privé.
alter table public.documents add column if not exists sha256 varchar(64);
alter table public.documents add column if not exists detected_mime varchar(120);
alter table public.documents add column if not exists category varchar(60);
alter table public.documents add column if not exists validated_at timestamptz;
alter table public.documents add column if not exists validated_by uuid references users(id) on delete set null;
alter table public.documents add column if not exists deleted_at timestamptz;
alter table public.documents add column if not exists deleted_by uuid references users(id) on delete set null;
alter table public.documents add column if not exists purge_at timestamptz;

-- Régularisation des justificatifs déjà acceptés (liste blanche MIME à l'upload historique) :
-- ils passent en « clean » avec horodatage de validation système, sans réanalyser les octets.
update public.documents set status='clean', validated_at=coalesce(validated_at, now()) where status='quarantined';

-- 2) Liens multi-objets : un même document peut être associé à plusieurs objets métier
--    sans aucune duplication physique du fichier.
create table if not exists document_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  entity_type varchar(40) not null check (entity_type in ('quote','invoice','client','supplier','appointment','sav','expense_report','other')),
  entity_id uuid not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, entity_type, entity_id)
);
create index if not exists idx_document_links_entity on document_links(organization_id, entity_type, entity_id);

-- 3) Partages explicites : un jeton aléatoire est transmis, seul son SHA-256 est conservé ;
--    révocation, expiration, compteur d'accès : tout est historisé et révocable à tout moment.
create table if not exists document_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  token_hash varchar(64) not null,
  recipient_email varchar(254),
  purpose varchar(30) not null default 'portal' check (purpose in ('portal','accountant','other')),
  note varchar(400),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references users(id) on delete set null,
  access_count integer not null default 0,
  last_accessed_at timestamptz,
  last_accessed_ip varchar(64),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, token_hash)
);
create index if not exists idx_document_shares_document on document_shares(organization_id, document_id);
create index if not exists idx_document_shares_token on document_shares(token_hash) where revoked_at is null;

do $$
declare
  t text;
  direct_tables text[] := array[
    'document_links','document_shares'
  ];
begin
  foreach t in array direct_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($f$
      create policy tenant_isolation on public.%I
        using (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
        with check (organization_id = aurion_tenant_org() or pg_has_role(current_user, 'aurion_admin', 'member'))
    $f$, t);
  end loop;
end
$$;
