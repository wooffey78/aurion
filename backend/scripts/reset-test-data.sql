-- AURION : remise à zéro de l'environnement de test uniquement.
-- ATTENTION : cette opération supprime les données de toutes les tables applicatives.
-- Ne jamais exécuter sur une base de production.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname='public'
      AND tablename NOT IN ('schema_migrations')
      AND tablename NOT LIKE 'pg_%'
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', r.tablename);
  END LOOP;
END $$;
