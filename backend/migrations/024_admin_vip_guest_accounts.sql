-- Aurion 15.2.1 : comptes invités VIP créés exclusivement par l'administrateur.
create table if not exists admin_guest_invites(
  id uuid primary key default gen_random_uuid(),
  invited_by uuid not null references users(id) on delete cascade,
  email varchar(254) not null,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_guest_invites_email on admin_guest_invites(lower(email),created_at desc);
create table if not exists vip_guest_accounts(
  user_id uuid primary key references users(id) on delete cascade,
  invited_by uuid not null references users(id) on delete restrict,
  invite_id uuid references admin_guest_invites(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_vip_guest_accounts_invited_by on vip_guest_accounts(invited_by,created_at desc);
