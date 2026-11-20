-- Fix de la synchronisation des prix fournisseurs.
-- supplier_parts ne possède pas organization_id : récupérer l’organisation via
-- la pièce puis, si nécessaire (suppression en cascade), via le fournisseur.
-- La conversion en JSONB évite de référencer une colonne absente sur NEW/OLD.
CREATE OR REPLACE FUNCTION aurion_bump_account_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
  v_row jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_org := NULLIF(v_row ->> 'organization_id', '')::uuid;

  IF v_org IS NULL
     AND TG_TABLE_SCHEMA = 'public'
     AND TG_TABLE_NAME = 'supplier_parts' THEN
    SELECT p.organization_id
      INTO v_org
      FROM parts p
     WHERE p.id = NULLIF(v_row ->> 'part_id', '')::uuid;

    IF v_org IS NULL THEN
      SELECT s.organization_id
        INTO v_org
        FROM suppliers s
       WHERE s.id = NULLIF(v_row ->> 'supplier_id', '')::uuid;
    END IF;
  END IF;

  IF v_org IS NOT NULL THEN
    PERFORM touch_account_sync(v_org);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
