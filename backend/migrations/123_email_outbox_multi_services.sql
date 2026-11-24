-- 15.4.63 — (1) Boîte d'envoi e-mail : la facturation reste validée sans messagerie configurée,
-- l'e-mail attend et part automatiquement dès que l'envoi redevient possible.
-- (2) Multi-prestations : les lignes de document portent un kind ('part' pièce, 'service'
-- prestation complémentaire) — aucune ligne n'est plus ajoutée automatiquement.
alter table quote_items add column if not exists kind varchar(20) not null default 'part';
create table if not exists email_outbox(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid,
  doc_type varchar(10) not null check (doc_type in ('quote','invoice')),
  recipient varchar(320) not null default '',
  subject varchar(400) not null default '',
  message text not null default '',
  status varchar(20) not null default 'pending' check (status in ('pending','sent','failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists email_outbox_pending on email_outbox(organization_id,status,created_at);
