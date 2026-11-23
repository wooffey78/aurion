-- Étape 29 : essai gratuit et tarifs d'abonnement demandés dans le profil utilisateur.
-- Les montants sont stockés HT car le code existant calcule le TTC avec TVA 20 %.
-- 583 HT -> 7,00 TTC après arrondi ; 5833 HT -> 70,00 TTC après arrondi.
update plans
set price_ht_cents = case code
  when 'monthly' then 583
  when 'yearly' then 5833
  else price_ht_cents
end,
trial_days = 60
where code in ('monthly','yearly');
