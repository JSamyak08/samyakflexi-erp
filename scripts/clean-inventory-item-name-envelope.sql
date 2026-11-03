-- Clean the legacy " ||| {json}" suffix off inventory.item_name.
--
-- This file is NOT a migration. Nothing in it runs by itself, and it must
-- not be applied from the app. Production is a free-tier database with no
-- backups. Run the SELECT, save the result, and only then decide whether
-- to run the commented UPDATE by hand.
--
-- The app no longer writes this suffix. private.add_item_stock only
-- rewrites a suffix that is already there, so a cleaned name stays clean
-- when stock moves.

-- Dry run. One row per inventory item whose name still carries the suffix.
SELECT
  id,
  item_name AS item_name_now,
  btrim(split_part(item_name, '|||', 1)) AS item_name_cleaned,
  CASE
    WHEN btrim(substring(item_name FROM position('|||' IN item_name) + 3)) ~ '^\s*\{'
      THEN 'json suffix'
    ELSE 'non-json suffix'
  END AS suffix_kind
FROM public.inventory
WHERE position('|||' IN item_name) > 0
ORDER BY id;

-- Not applied. Uncomment only after the SELECT above has been reviewed.
-- UPDATE public.inventory
-- SET
--   item_name = btrim(split_part(item_name, '|||', 1)),
--   metadata = CASE
--     WHEN coalesce(metadata, '{}'::jsonb) = '{}'::jsonb
--       AND btrim(substring(item_name FROM position('|||' IN item_name) + 3)) ~ '^\s*\{'
--       THEN btrim(substring(item_name FROM position('|||' IN item_name) + 3))::jsonb
--     ELSE metadata
--   END,
--   last_updated = now()
-- WHERE position('|||' IN item_name) > 0;
