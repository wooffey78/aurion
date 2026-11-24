-- 15.4.62 — Administration → Intégrations → Plateformes agréées → Tiime : configuration de la
-- connexion globale (module exclusivement réservé à l'administrateur général, déjà cloisonné par
-- le garde admin + journalisation). Les secrets restent côté serveur et ne sont jamais exposés.
create table if not exists platform_tiime_config(
  id uuid primary key default gen_random_uuid(),
  api_identifier varchar(255) not null default '',
  api_secret text not null default '',
  api_url varchar(255) not null default '',
  oauth_url varchar(255) not null default '',
  redirect_uri varchar(255) not null default '',
  scopes varchar(255) not null default '',
  webhook_secret text not null default '',
  environment varchar(20) not null default 'test' check (environment in ('test','production')),
  updated_at timestamptz not null default now()
);
