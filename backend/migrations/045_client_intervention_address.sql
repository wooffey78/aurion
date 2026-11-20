-- Étape 6 : conserver séparément l'adresse postale et l'adresse d'intervention du client.
alter table clients add column if not exists intervention_address varchar(500);
