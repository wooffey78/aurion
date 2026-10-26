-- Aurion 15.2.30 : le délai de relance 0 est autorisé.
-- La migration 043 recherchait une représentation textuelle trop stricte de la contrainte PostgreSQL.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid='quotes'::regclass
      AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%reminder_interval_days%'
  LOOP
    EXECUTE format('ALTER TABLE quotes DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

UPDATE quotes
SET reminder_interval_days = LEAST(365, GREATEST(0, COALESCE(reminder_interval_days, 0)));

ALTER TABLE quotes
  ADD CONSTRAINT quotes_reminder_interval_days_range
  CHECK (reminder_interval_days BETWEEN 0 AND 365);
