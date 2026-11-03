-- Dry run only. Do not put this file in supabase/migrations.
-- It lists scrap rows that already carry a barcode-shaped code.
-- This script only reads. It does not change any row.

SELECT
  id,
  btrim(coalesce(
    payload->>'barcodeId',
    payload->>'barcode',
    payload->>'holdTagId',
    payload->>'sfgBatchCode'
  )) AS legacy_code,
  payload->>'scrapQtyKg' AS scrap_kg,
  payload->>'ratePerKg' AS rate_per_kg,
  payload->>'valueRs' AS value_rs,
  payload->>'defectCategory' AS defect_category,
  payload->>'scrapReason' AS remarks,
  coalesce(payload->>'sourceRecordId', payload->>'productionRecordId', payload->>'parentSfgId') AS source_record_id,
  created_at
FROM public.sfg_scrap_items
WHERE coalesce(
    payload->>'barcodeId',
    payload->>'barcode',
    payload->>'holdTagId',
    payload->>'sfgBatchCode',
    ''
  ) ~* '^(SFG|FG|RM|CON|QCHOLD|QC-HOLD|SCRAP|ADJ|BAR|CYL|SKU-CYL|FG-DISP)-'
   OR coalesce(
    payload->>'barcodeId',
    payload->>'barcode',
    payload->>'holdTagId',
    payload->>'sfgBatchCode',
    ''
  ) ~* '-BAL$'
ORDER BY created_at DESC NULLS LAST;
