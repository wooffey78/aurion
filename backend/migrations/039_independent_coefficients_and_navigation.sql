-- Coefficients Aurion indépendants : pièce et main-d'œuvre.
alter table activities add column if not exists default_part_coefficient_percent numeric(8,4) not null default 0 check (default_part_coefficient_percent >= 0);
alter table activities add column if not exists default_labor_coefficient_percent numeric(8,4) not null default 0 check (default_labor_coefficient_percent >= 0);
alter table quotes add column if not exists part_coefficient_percent numeric(8,4) not null default 0 check (part_coefficient_percent >= 0);
alter table quotes add column if not exists labor_coefficient_percent numeric(8,4) not null default 0 check (labor_coefficient_percent >= 0);
create index if not exists idx_activities_coefficients on activities(organization_id,default_part_coefficient_percent,default_labor_coefficient_percent);
