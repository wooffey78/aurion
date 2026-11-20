-- Aurion 13.2 : conditions et mentions légales propres à chaque activité (définies par l'utilisateur).
alter table activities add column if not exists payment_terms text;
alter table activities add column if not exists insurance_info text;
alter table activities add column if not exists mediator_info text;
alter table activities add column if not exists legal_notes text;
alter table activities add column if not exists quote_validity_days integer not null default 30 check (quote_validity_days between 1 and 365);
