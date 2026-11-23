-- Profil utilisateur : avatar privé et personnalisable.
alter table users add column if not exists avatar_key text;
