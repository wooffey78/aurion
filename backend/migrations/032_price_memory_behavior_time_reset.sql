create table if not exists document_price_memory(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade, activity_id uuid not null references activities(id) on delete cascade, kind varchar(20) not null, signature text not null, price_ttc numeric(12,2) not null default 0, last_used_at timestamptz not null default now(), use_count integer not null default 1
);
create unique index if not exists uq_document_price_memory on document_price_memory(organization_id,activity_id,kind,signature);
create table if not exists recommendation_patterns(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade, activity_id uuid not null references activities(id) on delete cascade, service_signature text not null, part_signature text not null, use_count integer not null default 1, last_used_at timestamptz not null default now()
);
create unique index if not exists uq_recommendation_patterns on recommendation_patterns(organization_id,activity_id,service_signature,part_signature);
