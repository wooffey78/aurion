-- Aurion 15.2 — choix de traitement des frais kilométriques.
alter table quotes add column if not exists mileage_mode varchar(20) not null default 'margin' check (mileage_mode in ('margin','client_price'));
