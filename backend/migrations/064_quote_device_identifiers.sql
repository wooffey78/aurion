-- Références facultatives de l’appareil sur les devis et factures de réparation.
-- Migration additive : les documents existants et les autres activités restent inchangés.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS imei varchar(80);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS serial_number varchar(160);
