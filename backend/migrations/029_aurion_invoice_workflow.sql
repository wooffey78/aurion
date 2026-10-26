-- Aurion 15.2.28 — workflow factures : envoi ≠ règlement, relances automatiques et majorations cumulatives.
alter table quotes add column if not exists reminder_interval_days integer not null default 7 check (reminder_interval_days between 1 and 365);
alter table quotes add column if not exists next_reminder_at timestamptz;

alter table invoice_reminders drop constraint if exists invoice_reminders_reminder_number_check;
alter table invoice_reminders add constraint invoice_reminders_reminder_number_check check (reminder_number between 1 and 1000);
create index if not exists idx_quotes_next_reminder on quotes(organization_id,document_type,payment_status,next_reminder_at) where next_reminder_at is not null;

alter table activities add column if not exists configuration_defined boolean not null default false;
update activities set configuration_defined=true where legal_form is not null or social_auto_detected=true or vat_auto_detected=true;
