-- Persist the user's choice to use catalog prices when a quote is saved.
alter table quotes add column if not exists catalog_pricing boolean not null default false;
create index if not exists idx_quotes_catalog_pricing on quotes(organization_id,catalog_pricing);
