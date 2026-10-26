-- Aurion V8: professional profiles, editable documents, Google integration, notifications.
alter table quotes add column if not exists final_price_ttc numeric(12,2);
alter table quotes add column if not exists warranty_text text;
alter table quotes add column if not exists sent_at timestamptz;
alter table quotes add column if not exists paid_at timestamptz;
alter table appointments add column if not exists google_event_id varchar(255);
alter table appointments add column if not exists reminder_before_sent_at timestamptz;
alter table appointments add column if not exists reminder_after_sent_at timestamptz;

create table if not exists google_connections(
  organization_id uuid primary key references organizations(id) on delete cascade,
  google_email varchar(254),
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists google_oauth_states(
  state varchar(180) primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists idx_google_oauth_states_expiry on google_oauth_states(expires_at);

create table if not exists notification_jobs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete cascade,
  kind varchar(40) not null,
  run_at timestamptz not null,
  status varchar(20) not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notification_jobs_due on notification_jobs(status,run_at);

create table if not exists activity_profile_overrides(
  activity_id uuid primary key references activities(id) on delete cascade,
  profile_code varchar(80) not null,
  updated_at timestamptz not null default now()
);

-- Complément des catalogues métier (ajouts uniquement : aucune suppression de données utilisateur).
insert into parts(organization_id,activity_id,name,category,quality,selling_price)
select a.organization_id,a.id,x.name,x.category,'Service / ressource',0
from activities a cross join lateral (values
 ('Nom de domaine','Infrastructure'),('Hébergement','Infrastructure'),('Licence logicielle','Logiciels'),('API / service tiers','Services externes'),('Maintenance technique','Services')
) x(name,category)
where lower(a.name||' '||coalesce(a.description,'')) ~ '(web|dévelop|develop|saas|logiciel|application|easyweb)'
  and not exists(select 1 from parts p where p.activity_id=a.id and p.name=x.name);

insert into interventions(organization_id,activity_id,name,description,default_duration_minutes,default_price)
select a.organization_id,a.id,x.name,x.description,x.duration,0
from activities a cross join lateral (values
 ('Site vitrine','Création ou refonte de site vitrine',480),('E-commerce','Création ou évolution d’une boutique en ligne',720),('Application web','Conception et développement d’une application web',960),('Application mobile','Conception et développement mobile',1200),('SaaS','Conception et développement d’un logiciel SaaS',1600),('Maintenance / support','Maintenance corrective et évolutive',120)
) x(name,description,duration)
where lower(a.name||' '||coalesce(a.description,'')) ~ '(web|dévelop|develop|saas|logiciel|application|easyweb)'
  and not exists(select 1 from interventions i where i.activity_id=a.id and i.name=x.name);
