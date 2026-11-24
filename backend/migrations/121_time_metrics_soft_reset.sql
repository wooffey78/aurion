-- 15.4.58 — Compteur « temps économisé » : la remise à zéro EXCLUT les sessions du calcul
-- au lieu de les effacer (référentiel documentaire §07-6 : « la remise à zéro ne supprime pas
-- les données historiques nécessaires aux statistiques ou audits »).
-- excluded_at = marqueur technique de remise à zéro ; aucune donnée métier n'est détruite :
-- les temps réels restent disponibles pour les chantiers, l'audit et les statistiques d'usage.
alter table client_time_sessions add column if not exists excluded_at timestamptz;
create index if not exists idx_client_time_metrics
  on client_time_sessions(organization_id, activity_id, ended_at)
  where excluded_at is null;
