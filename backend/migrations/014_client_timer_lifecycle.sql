-- Cycle du compteur client : création -> devis (pause) -> facture (reprise) -> envoi facture (arrêt).
with ranked as (select id,row_number() over(partition by client_id order by created_at,id) rn from client_time_sessions)
update client_time_sessions s set manual_minutes=0 from ranked r where s.id=r.id and r.rn>1;
create index if not exists idx_client_time_client on client_time_sessions(organization_id,client_id,created_at);
