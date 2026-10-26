create table if not exists activities(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code varchar(80) not null,
  name varchar(160) not null,
  description varchar(500),
  active boolean not null default true,
  urssaf_rate numeric(6,3),
  vat_rate numeric(5,2) not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,code)
);
create index if not exists idx_activities_org on activities(organization_id,active,name);

insert into activities(organization_id,code,name,description,urssaf_rate,vat_rate)
select o.id,
       regexp_replace(lower(coalesce(nullif(o.activity,''),'activite')),'[^a-z0-9]+','-','g') || '-' || substr(o.id::text,1,6),
       coalesce(nullif(o.activity,''),'Activité principale'),
       coalesce(o.custom_activity,''),
       0,20
from organizations o
where not exists(select 1 from activities a where a.organization_id=o.id);

alter table clients add column if not exists activity_id uuid references activities(id) on delete set null;
alter table quotes add column if not exists activity_id uuid references activities(id) on delete set null;
alter table appointments add column if not exists activity_id uuid references activities(id) on delete set null;
update clients c set activity_id=(select a.id from activities a where a.organization_id=c.organization_id order by a.created_at limit 1) where c.activity_id is null;
update quotes q set activity_id=(select a.id from activities a where a.organization_id=q.organization_id order by a.created_at limit 1) where q.activity_id is null;
update appointments x set activity_id=(select a.id from activities a where a.organization_id=x.organization_id order by a.created_at limit 1) where x.activity_id is null;
create index if not exists idx_clients_activity on clients(activity_id,created_at desc);
create index if not exists idx_quotes_activity on quotes(activity_id,created_at desc);
create index if not exists idx_appointments_activity on appointments(activity_id,starts_at);

create table if not exists suppliers(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade, name varchar(180) not null, email varchar(254), phone varchar(60), website text,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_suppliers_activity on suppliers(activity_id,name);

create table if not exists parts(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade, name varchar(240) not null, category varchar(120), model varchar(160), variant varchar(120), color varchar(80), quality varchar(80),
  reference varchar(120), stock numeric(12,2) not null default 0, selling_price numeric(12,2) not null default 0, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_parts_activity on parts(activity_id,name);

create table if not exists supplier_parts(
  id uuid primary key default gen_random_uuid(), supplier_id uuid not null references suppliers(id) on delete cascade,
  part_id uuid not null references parts(id) on delete cascade, supplier_reference varchar(120), purchase_price numeric(12,2) not null default 0,
  currency char(3) not null default 'EUR', available boolean not null default true, updated_at timestamptz not null default now(),
  unique(supplier_id,part_id)
);
create index if not exists idx_supplier_parts_part on supplier_parts(part_id,purchase_price);

create table if not exists interventions(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade, name varchar(180) not null, description text, default_duration_minutes integer, default_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_interventions_activity on interventions(activity_id,name);

create table if not exists devices(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade, client_id uuid not null references clients(id) on delete cascade,
  type varchar(80) not null, brand varchar(120), model varchar(160), imei varchar(80), serial_number varchar(120), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_devices_client on devices(client_id,imei);

create table if not exists warranty_policies(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade, name varchar(160) not null, scope_type varchar(30) not null default 'activity', scope_key varchar(160), duration_months integer not null default 12,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_warranty_activity on warranty_policies(activity_id);

create table if not exists warranties(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade, client_id uuid references clients(id) on delete set null, device_id uuid references devices(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null, policy_name varchar(160) not null, duration_months integer not null, starts_at timestamptz not null, ends_at timestamptz not null,
  snapshot_text text, created_at timestamptz not null default now()
);
create index if not exists idx_warranties_activity on warranties(activity_id,ends_at desc);
create index if not exists idx_warranties_device on warranties(device_id,ends_at desc);

create table if not exists regulatory_rules(
  id uuid primary key default gen_random_uuid(), source varchar(240) not null, title varchar(240) not null, summary text not null, effective_at date, detected_at timestamptz not null default now(), relevant_activity_codes text[] default '{}', official_url text, status varchar(30) not null default 'detected'
);
create table if not exists activity_regulatory_ack(
  activity_id uuid not null references activities(id) on delete cascade, rule_id uuid not null references regulatory_rules(id) on delete cascade,
  acknowledged_at timestamptz, applied boolean not null default false, primary key(activity_id,rule_id)
);

create table if not exists accounting_entries(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade, entry_type varchar(30) not null, amount numeric(12,2) not null, entry_date date not null default current_date,
  source_id uuid, label varchar(240), created_at timestamptz not null default now()
);
create index if not exists idx_accounting_activity_date on accounting_entries(activity_id,entry_date desc);

insert into interventions(organization_id,activity_id,name,description,default_duration_minutes,default_price)
select a.organization_id,a.id,x.name,x.description,x.duration,x.price from activities a cross join lateral (
 values
 ('Réparation','Intervention de réparation',60,0::numeric),
 ('SAV','Service après-vente',30,0::numeric),
 ('Installation','Installation / mise en service',90,0::numeric),
 ('Maintenance','Maintenance préventive ou corrective',60,0::numeric)
) x(name,description,duration,price)
where not exists(select 1 from interventions i where i.activity_id=a.id);

insert into warranty_policies(organization_id,activity_id,name,scope_type,scope_key,duration_months)
select a.organization_id,a.id,'Garantie standard','activity',null,12 from activities a
where not exists(select 1 from warranty_policies w where w.activity_id=a.id);

-- Modèles métier initiaux : uniquement si l'activité correspond au métier détecté.
insert into parts(organization_id,activity_id,name,category,model,variant,color,quality,reference,selling_price)
select a.organization_id,a.id,x.name,x.category,null,null,null,x.quality,x.reference,0
from activities a cross join lateral (values
 ('Écran smartphone','Écrans','Compatible',''),
 ('Batterie smartphone','Batteries','Compatible',''),
 ('Connecteur de charge','Connectique','Compatible',''),
 ('Vitre arrière','Châssis','Compatible',''),
 ('Adhésif écran','Consommables','Standard','')
) x(name,category,quality,reference)
where lower(a.name||' '||coalesce(a.description,'')) ~ '(smartphone|mobile|réparation.*téléphone|easyfixit)'
  and not exists(select 1 from parts p where p.activity_id=a.id);

insert into parts(organization_id,activity_id,name,category,quality,selling_price)
select a.organization_id,a.id,x.name,x.category,'Standard',0
from activities a cross join lateral (values
 ('Tube PVC','Tuyauterie'),('Mécanisme de chasse d’eau','Sanitaire'),('Robinetterie','Sanitaire'),('Raccord PVC','Tuyauterie'),('Clapet / siphon','Sanitaire')
) x(name,category)
where lower(a.name||' '||coalesce(a.description,'')) ~ '(plomb|sanitaire|chauffage)'
  and not exists(select 1 from parts p where p.activity_id=a.id);

insert into interventions(organization_id,activity_id,name,description,default_duration_minutes,default_price)
select a.organization_id,a.id,x.name,x.description,x.duration,0
from activities a cross join lateral (values
 ('Diagnostic smartphone','Diagnostic et recherche de panne',30),('Transfert de données','Transfert et sauvegarde de données',60),('SAV smartphone','Prise en charge après réparation',30)
) x(name,description,duration)
where lower(a.name||' '||coalesce(a.description,'')) ~ '(smartphone|mobile|réparation.*téléphone|easyfixit)'
  and not exists(select 1 from interventions i where i.activity_id=a.id and i.name='Diagnostic smartphone');

insert into interventions(organization_id,activity_id,name,description,default_duration_minutes,default_price)
select a.organization_id,a.id,x.name,x.description,x.duration,0
from activities a cross join lateral (values
 ('Recherche de fuite','Recherche de fuite et diagnostic',60),('Réparation plomberie','Réparation / remplacement de matériel',90),('Installation sanitaire','Installation ou remplacement sanitaire',120)
) x(name,description,duration)
where lower(a.name||' '||coalesce(a.description,'')) ~ '(plomb|sanitaire|chauffage)'
  and not exists(select 1 from interventions i where i.activity_id=a.id and i.name='Recherche de fuite');
