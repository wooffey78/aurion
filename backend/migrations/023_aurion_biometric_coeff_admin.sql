-- Aurion 15.2 : passkeys biométriques, base du coefficient, compte administrateur.
create table if not exists webauthn_credentials(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  credential_id bytea not null unique,
  public_key bytea not null,
  sign_count bigint not null default 0,
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists idx_webauthn_credentials_user on webauthn_credentials(user_id);
create table if not exists webauthn_challenges(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  challenge text not null,
  purpose varchar(20) not null check(purpose in ('registration','authentication')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_webauthn_challenges_expiry on webauthn_challenges(expires_at);
alter table quotes add column if not exists coefficient_basis varchar(20) not null default 'purchase' check(coefficient_basis in ('purchase','margin'));
alter table activities add column if not exists social_regime varchar(40);
alter table activities add column if not exists vat_regime varchar(40);
alter table activities add column if not exists vat_auto_detected boolean not null default false;
alter table activities add column if not exists social_auto_detected boolean not null default false;
-- Le compte administrateur indiqué par Aurion est gratuit et sans échéance d'abonnement dès lors qu'il existe.
insert into platform_admins(user_id)
select id from users where lower(email)=lower('easyfixit.reparation@gmail.com')
on conflict do nothing;
