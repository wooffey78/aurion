-- Étape 23 : le délai entre relances peut être fixé à 0 jour.
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid='quotes'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) ILIKE '%reminder_interval_days%between 1 and 365%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE quotes DROP CONSTRAINT %I', c);
  END IF;
END$$;

ALTER TABLE quotes
  ADD CONSTRAINT quotes_reminder_interval_days_range
  CHECK (reminder_interval_days BETWEEN 0 AND 365);
