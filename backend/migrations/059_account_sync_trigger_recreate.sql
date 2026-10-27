-- 059 — Recrée explicitement les triggers de synchronisation sur la liste blanche.
-- 058 supprimait les triggers trop larges ; cette migration remet uniquement les
-- tables métier autorisées. Aucune migration précédente n'est modifiée.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activities','activity_contributions','activity_profile_overrides','activity_regulatory_ack',
    'accounting_entries','appointments','client_time_sessions','clients','document_price_memory',
    'document_templates','document_themes','documents','electronic_invoice_profiles',
    'generated_documents','interventions','invoice_installments','invoice_payments',
    'invoice_reminders','mail_accounts','organization_members','organization_modules',
    'parts','quotes','sav_cases','supplier_parts','suppliers','supplies','support_tickets',
    'template_versions','user_drafts','warranties','warranty_policies'
  ] LOOP
    IF to_regclass(format('public.%I',t)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS aurion_account_sync_trigger ON public.%I',t);
      EXECUTE format('CREATE TRIGGER aurion_account_sync_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION aurion_bump_account_sync()',t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['organization_members','user_drafts','support_tickets','client_time_sessions','platform_admins','vip_guest_accounts','legal_acceptances','webauthn_credentials'] LOOP
    IF to_regclass(format('public.%I',t)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS aurion_user_sync_trigger ON public.%I',t);
      EXECUTE format('CREATE TRIGGER aurion_user_sync_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION aurion_bump_user_sync()',t);
    END IF;
  END LOOP;

  IF to_regclass('public.support_messages') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS aurion_author_sync_trigger ON public.support_messages';
    EXECUTE 'CREATE TRIGGER aurion_author_sync_trigger AFTER INSERT OR UPDATE OR DELETE ON public.support_messages FOR EACH ROW EXECUTE FUNCTION aurion_bump_author_sync()';
  END IF;
END $$;
