-- Opening-balance SFG / FG stock was already in the plant before this ERP
-- inventory. The row is real stock for later lamination, slitting, and
-- dispatch. Add Batch does not deduct film, ink, adhesive, or a parent lot
-- for it, and the production-record ledger trigger is not given new
-- materials or consumptions to post.
--
-- save_printing_sfg_lot writes a fixed column list, so a printed lot's notes
-- flag is copied onto this column here. Once true, a later print save does
-- not clear it.

ALTER TABLE public.sfg_goods
  ADD COLUMN IF NOT EXISTS is_opening_balance boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sfg_goods.is_opening_balance IS
  'Stock entered as an opening balance. No inventory deduction was posted for this row.';

CREATE OR REPLACE FUNCTION private.sfg_mark_opening_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  notes_json jsonb;
  flag text;
BEGIN
  IF NEW.notes IS NOT NULL AND left(btrim(NEW.notes), 1) = '{' THEN
    BEGIN
      notes_json := NEW.notes::jsonb;
    EXCEPTION WHEN others THEN
      notes_json := NULL;
    END;
  END IF;

  flag := lower(btrim(coalesce(notes_json->>'isOpeningBalance', '')));
  IF flag IN ('true', 't', '1') THEN
    NEW.is_opening_balance := true;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_opening_balance IS TRUE THEN
    NEW.is_opening_balance := true;
  ELSIF NEW.is_opening_balance IS NULL THEN
    NEW.is_opening_balance := false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sfg_mark_opening_balance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.sfg_mark_opening_balance() TO authenticated;

DROP TRIGGER IF EXISTS sfg_mark_opening_balance ON public.sfg_goods;
CREATE TRIGGER sfg_mark_opening_balance
  BEFORE INSERT OR UPDATE ON public.sfg_goods
  FOR EACH ROW
  EXECUTE FUNCTION private.sfg_mark_opening_balance();
