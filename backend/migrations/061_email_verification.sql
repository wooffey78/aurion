-- Additive migration: never rewrite an already-applied migration.
alter table users
  add column if not exists email_verified_at timestamptz;

create table if not exists email_verification_tokens (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_verification_tokens_user_active
  on email_verification_tokens(user_id, expires_at desc)
  where consumed_at is null;
