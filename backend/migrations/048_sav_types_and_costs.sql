-- SAV v2 : remboursement/avoir financier ou intervention gratuite avec coût interne.
alter table sav_cases add column if not exists sav_type varchar(30) not null default 'financial' check(sav_type in ('financial','free_intervention'));
alter table sav_cases add column if not exists intervention_cost_ht numeric(12,2) not null default 0 check(intervention_cost_ht>=0);
create index if not exists idx_sav_cases_type on sav_cases(organization_id,activity_id,sav_type,created_at desc);
