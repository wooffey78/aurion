-- Aurion 15.2.3 : les libellés de régime fiscal détectés peuvent dépasser 40 caractères.
-- Extension additive uniquement : aucun taux ni calcul n'est modifié.
alter table activities alter column social_regime type varchar(240);
alter table activities alter column vat_regime type varchar(240);
