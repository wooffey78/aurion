-- Synchronisation globale des données persistées d'un même compte entre appareils.
CREATE TABLE IF NOT EXISTS account_sync_versions (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION touch_account_sync(p_organization_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO account_sync_versions(organization_id, revision, updated_at)
  VALUES(p_organization_id, 1, now())
  ON CONFLICT(organization_id) DO UPDATE
    SET revision=account_sync_versions.revision+1, updated_at=now();
END;
$$;

CREATE OR REPLACE FUNCTION aurion_bump_account_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_org := OLD.organization_id; ELSE v_org := NEW.organization_id; END IF;
  IF v_org IS NOT NULL THEN PERFORM touch_account_sync(v_org); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_schema,c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.column_name='organization_id'
      AND c.table_name NOT IN ('account_sync_versions')
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger tr
        JOIN pg_class cl ON cl.oid=tr.tgrelid
        JOIN pg_namespace ns ON ns.oid=cl.relnamespace
        WHERE tr.tgname='aurion_account_sync_trigger'
          AND ns.nspname=c.table_schema AND cl.relname=c.table_name
      )
  LOOP
    EXECUTE format('CREATE TRIGGER aurion_account_sync_trigger AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION aurion_bump_account_sync()',t.table_schema,t.table_name);
  END LOOP;
END $$;

INSERT INTO account_sync_versions(organization_id,revision,updated_at)
SELECT id,0,now() FROM organizations
ON CONFLICT(organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION aurion_bump_user_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_user uuid;
  m record;
BEGIN
  v_user := COALESCE(NEW.id, OLD.id);
  FOR m IN SELECT organization_id FROM organization_members WHERE user_id=v_user LOOP
    PERFORM touch_account_sync(m.organization_id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS aurion_account_sync_user_trigger ON users;
CREATE TRIGGER aurion_account_sync_user_trigger AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION aurion_bump_user_sync();

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_schema,c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.column_name='user_id'
      AND c.table_name NOT IN ('users','password_reset_tokens','webauthn_challenges','native_sessions')
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger tr
        JOIN pg_class cl ON cl.oid=tr.tgrelid
        JOIN pg_namespace ns ON ns.oid=cl.relnamespace
        WHERE tr.tgname='aurion_user_sync_trigger'
          AND ns.nspname=c.table_schema AND cl.relname=c.table_name
      )
  LOOP
    EXECUTE format('CREATE TRIGGER aurion_user_sync_trigger AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION aurion_bump_user_sync()',t.table_schema,t.table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION aurion_bump_author_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_user uuid;
  m record;
BEGIN
  v_user := CASE WHEN TG_OP='DELETE' THEN OLD.author_user_id ELSE NEW.author_user_id END;
  IF v_user IS NOT NULL THEN
    FOR m IN SELECT organization_id FROM organization_members WHERE user_id=v_user LOOP
      PERFORM touch_account_sync(m.organization_id);
    END LOOP;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='support_messages' AND column_name='author_user_id') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS aurion_author_sync_trigger ON support_messages';
    EXECUTE 'CREATE TRIGGER aurion_author_sync_trigger AFTER INSERT OR UPDATE OR DELETE ON support_messages FOR EACH ROW EXECUTE FUNCTION aurion_bump_author_sync()';
  END IF;
END $$;
