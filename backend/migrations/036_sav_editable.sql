-- Étape 22 : le SAV doit être gérable comme les autres données métier.
alter table sav_cases add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_sav_cases_updated on sav_cases(updated_at desc);
