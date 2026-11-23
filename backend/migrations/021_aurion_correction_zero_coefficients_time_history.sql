-- Aurion 15.1.1 : corrections strictement ciblées
-- 0 % est une valeur explicite valide pour tous les coefficients.
-- L'historique des temps reste conservé lorsqu'un client est supprimé.

alter table activities alter column margin_min_percent set default 0;
alter table parts alter column sale_coefficient_percent set default 0;
alter table quote_items alter column sale_coefficient_percent set default 0;
alter table quotes alter column margin_coefficient_percent set default 0;

-- Les sessions de temps deviennent historiques indépendantes de la fiche client.
alter table client_time_sessions alter column client_id drop not null;
alter table client_time_sessions drop constraint if exists client_time_sessions_client_id_fkey;
alter table client_time_sessions add constraint client_time_sessions_client_id_fkey foreign key (client_id) references clients(id) on delete set null;
