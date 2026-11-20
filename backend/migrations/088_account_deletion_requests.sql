-- Aurion 15.4.35 : demandes de suppression de compte (portée de la 15.4.25, renumérotée 088
-- dans la séquence fusionnée 15.4.34/35 où 084-086 = réplication hors ligne, 087 = invitations).
-- Exigence Google Play (suppression accessible depuis l'application et depuis une page web)
-- et droit à l'effacement du RGPD. Migration strictement additive.
-- existante n'est modifiée, aucune table n'est supprimée.
create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  email varchar(254) not null,
  reason text not null default '',
  source varchar(20) not null default 'app',
  status varchar(20) not null default 'pending',
  requested_at timestamptz not null default now(),
  cancelled_at timestamptz,
  processed_at timestamptz
);

-- Une seule demande en attente par compte : une seconde demande est refusée explicitement.
create unique index if not exists account_deletion_requests_pending_user_idx
  on account_deletion_requests(user_id) where status = 'pending';

create index if not exists account_deletion_requests_status_idx
  on account_deletion_requests(status, requested_at desc);
