-- Réparation ciblée du schéma devis/factures pour garantir la compatibilité
-- des sauvegardes avec toutes les données actuellement utilisées par l'interface.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES activities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_price_ttc numeric(12,2),
  ADD COLUMN IF NOT EXISTS warranty_text text,
  ADD COLUMN IF NOT EXISTS cgv_snapshot text,
  ADD COLUMN IF NOT EXISTS mileage_km numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mileage_rate numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mileage_total numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mileage_mode varchar(20) NOT NULL DEFAULT 'margin',
  ADD COLUMN IF NOT EXISTS mileage_internal_rate numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mileage_client_rate numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_selling_ht numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_internal_cost_ht numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS part_coefficient_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labor_coefficient_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_coefficient_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coefficient_value numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coefficient_unit varchar(10) NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS coefficient_basis varchar(20) NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS invoice_address_source varchar(20) NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS billing_address_snapshot text,
  ADD COLUMN IF NOT EXISTS catalog_pricing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purchase_vat_mode varchar(20) NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS purchase_vat_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS contribution_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS calculation_version integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reminder_interval_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_penalty_mode varchar(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS late_penalty_value numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS structured_invoice jsonb;

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='quotes'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%invoice_address_source%' LOOP
    EXECUTE format('ALTER TABLE quotes DROP CONSTRAINT %I',c.conname);
  END LOOP;
END $$;
ALTER TABLE quotes ADD CONSTRAINT quotes_invoice_address_source_check CHECK (invoice_address_source IN ('client','intervention','free'));

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='quotes'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%mileage_mode%' LOOP
    EXECUTE format('ALTER TABLE quotes DROP CONSTRAINT %I',c.conname);
  END LOOP;
END $$;
ALTER TABLE quotes ADD CONSTRAINT quotes_mileage_mode_check CHECK (mileage_mode IN ('margin','client_price'));

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS sale_coefficient_percent numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_key text,
  ADD COLUMN IF NOT EXISTS part_id uuid REFERENCES parts(id) ON DELETE SET NULL;
