create table if not exists activity_forecast_assumptions (
  activity_id uuid primary key references activities(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  potential_clients_per_month integer not null default 0 check (potential_clients_per_month between 0 and 10000),
  average_ticket_ttc numeric(12,2) not null default 0 check (average_ticket_ttc between 0 and 1000000),
  variable_cost_per_repair numeric(12,2) not null default 0 check (variable_cost_per_repair between 0 and 1000000),
  fixed_monthly_costs numeric(12,2) not null default 0 check (fixed_monthly_costs between 0 and 10000000),
  reserve_percent numeric(6,2) not null default 0 check (reserve_percent between 0 and 100),
  updated_at timestamptz not null default now()
);
create index if not exists idx_activity_forecast_assumptions_org on activity_forecast_assumptions(organization_id, activity_id);
