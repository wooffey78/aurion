-- Aurion 15.2.6 : sécurisation additive du paiement des factures et de la trésorerie.
-- Ne modifie aucun calcul métier existant.

alter table invoice_payments add column if not exists paid_at timestamptz not null default now();
alter table invoice_payments add column if not exists reference varchar(160);
alter table invoice_payments add column if not exists note text;
alter table invoice_payments add column if not exists created_by uuid references users(id) on delete set null;
alter table invoice_payments add column if not exists created_at timestamptz not null default now();
alter table invoice_payments add column if not exists organization_id uuid references organizations(id) on delete cascade;
alter table invoice_payments add column if not exists quote_id uuid references quotes(id) on delete cascade;
alter table invoice_payments add column if not exists amount numeric(12,2);
alter table invoice_payments add column if not exists payment_method varchar(20);

update invoice_payments p
set organization_id=q.organization_id
from quotes q
where p.quote_id=q.id and p.organization_id is null;

create index if not exists idx_invoice_payments_quote on invoice_payments(organization_id,quote_id,paid_at desc);
