-- L'interface de devis/factures autorise une adresse de facturation libre.
-- La contrainte historique n'acceptait que client/intervention et faisait échouer les éditions.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='quotes'::regclass
      AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%invoice_address_source%'
  LOOP
    EXECUTE format('alter table quotes drop constraint %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE quotes
  ADD CONSTRAINT quotes_invoice_address_source_check
  CHECK (invoice_address_source IN ('client','intervention','free'));
