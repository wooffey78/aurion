create table if not exists contract_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  first_name varchar(100) not null,
  last_name varchar(100) not null,
  email varchar(254) not null,
  contract_reference varchar(1000) not null,
  contract_date date not null,
  declaration_text text not null,
  submitted_at timestamptz not null default now(),
  status varchar(24) not null default 'received'
    check (status in ('received','reviewing','processed','rejected')),
  receipt_sent_at timestamptz,
  receipt_delivery_status varchar(24) not null default 'pending'
    check (receipt_delivery_status in ('pending','sent','failed')),
  receipt_error_code varchar(80),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contract_withdrawal_email_date
  on contract_withdrawal_requests (lower(email), submitted_at desc);
create index if not exists idx_contract_withdrawal_status_date
  on contract_withdrawal_requests (status, submitted_at desc);
