-- 101 — Bloc 19 (prompt général) : harmonisation — comblement des trous d'isolation RLS
-- recensés par l'audit, sans toucher aux migrations déjà appliquées.
-- `account_deletion_requests` porte organization_id (088) mais était absente des politiques
-- 074+ : l'isolation est ajoutée ici, à l'identique des autres tables métier.
-- `micro_rates` reste volontairement lisible par tous les tenants : c'est un référentiel
-- partagé en lecture (barèmes datés), sans donnée d'entreprise (choix documenté 078).

do $$
declare
  t text;
  direct_tables text[] := array[
    'account_deletion_requests'
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

-- Index de recherche documentaire (bloc 16) : filtres déterministes.
create index if not exists idx_documents_org_category on documents(organization_id, category, created_at desc) where status <> 'deleted';
create index if not exists idx_documents_org_sha on documents(organization_id, sha256) where sha256 is not null;
