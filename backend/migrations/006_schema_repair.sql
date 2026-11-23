-- Aurion V11.3 defensive schema repair. Safe on fresh and existing installations.
create table if not exists document_templates(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
 activity_id uuid references activities(id) on delete cascade, document_type varchar(20) not null check(document_type in ('quote','invoice')),
 name varchar(240) not null, mime_type varchar(160) not null, size_bytes bigint not null default 0, storage_key text not null,
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_document_templates_scope on document_templates(organization_id,activity_id,document_type,active,created_at desc);
create table if not exists generated_documents(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
 activity_id uuid references activities(id) on delete set null, quote_id uuid references quotes(id) on delete set null,
 document_type varchar(20) not null check(document_type in ('quote','invoice')), template_id uuid references document_templates(id) on delete set null,
 docx_key text, odt_key text, pdf_key text, created_at timestamptz not null default now()
);
create index if not exists idx_generated_documents_quote on generated_documents(quote_id,created_at desc);
alter table activities add column if not exists legal_form varchar(120);
alter table activities add column if not exists cgv_text text;
alter table quotes add column if not exists cgv_snapshot text;
alter table quotes add column if not exists final_price_ttc numeric(12,2);
alter table quotes add column if not exists warranty_text text;
alter table quotes add column if not exists sent_at timestamptz;
alter table quotes add column if not exists paid_at timestamptz;
alter table appointments add column if not exists google_event_id varchar(255);
alter table appointments add column if not exists reminder_before_sent_at timestamptz;
alter table appointments add column if not exists reminder_after_sent_at timestamptz;
