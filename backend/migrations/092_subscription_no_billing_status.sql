-- 092 — Statut honnête pour une installation sans facturation configurée.
--
-- La 15.4.38 créait, sans clé Stripe, un abonnement `active` sans formule ni période. Ce statut
-- est celui d'un abonnement payant en cours : les écrans affichaient donc « Actif » et le tableau
-- de bord administrateur comptait ces entreprises comme des abonnements payés.
--
-- `no_billing` signifie exactement ce qu'il décrit : aucune facturation n'est configurée sur cette
-- installation (ni formule, ni paiement, ni essai, ni échéance). L'accès reste complet et gratuit.
-- Ce n'est ni un abonnement actif, ni un essai, ni un accès expiré.
-- Le nom de la contrainte peut varier selon la version de la base : on retire celle qui porte
-- réellement l'énumération des statuts (celle qui mentionne 'trialing'), quel que soit son nom.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid='subscriptions'::regclass and contype='c'
       and pg_get_constraintdef(oid) ilike '%status%'
       and pg_get_constraintdef(oid) ilike '%trialing%'
  loop
    execute format('alter table subscriptions drop constraint %I', c.conname);
  end loop;
end $$;

-- Conversion des lignes synthétiques créées par la 15.4.38 : actives, sans formule, sans aucune
-- date et sans fournisseur de paiement. Un véritable abonnement Stripe/virement porte une formule
-- et une période, il n'est donc jamais concerné.
update subscriptions
   set status='no_billing', updated_at=now()
 where status='active'
   and plan_code is null
   and trial_started_at is null
   and trial_ends_at is null
   and current_period_start is null
   and current_period_end is null
   and provider is null
   and provider_subscription_id is null;

alter table subscriptions add constraint subscriptions_status_check
  check (status in ('trialing','active','past_due','canceled','expired','no_billing'));

-- Sans essai, les deux dates doivent rester nulles. Le défaut `now()` de trial_started_at rendait
-- invalide toute insertion d'abonnement sans dates (activation d'un paiement sans essai) au regard
-- de la contrainte de solidarité créée en 091. Les insertions qui ouvrent un essai fournissent
-- explicitement les deux dates : elles ne sont pas concernées.
alter table subscriptions alter column trial_started_at drop default;
