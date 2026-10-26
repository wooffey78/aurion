-- Étape 5 : coefficients de devis exprimables en pourcentage ou en euros.
alter table quotes add column if not exists coefficient_value numeric(12,4) not null default 0 check (coefficient_value >= 0);
alter table quotes add column if not exists coefficient_unit varchar(10) not null default 'percent' check (coefficient_unit in ('percent','euro'));
update quotes set coefficient_value=coalesce(margin_coefficient_percent,0), coefficient_unit='percent' where coefficient_value=0 and coalesce(margin_coefficient_percent,0)<>0;
