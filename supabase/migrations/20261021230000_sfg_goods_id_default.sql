-- sfg_goods.id is a uuid primary key and had no default. A printed roll
-- barcode is not a uuid, so the insert failed when the app left id empty.
-- New rows can now be stored without the caller inventing a uuid.

ALTER TABLE public.sfg_goods ALTER COLUMN id SET DEFAULT gen_random_uuid();
