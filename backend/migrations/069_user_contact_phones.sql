-- Aurion 15.3.11 : coordonnées réutilisables dans le parcours et les paramètres.
alter table users add column if not exists phone_mobile varchar(60);
alter table users add column if not exists phone_fixed varchar(60);
