-- Aurion calculs v2 : source de vérité, coûts/prix séparés, règles persistées.
alter table quotes add column if not exists mileage_internal_rate numeric(8,4) not null default 0 check(mileage_internal_rate>=0);
alter table quotes add column if not exists mileage_client_rate numeric(8,4) not null default 0 check(mileage_client_rate>=0);
alter table quotes add column if not exists labor_selling_ht numeric(12,2) not null default 0 check(labor_selling_ht>=0);
alter table quotes add column if not exists labor_internal_cost_ht numeric(12,2) not null default 0 check(labor_internal_cost_ht>=0);
alter table quotes add column if not exists purchase_vat_mode varchar(20) not null default 'auto' check(purchase_vat_mode in ('auto','manual','exempt'));
alter table quotes add column if not exists purchase_vat_rate numeric(5,2) check(purchase_vat_rate is null or purchase_vat_rate between 0 and 100);
alter table quotes add column if not exists contribution_snapshot jsonb not null default '[]'::jsonb;
alter table quotes add column if not exists calculation_snapshot jsonb not null default '{}'::jsonb;
alter table quotes add column if not exists calculation_version integer not null default 2;
alter table quote_items add column if not exists vat_rate numeric(5,2) check(vat_rate is null or vat_rate between 0 and 100);
create index if not exists idx_quotes_calculation_version on quotes(organization_id,calculation_version,created_at desc);
