-- Étape 9 : rattachement d'un rendez-vous à un devis et conservation des données utiles à la fiche rendez-vous.
alter table appointments add column if not exists quote_id uuid references quotes(id) on delete set null;
alter table appointments add column if not exists address_source varchar(20) not null default 'free';
alter table appointments add column if not exists quote_total_ttc numeric(12,2);
alter table appointments add column if not exists quote_items jsonb not null default '[]'::jsonb;
create index if not exists idx_appointments_quote on appointments(quote_id);
