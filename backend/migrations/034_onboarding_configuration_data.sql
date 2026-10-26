alter table organizations add column if not exists legal_form varchar(180);
alter table organizations add column if not exists address text;
alter table organizations add column if not exists postal_code varchar(20);
alter table organizations add column if not exists city varchar(120);
alter table organizations add column if not exists website text;
alter table organizations add column if not exists configuration_data jsonb not null default '{}'::jsonb;
