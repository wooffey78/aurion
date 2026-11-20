-- Réduire le bruit de synchronisation : seuls les jeux de données métier autorisés
-- incrémentent la révision. Les journaux techniques, paiements plateforme et secrets de
-- sécurité ne doivent pas provoquer des rafraîchissements inter-appareils.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT ns.nspname, cl.relname, tr.tgname
    FROM pg_trigger tr
    JOIN pg_class cl ON cl.oid=tr.tgrelid
    JOIN pg_namespace ns ON ns.oid=cl.relnamespace
    WHERE NOT tr.tgisinternal
      AND ns.nspname='public'
      AND tr.tgname IN ('aurion_account_sync_trigger','aurion_user_sync_trigger','aurion_author_sync_trigger')
      AND NOT (
        (tr.tgname='aurion_account_sync_trigger' AND cl.relname = ANY(ARRAY[
          'activities','activity_contributions','activity_profile_overrides','activity_regulatory_ack',
          'accounting_entries','appointments','client_time_sessions','clients','document_price_memory',
          'document_templates','document_themes','documents','electronic_invoice_profiles',
          'generated_documents','interventions','invoice_installments','invoice_payments',
          'invoice_reminders','mail_accounts','organization_members','organization_modules',
          'parts','quotes','sav_cases','supplier_parts','suppliers','supplies','support_tickets',
          'template_versions','user_drafts','warranties','warranty_policies'
        ]::text[]))
        OR
        (tr.tgname='aurion_user_sync_trigger' AND cl.relname = ANY(ARRAY[
          'organization_members','user_drafts','support_tickets','client_time_sessions'
        ]::text[]))
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I',t.tgname,t.nspname,t.relname);
  END LOOP;
END $$;
