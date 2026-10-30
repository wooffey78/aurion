-- Empêche un onglet ancien d'écraser silencieusement une version plus récente du parcours.
ALTER TABLE onboarding_journeys
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;
