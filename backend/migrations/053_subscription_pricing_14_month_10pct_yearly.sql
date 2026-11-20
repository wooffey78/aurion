-- Tarification demandée : 14 € TTC/mois ; annuel à -10 % soit 151,20 € TTC.
-- Les montants sont stockés hors taxes et l'interface applique la TVA à 20 %.
update plans
set price_ht_cents = case code
  when 'monthly' then 1167  -- 11,67 € HT -> 14,00 € TTC après arrondi
  when 'yearly' then 12600 -- 126,00 € HT -> 151,20 € TTC/an
  else price_ht_cents
end,
name = case code
  when 'monthly' then 'Aurion mensuel'
  when 'yearly' then 'Aurion annuel (-10 %)'
  else name
end,
trial_days = 60
where code in ('monthly','yearly');
