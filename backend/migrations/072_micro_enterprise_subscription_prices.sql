-- Preserve the previously chosen customer prices while billing is configured without collected VAT.
-- Apply only after verifying the publisher's VAT/franchise status; never deploy with an unverified tax setting.
update plans
set price_ht_cents = case code
  when 'monthly' then 1400
  when 'yearly' then 15120
  else price_ht_cents
end
where code in ('monthly','yearly');
