create table if not exists document_templates(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid references activities(id) on delete cascade,
  document_type varchar(20) not null check(document_type in ('quote','invoice')),
  name varchar(240) not null,
  mime_type varchar(160) not null,
  size_bytes bigint not null default 0,
  storage_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_document_templates_scope on document_templates(organization_id,activity_id,document_type,active,created_at desc);

create table if not exists generated_documents(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid references activities(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  document_type varchar(20) not null check(document_type in ('quote','invoice')),
  template_id uuid references document_templates(id) on delete set null,
  docx_key text,
  odt_key text,
  pdf_key text,
  created_at timestamptz not null default now()
);
create index if not exists idx_generated_documents_quote on generated_documents(quote_id,created_at desc);
alter table activities add column if not exists legal_form varchar(120);
alter table activities add column if not exists cgv_text text;
alter table quotes add column if not exists cgv_snapshot text;

update activities set cgv_text=coalesce(cgv_text,case
 when lower(name||' '||coalesce(description,'')) ~ '(smartphone|mobile|téléphone|easyfixit)' then 'Conditions applicables aux réparations et ventes de pièces. Le devis accepté vaut accord sur les prestations et fournitures décrites. Les pièces, garanties et exclusions sont celles indiquées sur le document. Toute intervention complémentaire fait l''objet d''un accord préalable. Les appareils confiés restent sous la responsabilité du client pour les sauvegardes et données.'
 when lower(name||' '||coalesce(description,'')) ~ '(web|dévelop|develop|saas|logiciel|application|easyweb)' then 'Conditions applicables aux prestations numériques. Le périmètre, les livrables, délais et modalités de recette sont ceux du devis accepté. Toute évolution hors périmètre fait l''objet d''un chiffrage complémentaire. Les abonnements, hébergements, licences et services tiers sont facturés selon les conditions indiquées.'
 else 'Conditions générales applicables aux prestations de l''activité. Le devis accepté définit le périmètre, les fournitures, les prestations, les prix et les délais. Toute modification hors périmètre fait l''objet d''un accord complémentaire. Les garanties applicables sont celles indiquées sur le document.' end);
