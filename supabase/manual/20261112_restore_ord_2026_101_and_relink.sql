-- Restore ORD-2026-101 and the Darshan Chocolate Bites order that the
-- keyword purge deleted. NOT a migration. Do not put this file in
-- supabase/migrations. This script was not executed.
--
-- Take a backup first. The transaction ends in ROLLBACK. Change that last
-- line to COMMIT only after the before/after SELECT previews have been read.
-- Apply migration 20261112130000_allocate_order_id.sql before this script.
-- allocate_order_id() is what issues the new Darshan order number.
--
-- (a) ORD-2026-101 "Chocovalley Sniper Inner" is not invented here.
--     The full row is in backups/2026-11-12-pre-pr123/orders.json on the
--     owner's machine. Paste that object into the PLACEHOLDER block and
--     change the marker to BACKUP_PASTED. The insert is ON CONFLICT DO
--     NOTHING. Until the marker changes, section (a) inserts nothing.
--     Known identity, for checking the paste (the paste wins if it differs):
--       id ORD-2026-101
--       job Chocovalley Sniper Inner
--       client Jai Graha Udyog
--       quantity 1000 kg
--       status In Progress
--       OCN whose number ends in /145
--
-- (b) "Darshan Chocolate Bites 80mm Inner" is inserted under a NEW id from
--     allocate_order_id(), using OCN /151 only. Job punching
--     (JobPunchingForm.jsx handleFinalConfirmAndPunch) is the screen that
--     created that order number, so the order status written here is
--     In Progress, which is what that screen saves. The OCN row's own
--     status (Confirmed / Amended) is left on the OCN.
--     Field map, from saveOrderToSupabase and the punching form:
--       order_confirmations.job_name / payload.jobName     -> orders.job_name
--       payload.clientName or client_name                  -> orders.client_name
--       payload.orderType, blank becomes Reel              -> orders.order_type
--         (saveOrderToSupabase uses that Reel fallback)
--       payload.orderQtyKg                                -> orders.order_qty_kg
--       payload.targetDeliveryDate                         -> target_delivery_date
--         and delivery_date, when it is YYYY-MM-DD
--       payload.layers, printWidthMm, repeatLengthMm,
--         structure, variants, orderComments, calculationData
--         go into orders.job_details
--       orders.job_name is also stored as
--         "<name> ||| <json envelope>"
--         because fetchOrders splits on " ||| " and reads jobDetails from it
--       payload.materialRequirements, if it is an array, is stored as
--         raw_material_requirements.
--       Otherwise layerResults (payload.layerResults or
--         payload.calculationData.layerResults) are turned into requirement
--         lines the way JobPunchingForm.jsx does:
--           REQ-<new id>-<n>, filmType, micron, widthMm, qtyKg from grossKg,
--           ratePerKg from pricePerKg, status Required, assignedVendor blank.
--         Ink and adhesive lines are added only when inkDetails.grossKg or
--         adhesiveDetails.grossKg is greater than 0, with the same labels
--         the form writes ("Liquid Inks", "Solvent-less Adhesive").
--     Job masters and cylinders are NOT inserted. Job punching does not put
--     a job master id or a cylinder row on the new order. If payload.jobMasterId
--     or payload.calculationData.jobMasterData.id is present AND that id
--     already exists in job_masters, orders.job_master_id is set to it.
--     Anything else (a missing job master, the cylinder, artwork, press marks)
--     has to be opened in Job Master / Cylinder and saved again by hand.
--     This script will not guess those rows.
--     Child rows that disappeared with the order (production records,
--     schedules, rolls, shipments, datasheets, challans, certificates) are
--     not rebuilt. deleteOrderFromSupabase removed them, and
--     production_records / job_datasheets also cascade on orders.id.
--     Restore those from the backup, not from this script.
--
-- (c) OCN /151 is pointed at the new order.
--     OCN /150 is pointed at the new order only when it is the amended
--     predecessor of /151: same job name, and either its status/revision says
--     it was amended, its payload mentions /151, or it is linked to the same
--     order id /151 currently has. Otherwise /150 is left unchanged and a
--     NOTICE says why.
--     OCN /145 is set to ORD-2026-101 only when its job name is
--     Chocovalley Sniper Inner. It is never pointed at the new Darshan order.
--     Amendments in the app keep the same OCN number (buildOcnAmendment),
--     so /150 and /151 are two notes. This script does not assume /150 is
--     a revision row inside /151.

BEGIN;

-- BEFORE
SELECT id, job_name, client_name, order_qty_kg, status, ocn_number, ocn_id, job_master_id
FROM public.orders
WHERE id = 'ORD-2026-101'
   OR lower(coalesce(job_name, '')) LIKE '%chocolate bites%'
   OR lower(coalesce(job_name, '')) LIKE '%chocovalley sniper%'
ORDER BY id;

SELECT id, ocn_number, order_id, job_name, client_name, status, revision_no, amendment_no,
       payload->>'jobName' AS payload_job_name,
       payload->>'orderId' AS payload_order_id
FROM public.order_confirmations
WHERE COALESCE((regexp_match(btrim(coalesce(ocn_number, id, '')), '([0-9]+)\s*$'))[1]::int, -1)
      IN (145, 150, 151)
ORDER BY ocn_number, id;

SELECT 'production_records' AS source, count(*) AS rows
FROM public.production_records
WHERE order_id = 'ORD-2026-101'
UNION ALL
SELECT 'job_datasheets', count(*) FROM public.job_datasheets WHERE job_id = 'ORD-2026-101'
UNION ALL
SELECT 'production_schedules', count(*) FROM public.production_schedules WHERE order_id = 'ORD-2026-101'
UNION ALL
SELECT 'inventory_rolls', count(*) FROM public.inventory_rolls WHERE order_id = 'ORD-2026-101'
UNION ALL
SELECT 'dispatch_shipments', count(*) FROM public.dispatch_shipments WHERE order_id = 'ORD-2026-101'
UNION ALL
SELECT 'certificate_of_analyses', count(*) FROM public.certificate_of_analyses WHERE order_id = 'ORD-2026-101'
UNION ALL
SELECT 'delivery_challans', count(*) FROM public.delivery_challans WHERE order_id = 'ORD-2026-101';

-- =====================================================================
-- PLACEHOLDER BLOCK for ORD-2026-101
-- Paste the object from backups/2026-11-12-pre-pr123/orders.json whose
-- id is ORD-2026-101. Replace NULL below with that JSON object.
-- Then change the marker from PASTE_FROM_BACKUP to BACKUP_PASTED.
-- A database-shaped object uses job_name, client_name, order_qty_kg, ...
-- An app-shaped object uses jobName, clientName, orderQtyKg, jobDetails.
-- Both are accepted. Do not type column values by hand.
-- =====================================================================
CREATE TEMP TABLE ord_101_paste (
  marker text NOT NULL,
  doc jsonb
);

INSERT INTO ord_101_paste (marker, doc) VALUES (
  'PASTE_FROM_BACKUP',
  NULL
);

CREATE TEMP TABLE restore_notes (
  new_order_id text,
  ord_101_inserted boolean,
  ocn_151_relinked boolean,
  ocn_150_relinked boolean,
  ocn_150_reason text,
  ocn_145_kept boolean,
  ocn_145_reason text
);

DO $$
DECLARE
  v_marker text;
  v_doc jsonb;
  v_job text;
  v_client text;
  v_qty numeric;
  v_status text;
  v_ocn text;
  v_job_details jsonb;
  v_inserted int := 0;
  v_151_id text;
  v_151_count int;
  v_151 public.order_confirmations%ROWTYPE;
  v_payload jsonb;
  v_new_id text;
  v_order_type text;
  v_qty_kg numeric;
  v_client_name text;
  v_job_name text;
  v_delivery date;
  v_details jsonb;
  v_reqs jsonb;
  v_layers jsonb;
  v_line jsonb;
  v_ink jsonb;
  v_adh jsonb;
  v_idx int;
  v_jm text;
  v_jm_exists text;
  v_old_order_id text;
  v_150_id text;
  v_150_count int;
  v_150 public.order_confirmations%ROWTYPE;
  v_150_job text;
  v_150_relink boolean := false;
  v_150_reason text;
  v_145_count int := 0;
  v_145_updated int := 0;
  v_envelope text;
BEGIN
  SELECT marker, doc INTO v_marker, v_doc FROM ord_101_paste LIMIT 1;

  IF v_marker IS DISTINCT FROM 'BACKUP_PASTED' OR v_doc IS NULL THEN
    RAISE NOTICE 'ORD-2026-101 was NOT inserted. Paste backups/2026-11-12-pre-pr123/orders.json into ord_101_paste and set the marker to BACKUP_PASTED.';
  ELSIF COALESCE(v_doc->>'id', '') IS DISTINCT FROM 'ORD-2026-101' THEN
    RAISE EXCEPTION 'Pasted orders.json object id is "%", not ORD-2026-101. Nothing was inserted.', COALESCE(v_doc->>'id', '');
  ELSE
    v_job := COALESCE(NULLIF(btrim(v_doc->>'job_name'), ''), NULLIF(btrim(v_doc->>'jobName'), ''));
    v_client := COALESCE(NULLIF(btrim(v_doc->>'client_name'), ''), NULLIF(btrim(v_doc->>'clientName'), ''));
    IF v_job IS NULL OR v_client IS NULL THEN
      RAISE EXCEPTION 'Pasted ORD-2026-101 JSON has no job name or client name.';
    END IF;
    IF v_doc ? 'order_qty_kg' AND (v_doc->>'order_qty_kg') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      v_qty := (v_doc->>'order_qty_kg')::numeric;
    ELSIF v_doc ? 'orderQtyKg' AND (v_doc->>'orderQtyKg') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      v_qty := (v_doc->>'orderQtyKg')::numeric;
    ELSE
      v_qty := NULL;
    END IF;
    v_status := COALESCE(NULLIF(btrim(v_doc->>'status'), ''), NULL);
    v_ocn := COALESCE(NULLIF(btrim(v_doc->>'ocn_number'), ''), NULLIF(btrim(v_doc->>'ocnNumber'), ''));
    IF v_doc ? 'job_details' AND jsonb_typeof(v_doc->'job_details') = 'object' THEN
      v_job_details := v_doc->'job_details';
    ELSIF v_doc ? 'jobDetails' AND jsonb_typeof(v_doc->'jobDetails') = 'object' THEN
      v_job_details := v_doc->'jobDetails';
    ELSE
      v_job_details := NULL;
    END IF;
    IF v_job NOT ILIKE '%chocovalley sniper%' THEN
      RAISE NOTICE 'Pasted job name is "%". The incident name was Chocovalley Sniper Inner. The pasted value is inserted as-is.', v_job;
    END IF;
    IF v_client IS DISTINCT FROM 'Jai Graha Udyog' THEN
      RAISE NOTICE 'Pasted client is "%". The incident client was Jai Graha Udyog. The pasted value is inserted as-is.', v_client;
    END IF;
    IF v_qty IS DISTINCT FROM 1000 THEN
      RAISE NOTICE 'Pasted quantity is %. The incident quantity was 1000 kg. The pasted value is inserted as-is.', v_qty;
    END IF;
    IF v_status IS DISTINCT FROM 'In Progress' THEN
      RAISE NOTICE 'Pasted status is "%". The incident status was In Progress. The pasted value is inserted as-is.', v_status;
    END IF;

    IF v_doc ? 'job_name' AND position(' ||| ' IN v_job) > 0 THEN
      v_envelope := v_job;
    ELSIF v_job_details IS NOT NULL THEN
      v_envelope := split_part(v_job, ' ||| ', 1) || ' ||| ' || jsonb_build_object(
        'jobDetails', v_job_details,
        'raw_material_requirements', CASE
          WHEN jsonb_typeof(v_doc->'raw_material_requirements') = 'array' THEN v_doc->'raw_material_requirements'
          WHEN jsonb_typeof(v_doc->'rawMaterialRequirements') = 'array' THEN v_doc->'rawMaterialRequirements'
          WHEN jsonb_typeof(v_doc->'materialRequirements') = 'array' THEN v_doc->'materialRequirements'
          ELSE '[]'::jsonb
        END
      )::text;
    ELSE
      v_envelope := split_part(v_job, ' ||| ', 1);
    END IF;

    INSERT INTO public.orders (
      id, job_name, client_name, order_type, order_qty_kg, status,
      target_delivery_date, delivery_date, job_details, raw_material_requirements,
      ocn_number, ocn_id, job_master_id, ink_gsm, adhesive_gsm, metallocene_pct,
      wastage_percentage, printing_status, machine_id, printing_notes,
      closed_by, closed_at, close_reason, close_mode, over_dispatch_warning,
      original_deadline, revised_deadline, deadline_revised_at, deadline_revised_by,
      deadline_revision_reason, client_informed, client_informed_at, client_informed_by,
      print_active_slot, sfg_consumptions
    ) VALUES (
      'ORD-2026-101',
      v_envelope,
      v_client,
      COALESCE(NULLIF(btrim(v_doc->>'order_type'), ''), NULLIF(btrim(v_doc->>'orderType'), '')),
      v_qty,
      v_status,
      CASE WHEN COALESCE(v_doc->>'target_delivery_date', v_doc->>'targetDeliveryDate', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(COALESCE(v_doc->>'target_delivery_date', v_doc->>'targetDeliveryDate'), 10)::date ELSE NULL END,
      CASE WHEN COALESCE(v_doc->>'delivery_date', v_doc->>'deliveryDate', v_doc->>'targetDeliveryDate', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(COALESCE(v_doc->>'delivery_date', v_doc->>'deliveryDate', v_doc->>'targetDeliveryDate'), 10)::date ELSE NULL END,
      v_job_details,
      CASE
        WHEN jsonb_typeof(v_doc->'raw_material_requirements') = 'array' THEN v_doc->'raw_material_requirements'
        WHEN jsonb_typeof(v_doc->'rawMaterialRequirements') = 'array' THEN v_doc->'rawMaterialRequirements'
        WHEN jsonb_typeof(v_doc->'materialRequirements') = 'array' THEN v_doc->'materialRequirements'
        ELSE NULL
      END,
      v_ocn,
      COALESCE(NULLIF(btrim(v_doc->>'ocn_id'), ''), NULLIF(btrim(v_doc->>'ocnId'), '')),
      COALESCE(NULLIF(btrim(v_doc->>'job_master_id'), ''), NULLIF(btrim(v_doc->>'jobMasterId'), '')),
      CASE WHEN COALESCE(v_doc->>'ink_gsm', v_doc->>'inkGsm', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN COALESCE(v_doc->>'ink_gsm', v_doc->>'inkGsm')::numeric ELSE NULL END,
      CASE WHEN COALESCE(v_doc->>'adhesive_gsm', v_doc->>'adhesiveGsm', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN COALESCE(v_doc->>'adhesive_gsm', v_doc->>'adhesiveGsm')::numeric ELSE NULL END,
      COALESCE(NULLIF(btrim(v_doc->>'metallocene_pct'), ''), NULLIF(btrim(v_doc->>'metallocenePct'), '')),
      CASE WHEN COALESCE(v_doc->>'wastage_percentage', v_doc->>'wastagePct', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN COALESCE(v_doc->>'wastage_percentage', v_doc->>'wastagePct')::numeric ELSE NULL END,
      COALESCE(NULLIF(btrim(v_doc->>'printing_status'), ''), NULLIF(btrim(v_doc->>'printingStatus'), '')),
      COALESCE(NULLIF(btrim(v_doc->>'machine_id'), ''), NULLIF(btrim(v_doc->>'machineId'), '')),
      COALESCE(NULLIF(btrim(v_doc->>'printing_notes'), ''), NULLIF(btrim(v_doc->>'printingNotes'), '')),
      COALESCE(NULLIF(btrim(v_doc->>'closed_by'), ''), NULLIF(btrim(v_doc->>'closedBy'), '')),
      CASE WHEN COALESCE(v_doc->>'closed_at', v_doc->>'closedAt', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN COALESCE(v_doc->>'closed_at', v_doc->>'closedAt')::timestamptz ELSE NULL END,
      COALESCE(NULLIF(btrim(v_doc->>'close_reason'), ''), NULLIF(btrim(v_doc->>'closeReason'), '')),
      COALESCE(NULLIF(btrim(v_doc->>'close_mode'), ''), NULLIF(btrim(v_doc->>'closeMode'), '')),
      COALESCE(NULLIF(btrim(v_doc->>'over_dispatch_warning'), ''), NULLIF(btrim(v_doc->>'overDispatchWarning'), '')),
      CASE WHEN COALESCE(v_doc->>'original_deadline', v_doc->>'originalDeadline', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(COALESCE(v_doc->>'original_deadline', v_doc->>'originalDeadline'), 10)::date ELSE NULL END,
      CASE WHEN COALESCE(v_doc->>'revised_deadline', v_doc->>'revisedDeadline', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(COALESCE(v_doc->>'revised_deadline', v_doc->>'revisedDeadline'), 10)::date ELSE NULL END,
      CASE WHEN COALESCE(v_doc->>'deadline_revised_at', v_doc->>'deadlineRevisedAt', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN COALESCE(v_doc->>'deadline_revised_at', v_doc->>'deadlineRevisedAt')::timestamptz ELSE NULL END,
      COALESCE(NULLIF(btrim(v_doc->>'deadline_revised_by'), ''), NULLIF(btrim(v_doc->>'deadlineRevisedBy'), '')),
      COALESCE(NULLIF(btrim(v_doc->>'deadline_revision_reason'), ''), NULLIF(btrim(v_doc->>'deadlineRevisionReason'), '')),
      CASE WHEN lower(COALESCE(v_doc->>'client_informed', v_doc->>'clientInformed', '')) IN ('true', 'false')
        THEN lower(COALESCE(v_doc->>'client_informed', v_doc->>'clientInformed'))::boolean ELSE NULL END,
      CASE WHEN COALESCE(v_doc->>'client_informed_at', v_doc->>'clientInformedAt', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN COALESCE(v_doc->>'client_informed_at', v_doc->>'clientInformedAt')::timestamptz ELSE NULL END,
      COALESCE(NULLIF(btrim(v_doc->>'client_informed_by'), ''), NULLIF(btrim(v_doc->>'clientInformedBy'), '')),
      COALESCE(NULLIF(btrim(v_doc->>'print_active_slot'), ''), NULLIF(btrim(v_doc->>'printActiveSlot'), '')),
      CASE WHEN jsonb_typeof(v_doc->'sfg_consumptions') = 'array' THEN v_doc->'sfg_consumptions'
           WHEN jsonb_typeof(v_doc->'sfgConsumptions') = 'array' THEN v_doc->'sfgConsumptions'
           ELSE NULL END
    )
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 0 THEN
      RAISE NOTICE 'ORD-2026-101 was already present. ON CONFLICT DO NOTHING left that row unchanged.';
    ELSE
      RAISE NOTICE 'ORD-2026-101 inserted from the pasted backup object.';
    END IF;
  END IF;

  SELECT count(*) INTO v_151_count
  FROM public.order_confirmations
  WHERE COALESCE((regexp_match(btrim(coalesce(ocn_number, id, '')), '([0-9]+)\s*$'))[1]::int, -1) = 151;

  IF v_151_count = 0 THEN
    RAISE EXCEPTION 'No order confirmation ends in /151. The Darshan order was not created.';
  ELSIF v_151_count > 1 THEN
    RAISE EXCEPTION '% order confirmations end in /151. The Darshan order was not created. The preview lists them.', v_151_count;
  END IF;

  SELECT * INTO v_151
  FROM public.order_confirmations
  WHERE COALESCE((regexp_match(btrim(coalesce(ocn_number, id, '')), '([0-9]+)\s*$'))[1]::int, -1) = 151;

  v_151_id := v_151.id;
  v_payload := COALESCE(v_151.payload, '{}'::jsonb);
  v_job_name := COALESCE(NULLIF(btrim(v_payload->>'jobName'), ''), NULLIF(btrim(v_151.job_name), ''));
  v_client_name := COALESCE(NULLIF(btrim(v_payload->>'clientName'), ''), NULLIF(btrim(v_151.client_name), ''));
  IF v_job_name IS NULL OR v_client_name IS NULL THEN
    RAISE EXCEPTION 'OCN /151 (%) has no job name or client. No order was created.', v_151_id;
  END IF;
  IF lower(v_job_name) IS DISTINCT FROM lower('Darshan Chocolate Bites 80mm Inner') THEN
    RAISE EXCEPTION 'OCN /151 job name is "%", not "Darshan Chocolate Bites 80mm Inner". No order was created.', v_job_name;
  END IF;

  v_old_order_id := COALESCE(NULLIF(btrim(v_151.order_id), ''), NULLIF(btrim(v_payload->>'orderId'), ''));
  v_order_type := COALESCE(NULLIF(btrim(v_payload->>'orderType'), ''), 'Reel');
  IF (v_payload->>'orderQtyKg') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    v_qty_kg := (v_payload->>'orderQtyKg')::numeric;
  ELSE
    v_qty_kg := 0;
    RAISE NOTICE 'OCN /151 has no numeric orderQtyKg. The new order quantity is 0, matching saveOrderToSupabase when the field is blank.';
  END IF;
  v_delivery := NULL;
  IF COALESCE(v_payload->>'targetDeliveryDate', '') ~ '^\d{4}-\d{2}-\d{2}' THEN
    v_delivery := left(v_payload->>'targetDeliveryDate', 10)::date;
  END IF;

  IF jsonb_typeof(v_payload->'materialRequirements') = 'array' THEN
    v_reqs := v_payload->'materialRequirements';
  ELSIF jsonb_typeof(v_payload->'rawMaterialRequirements') = 'array' THEN
    v_reqs := v_payload->'rawMaterialRequirements';
  ELSE
    v_reqs := '[]'::jsonb;
    v_layers := CASE
      WHEN jsonb_typeof(v_payload->'layerResults') = 'array' THEN v_payload->'layerResults'
      WHEN jsonb_typeof(v_payload#>'{calculationData,layerResults}') = 'array' THEN v_payload#>'{calculationData,layerResults}'
      ELSE '[]'::jsonb
    END;
  END IF;

  v_new_id := (public.allocate_order_id(1))[1];
  IF v_new_id IS NULL OR btrim(v_new_id) = '' THEN
    RAISE EXCEPTION 'allocate_order_id() did not return an order number.';
  END IF;

  IF jsonb_typeof(v_payload->'materialRequirements') IS DISTINCT FROM 'array'
     AND jsonb_typeof(v_payload->'rawMaterialRequirements') IS DISTINCT FROM 'array' THEN
    FOR v_idx IN 0 .. COALESCE(jsonb_array_length(v_layers), 0) - 1 LOOP
      v_line := v_layers->v_idx;
      v_reqs := v_reqs || jsonb_build_array(jsonb_build_object(
        'id', 'REQ-' || v_new_id || '-' || (v_idx + 1),
        'filmType', v_line->>'filmType',
        'micron', v_line->'micron',
        'widthMm', COALESCE(v_line->'widthMm', v_line->'width'),
        'qtyKg', COALESCE(v_line->'grossKg', v_line->'qtyKg'),
        'ratePerKg', COALESCE(v_line->'pricePerKg', v_line->'ratePerKg'),
        'status', 'Required',
        'assignedVendor', ''
      ));
    END LOOP;
    v_ink := CASE
      WHEN jsonb_typeof(v_payload->'inkDetails') = 'object' THEN v_payload->'inkDetails'
      WHEN jsonb_typeof(v_payload#>'{calculationData,inkDetails}') = 'object' THEN v_payload#>'{calculationData,inkDetails}'
      ELSE NULL
    END;
    IF v_ink IS NOT NULL AND (v_ink->>'grossKg') ~ '^[0-9]+(\.[0-9]+)?$' AND (v_ink->>'grossKg')::numeric > 0 THEN
      v_reqs := v_reqs || jsonb_build_array(jsonb_build_object(
        'id', 'REQ-' || v_new_id || '-INK',
        'filmType', 'Liquid Inks',
        'micron', '-',
        'widthMm', '-',
        'qtyKg', v_ink->'grossKg',
        'status', 'Required',
        'assignedVendor', ''
      ));
    END IF;
    v_adh := CASE
      WHEN jsonb_typeof(v_payload->'adhesiveDetails') = 'object' THEN v_payload->'adhesiveDetails'
      WHEN jsonb_typeof(v_payload#>'{calculationData,adhesiveDetails}') = 'object' THEN v_payload#>'{calculationData,adhesiveDetails}'
      ELSE NULL
    END;
    IF v_adh IS NOT NULL AND (v_adh->>'grossKg') ~ '^[0-9]+(\.[0-9]+)?$' AND (v_adh->>'grossKg')::numeric > 0 THEN
      v_reqs := v_reqs || jsonb_build_array(jsonb_build_object(
        'id', 'REQ-' || v_new_id || '-ADH',
        'filmType', 'Solvent-less Adhesive',
        'micron', '-',
        'widthMm', '-',
        'qtyKg', v_adh->'grossKg',
        'status', 'Required',
        'assignedVendor', ''
      ));
    END IF;
    IF COALESCE(jsonb_array_length(v_layers), 0) = 0 THEN
      RAISE NOTICE 'OCN /151 has no materialRequirements and no layerResults. Raw-material lines were not invented. Re-check them on the order screen.';
    END IF;
  END IF;

  v_jm := COALESCE(
    NULLIF(btrim(v_payload->>'jobMasterId'), ''),
    NULLIF(btrim(v_payload#>>'{calculationData,jobMasterData,id}'), '')
  );
  v_jm_exists := NULL;
  IF v_jm IS NOT NULL THEN
    SELECT id INTO v_jm_exists FROM public.job_masters WHERE id = v_jm;
    IF v_jm_exists IS NULL THEN
      RAISE NOTICE 'OCN /151 names job master %, which is not in job_masters. No job master was created. Re-enter it in the UI. orders.job_master_id is left blank.', v_jm;
      v_jm := NULL;
    END IF;
  ELSE
    RAISE NOTICE 'OCN /151 has no job master id. No job master or cylinder was created. Re-enter those in Job Master and Cylinder if this job still needs them.';
  END IF;

  v_details := jsonb_strip_nulls(jsonb_build_object(
    'layers', CASE WHEN jsonb_typeof(v_payload->'layers') = 'array' THEN v_payload->'layers' ELSE NULL END,
    'printWidthMm', v_payload->'printWidthMm',
    'repeatLengthMm', v_payload->'repeatLengthMm',
    'structure', CASE WHEN NULLIF(btrim(v_payload->>'structure'), '') IS NOT NULL THEN to_jsonb(v_payload->>'structure') ELSE NULL END,
    'orderComments', CASE WHEN COALESCE(v_payload->>'orderComments', v_payload->>'comments') IS NOT NULL
      THEN to_jsonb(COALESCE(v_payload->>'orderComments', v_payload->>'comments')) ELSE NULL END,
    'comments', CASE WHEN COALESCE(v_payload->>'comments', v_payload->>'orderComments') IS NOT NULL
      THEN to_jsonb(COALESCE(v_payload->>'comments', v_payload->>'orderComments')) ELSE NULL END,
    'ocnNumber', to_jsonb(COALESCE(v_151.ocn_number, v_151.id)),
    'ocnId', to_jsonb(v_151.id),
    'hasVariants', v_payload->'hasVariants',
    'variants', CASE WHEN jsonb_typeof(v_payload->'variants') = 'array' THEN v_payload->'variants' ELSE NULL END,
    'inkGsm', v_payload->'inkGsm',
    'adhesiveGsm', v_payload->'adhesiveGsm',
    'orderDate', CASE WHEN NULLIF(btrim(v_payload->>'orderDate'), '') IS NOT NULL THEN to_jsonb(v_payload->>'orderDate') ELSE NULL END,
    'wastagePct', v_payload->'wastagePct',
    'colorsCount', v_payload->'colorsCount',
    'calculationDetails', CASE WHEN jsonb_typeof(v_payload->'calculationData') = 'object' THEN v_payload->'calculationData' ELSE NULL END,
    'jobMasterId', CASE WHEN v_jm IS NOT NULL THEN to_jsonb(v_jm) ELSE NULL END
  ));

  v_envelope := v_job_name || ' ||| ' || jsonb_build_object(
    'jobDetails', v_details,
    'raw_material_requirements', v_reqs,
    'printingStatus', 'Scheduled',
    'isPrintingCompleted', false
  )::text;

  INSERT INTO public.orders (
    id, job_name, client_name, order_type, order_qty_kg, status,
    target_delivery_date, delivery_date, job_details, raw_material_requirements,
    ocn_number, ocn_id, job_master_id
  ) VALUES (
    v_new_id,
    v_envelope,
    v_client_name,
    v_order_type,
    v_qty_kg,
    'In Progress',
    v_delivery,
    v_delivery,
    v_details,
    v_reqs,
    COALESCE(v_151.ocn_number, v_151.id),
    v_151.id,
    v_jm
  );

  UPDATE public.order_confirmations
  SET order_id = v_new_id,
      payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{orderId}', to_jsonb(v_new_id), true),
      updated_at = now()
  WHERE id = v_151_id;

  SELECT count(*) INTO v_150_count
  FROM public.order_confirmations
  WHERE COALESCE((regexp_match(btrim(coalesce(ocn_number, id, '')), '([0-9]+)\s*$'))[1]::int, -1) = 150;

  IF v_150_count = 0 THEN
    v_150_reason := 'No OCN ends in /150. Nothing was relinked for /150.';
  ELSIF v_150_count > 1 THEN
    v_150_reason := 'More than one OCN ends in /150. None were relinked.';
  ELSE
    SELECT * INTO v_150
    FROM public.order_confirmations
    WHERE COALESCE((regexp_match(btrim(coalesce(ocn_number, id, '')), '([0-9]+)\s*$'))[1]::int, -1) = 150;
    v_150_id := v_150.id;
    v_150_job := lower(btrim(COALESCE(NULLIF(v_150.payload->>'jobName', ''), v_150.job_name, '')));
    IF v_150_job IS DISTINCT FROM lower('Darshan Chocolate Bites 80mm Inner') THEN
      v_150_reason := 'OCN /150 job is "' || COALESCE(v_150.job_name, v_150.payload->>'jobName', '') || '", not the Darshan job. It was left unchanged.';
    ELSIF COALESCE(v_150.revision_no, 0) > 0
       OR lower(COALESCE(v_150.status, '')) LIKE '%amend%'
       OR COALESCE(v_150.payload::text, '') ILIKE '%/151%'
       OR COALESCE(NULLIF(btrim(v_150.order_id), ''), NULLIF(btrim(v_150.payload->>'orderId'), ''))
            IS NOT DISTINCT FROM v_old_order_id
    THEN
      UPDATE public.order_confirmations
      SET order_id = v_new_id,
          payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{orderId}', to_jsonb(v_new_id), true),
          updated_at = now()
      WHERE id = v_150_id;
      v_150_relink := true;
      v_150_reason := 'OCN /150 matches the Darshan job and looks like the amended predecessor (revision, amended status, a /151 reference, or the same previous order id). It now points at ' || v_new_id || '.';
    ELSE
      v_150_reason := 'OCN /150 has the Darshan job name but no amendment signal and a different order id. It was left unchanged.';
    END IF;
  END IF;
  RAISE NOTICE '%', v_150_reason;

  SELECT count(*) INTO v_145_count
  FROM public.order_confirmations
  WHERE COALESCE((regexp_match(btrim(coalesce(ocn_number, id, '')), '([0-9]+)\s*$'))[1]::int, -1) = 145
    AND lower(btrim(COALESCE(NULLIF(payload->>'jobName', ''), job_name, ''))) LIKE '%chocovalley sniper%';

  IF v_145_count = 0 THEN
    RAISE NOTICE 'No OCN ending in /145 is named Chocovalley Sniper Inner. That note was not changed. ORD-2026-101 still needs the pasted backup row.';
  ELSE
    UPDATE public.order_confirmations
    SET order_id = 'ORD-2026-101',
        payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{orderId}', to_jsonb('ORD-2026-101'::text), true),
        updated_at = now()
    WHERE COALESCE((regexp_match(btrim(coalesce(ocn_number, id, '')), '([0-9]+)\s*$'))[1]::int, -1) = 145
      AND lower(btrim(COALESCE(NULLIF(payload->>'jobName', ''), job_name, ''))) LIKE '%chocovalley sniper%';
    GET DIAGNOSTICS v_145_updated = ROW_COUNT;
    RAISE NOTICE 'OCN /145 for Chocovalley Sniper Inner (% row(s)) points at ORD-2026-101, not at %.', v_145_updated, v_new_id;
  END IF;

  INSERT INTO restore_notes (
    new_order_id, ord_101_inserted, ocn_151_relinked, ocn_150_relinked, ocn_150_reason, ocn_145_kept, ocn_145_reason
  ) VALUES (
    v_new_id,
    COALESCE(v_inserted, 0) > 0,
    true,
    v_150_relink,
    v_150_reason,
    v_145_updated > 0,
    CASE WHEN v_145_updated > 0 THEN 'Pointed at ORD-2026-101' ELSE 'Not changed' END
  );
END $$;

-- AFTER
SELECT * FROM restore_notes;

SELECT id, job_name, client_name, order_qty_kg, status, ocn_number, ocn_id, job_master_id
FROM public.orders
WHERE id = 'ORD-2026-101'
   OR id = (SELECT new_order_id FROM restore_notes)
   OR lower(coalesce(job_name, '')) LIKE '%chocolate bites%'
   OR lower(coalesce(job_name, '')) LIKE '%chocovalley sniper%'
ORDER BY id;

SELECT id, ocn_number, order_id, job_name, client_name, status, revision_no, amendment_no,
       payload->>'orderId' AS payload_order_id
FROM public.order_confirmations
WHERE COALESCE((regexp_match(btrim(coalesce(ocn_number, id, '')), '([0-9]+)\s*$'))[1]::int, -1)
      IN (145, 150, 151)
   OR order_id = (SELECT new_order_id FROM restore_notes)
   OR order_id = 'ORD-2026-101'
ORDER BY ocn_number, id;

-- Change this line to COMMIT only after a backup and after reading the previews.
ROLLBACK;
