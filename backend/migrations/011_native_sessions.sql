create table if not exists native_sessions(
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  session_version integer not null default 0,
  refresh_token_hash char(64) not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  ip_address inet,
  user_agent varchar(500)
);
create index if not exists idx_native_sessions_user on native_sessions(user_id,revoked_at);
create index if not exists idx_native_sessions_expiry on native_sessions(expires_at);
