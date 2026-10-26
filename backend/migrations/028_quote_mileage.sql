-- Aurion 15.2.26 — frais kilométriques par devis/facture.
-- Additif uniquement : les montants historiques restent inchangés.
alter table quotes add column if not exists mileage_km numeric(12,2) not null default 0 check (mileage_km >= 0);
alter table quotes add column if not exists mileage_rate numeric(8,4) not null default 0 check (mileage_rate >= 0);
alter table quotes add column if not exists mileage_total numeric(12,2) not null default 0 check (mileage_total >= 0);
