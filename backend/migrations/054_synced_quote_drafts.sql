-- Brouillon métier synchronisé entre appareils du même compte utilisateur.
-- Le filtre organisation_id + user_id est appliqué à chaque requête API.
CREATE TABLE IF NOT EXISTS user_drafts (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_key varchar(40) NOT NULL DEFAULT 'quote',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, draft_key),
  CONSTRAINT user_drafts_payload_object CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX IF NOT EXISTS user_drafts_updated_at_idx ON user_drafts (organization_id, updated_at DESC);
