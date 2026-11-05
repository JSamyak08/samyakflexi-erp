-- Printing queue sequence.
--
-- press_board.queue_order is the sequence: index 0 is position 1.
-- A save replaces that array in one UPDATE. Postgres locks the plant row,
-- so two people reordering are applied one after the other and the later
-- commit wins. This trigger then stores a unique, contiguous list (no blank
-- ids, no duplicates, no holes). It does not change machine assignments or
-- the active running job, and it does not rewrite existing rows until the
-- next save.
--
-- The functions live in private so they are not Data API procedures.
-- Authenticated press users need EXECUTE on the trigger function because
-- the trigger runs as the role that updates the row.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.normalize_press_queue(raw jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  seen text[] := ARRAY[]::text[];
  item jsonb;
  key text;
BEGIN
  IF raw IS NULL OR jsonb_typeof(raw) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(raw)
  LOOP
    IF jsonb_typeof(item) = 'string' OR jsonb_typeof(item) = 'number' THEN
      key := btrim(item #>> '{}');
    ELSE
      key := '';
    END IF;
    IF key = '' OR key = ANY (seen) THEN
      CONTINUE;
    END IF;
    seen := array_append(seen, key);
    result := result || jsonb_build_array(key);
  END LOOP;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION private.press_board_normalize_queue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.queue_order := private.normalize_press_queue(NEW.queue_order);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS press_board_normalize_queue ON public.press_board;
CREATE TRIGGER press_board_normalize_queue
  BEFORE INSERT OR UPDATE OF queue_order ON public.press_board
  FOR EACH ROW
  EXECUTE FUNCTION private.press_board_normalize_queue();

REVOKE ALL ON FUNCTION private.normalize_press_queue(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.press_board_normalize_queue() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION private.normalize_press_queue(jsonb) TO authenticated;
    GRANT EXECUTE ON FUNCTION private.press_board_normalize_queue() TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION private.normalize_press_queue(jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION private.press_board_normalize_queue() TO service_role;
  END IF;
END $$;
