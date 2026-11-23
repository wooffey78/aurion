-- Correctifs postérieurs à 056. Ne jamais modifier une migration déjà appliquée.
-- La synchronisation ne doit pas recréer une version pour une organisation en cours de suppression.
CREATE OR REPLACE FUNCTION touch_account_sync(p_organization_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM organizations WHERE id = p_organization_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO account_sync_versions(organization_id, revision, updated_at)
  SELECT p_organization_id, 1, now()
  WHERE EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id)
  ON CONFLICT (organization_id) DO UPDATE
    SET revision = account_sync_versions.revision + 1,
        updated_at = now();
END;
$$;

-- Ne jamais référencer NEW.id/OLD.id pour les tables qui n'ont qu'un user_id.
-- JSONB permet de lire la clé réellement présente sur la ligne déclenchante.
CREATE OR REPLACE FUNCTION aurion_bump_user_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_user uuid;
  m record;
  r jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    r := to_jsonb(OLD);
  ELSE
    r := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'users' THEN
    v_user := NULLIF(r ->> 'id', '')::uuid;
  ELSE
    v_user := NULLIF(r ->> 'user_id', '')::uuid;
  END IF;

  IF v_user IS NOT NULL THEN
    FOR m IN
      SELECT organization_id
      FROM organization_members
      WHERE user_id = v_user
    LOOP
      PERFORM touch_account_sync(m.organization_id);
    END LOOP;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
