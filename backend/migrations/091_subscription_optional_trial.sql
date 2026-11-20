-- 091 — Période d'essai facultative sur l'abonnement.
--
-- La 15.4.37 créait, sans clé Stripe, un abonnement 'active' sans dates d'essai alors que la
-- migration 009 déclarait trial_started_at / trial_ends_at NOT NULL. PostgreSQL refusait donc
-- l'insertion (SQLSTATE 23502) et annulait TOUTE la transaction d'inscription : entreprise,
-- utilisateur, appartenance, activité et abonnement. Aucun espace ne pouvait être créé sur une
-- installation locale ou auto-hébergée sans facturation configurée.
--
-- Une période d'essai est un choix commercial : null signifie désormais explicitement
-- « aucun essai imposé » (accès complet, sans échéance). Les installations avec Stripe
-- continuent de créer un essai de 60 jours, avec ses deux dates renseignées.
alter table subscriptions alter column trial_started_at drop not null;
alter table subscriptions alter column trial_ends_at drop not null;

-- Les deux dates restent solidaires : un essai a un début et une fin, ou aucune des deux.
alter table subscriptions drop constraint if exists subscriptions_trial_dates_together;
alter table subscriptions add constraint subscriptions_trial_dates_together
  check ((trial_started_at is null) = (trial_ends_at is null));
