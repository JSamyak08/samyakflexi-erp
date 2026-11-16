-- Manual repair. NOT a migration. Do not put this file in supabase/migrations.
-- Do not run it from the app, from CI, or against production.
--
-- On 16 Nov 2026 at 16:27 IST, quotation SIL/QTN/26-27/501
-- (id QTN-1794635964007, Oyster Exim) was converted and created
-- order ORD-2026-242. No order_confirmations row was written for
-- SIL/OCN/26-27/163.
--
-- This inserts that one OCN from the order's saved job details, the
-- client directory, and that quotation. Conversion charges, fixed profit,
-- and minimum selling price are left null so they can be amended in the
-- app. It also stores SIL/OCN/26-27/163 on the order in job_details,
-- in the job_name envelope, and in orders.ocn_number / orders.ocn_id
-- (added by 20261030140000_order_confirmation_notes.sql).
--
-- It does not allocate a number and does not change any counter.
-- Production's OCN series is already at 164. If SIL/OCN/26-27/163
-- already exists, this stops and overwrites nothing.
--
-- Rehearse on the test project awtjvrhpoyzjwrfumhip only.
-- Do not run this against production eamstsaqkbeiywfaanhi until the
-- before/after rows in script_report have been reviewed and Samyak approves.
--
-- The transaction ends in ROLLBACK. Change that last line to COMMIT only
-- after the preview shows OCN /163 linked to ORD-2026-242 and nowhere else.

BEGIN;

DROP TABLE IF EXISTS script_report;
CREATE TEMP TABLE script_report (
  ord integer NOT NULL,
  section text NOT NULL,
  detail text NOT NULL
);

INSERT INTO script_report (ord, section, detail)
SELECT 1, 'before order',
  COALESCE(o.id, '(missing)') || ' ocn_number=' || COALESCE(o.ocn_number, '')
  || ' job_details.ocnNumber=' || COALESCE(o.job_details ->> 'ocnNumber', '')
FROM public.orders o
WHERE o.id = 'ORD-2026-242';

INSERT INTO script_report (ord, section, detail)
SELECT 2, 'before ocn 163',
  COALESCE(c.id, '(none)') || ' order_id=' || COALESCE(c.order_id, '')
FROM public.order_confirmations c
WHERE c.id = 'SIL/OCN/26-27/163' OR c.ocn_number = 'SIL/OCN/26-27/163';

INSERT INTO script_report (ord, section, detail)
SELECT 3, 'before quote',
  q.id || ' ' || COALESCE(q.quotation_no, '') || ' status=' || COALESCE(q.status, '')
FROM public.sales_quotations q
WHERE q.id = 'QTN-1794635964007';

DO $$
DECLARE
  order_row public.orders%ROWTYPE;
  quote_row public.sales_quotations%ROWTYPE;
  client_row public.clients%ROWTYPE;
  client_count integer;
  name_base text;
  raw_env text;
  envelope jsonb;
  details jsonb;
  payload jsonb;
  created_at timestamptz := timestamptz '2026-11-16 16:27:00+05:30';
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.order_confirmations c
    WHERE c.id = 'SIL/OCN/26-27/163'
       OR btrim(c.ocn_number) = 'SIL/OCN/26-27/163'
  ) THEN
    RAISE EXCEPTION 'SIL/OCN/26-27/163 already exists. It was not overwritten.';
  END IF;

  SELECT * INTO order_row FROM public.orders WHERE id = 'ORD-2026-242';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORD-2026-242 was not found. Nothing was inserted.';
  END IF;

  SELECT * INTO quote_row
  FROM public.sales_quotations
  WHERE id = 'QTN-1794635964007'
    AND btrim(quotation_no) = 'SIL/QTN/26-27/501';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation QTN-1794635964007 / SIL/QTN/26-27/501 was not found. Nothing was inserted.';
  END IF;

  IF lower(btrim(COALESCE(quote_row.client_name, '')))
     IS DISTINCT FROM lower(btrim(COALESCE(order_row.client_name, ''))) THEN
    RAISE EXCEPTION 'The quotation client does not match ORD-2026-242. Nothing was inserted.';
  END IF;

  SELECT count(*) INTO client_count
  FROM public.clients
  WHERE lower(btrim(name)) = lower(btrim(order_row.client_name));
  IF client_count <> 1 THEN
    RAISE EXCEPTION 'The client directory does not have exactly one row for %. Nothing was inserted.', order_row.client_name;
  END IF;

  SELECT * INTO client_row
  FROM public.clients
  WHERE lower(btrim(name)) = lower(btrim(order_row.client_name));

  details := CASE
    WHEN jsonb_typeof(order_row.job_details) = 'object' THEN order_row.job_details
    ELSE '{}'::jsonb
  END;

  IF position(' ||| ' IN COALESCE(order_row.job_name, '')) > 0 THEN
    name_base := substring(order_row.job_name FROM 1 FOR position(' ||| ' IN order_row.job_name) - 1);
    raw_env := substring(order_row.job_name FROM position(' ||| ' IN order_row.job_name) + 5);
    IF left(btrim(raw_env), 1) <> '{' THEN
      RAISE EXCEPTION 'ORD-2026-242 job name envelope is not JSON. It was not changed.';
    END IF;
    envelope := raw_env::jsonb;
  ELSE
    name_base := COALESCE(order_row.job_name, '');
    envelope := NULL;
  END IF;

  payload := jsonb_build_object(
    'id', 'SIL/OCN/26-27/163',
    'ocnNumber', 'SIL/OCN/26-27/163',
    'orderId', order_row.id,
    'jobName', name_base,
    'clientName', order_row.client_name,
    'clientDetails', jsonb_build_object(
      'id', client_row.id,
      'name', client_row.name,
      'gstin', client_row.gstin,
      'address', client_row.address,
      'paymentTerms', client_row.payment_terms,
      'contactPerson', client_row.contact_person,
      'phone', client_row.phone,
      'email', client_row.email
    ),
    'orderDate', '2026-11-16',
    'targetDeliveryDate', COALESCE(order_row.target_delivery_date, order_row.delivery_date),
    'orderQtyKg', order_row.order_qty_kg,
    'orderType', order_row.order_type,
    'printWidthMm', details -> 'printWidthMm',
    'repeatLengthMm', details -> 'repeatLengthMm',
    'totalLaminateGsm', details -> 'calculationDetails' -> 'totalLaminateGsm',
    'totalAreaSqm', details -> 'calculationDetails' -> 'totalAreaSqm',
    'wastagePct', details -> 'wastagePct',
    'minSellingPricePerKg', 'null'::jsonb,
    'totalMinSellingAmount', 'null'::jsonb,
    'conversionChargesPerKg', 'null'::jsonb,
    'fixedProfitPerKg', 'null'::jsonb,
    'metallocenePct', COALESCE(details ->> 'metallocenePct', order_row.metallocene_pct, ''),
    'layers', COALESCE(details -> 'layers', '[]'::jsonb),
    'structure', details ->> 'structure',
    'variants', COALESCE(details -> 'variants', '[]'::jsonb),
    'hasVariants', COALESCE(details -> 'hasVariants', 'false'::jsonb),
    'calculationData', details -> 'calculationDetails',
    'summary', details -> 'calculationDetails' -> 'summary',
    'layerResults', details -> 'calculationDetails' -> 'layerResults',
    'inkDetails', details -> 'calculationDetails' -> 'inkDetails',
    'adhesiveDetails', details -> 'calculationDetails' -> 'adhesiveDetails',
    'orderComments', COALESCE(details ->> 'orderComments', details ->> 'comments', ''),
    'status', 'Confirmed',
    'revisionNo', 0,
    'amendmentNo', 'Rev 00',
    'revisions', '[]'::jsonb,
    'createdAt', created_at,
    'updatedAt', created_at,
    'quotationNo', quote_row.quotation_no,
    'sourceQuotationNo', quote_row.quotation_no,
    'quotationId', quote_row.id
  );

  INSERT INTO public.order_confirmations (
    id, ocn_number, order_id, job_name, client_name, status,
    revision_no, amendment_no, amended_at, amended_by, amendment_reason,
    payload, created_at, updated_at
  ) VALUES (
    'SIL/OCN/26-27/163',
    'SIL/OCN/26-27/163',
    order_row.id,
    name_base,
    order_row.client_name,
    'Confirmed',
    0,
    'Rev 00',
    NULL,
    NULL,
    NULL,
    payload,
    created_at,
    created_at
  );

  details := jsonb_set(jsonb_set(details, '{ocnNumber}', '"SIL/OCN/26-27/163"'::jsonb, true),
                       '{ocnId}', '"SIL/OCN/26-27/163"'::jsonb, true);

  IF envelope IS NOT NULL THEN
    IF jsonb_typeof(envelope -> 'jobDetails') IS DISTINCT FROM 'object' THEN
      envelope := jsonb_set(envelope, '{jobDetails}', '{}'::jsonb, true);
    END IF;
    envelope := jsonb_set(jsonb_set(envelope, '{jobDetails,ocnNumber}', '"SIL/OCN/26-27/163"'::jsonb, true),
                          '{jobDetails,ocnId}', '"SIL/OCN/26-27/163"'::jsonb, true);
  END IF;

  UPDATE public.orders
  SET
    job_details = details,
    ocn_number = 'SIL/OCN/26-27/163',
    ocn_id = 'SIL/OCN/26-27/163',
    job_name = CASE
      WHEN envelope IS NULL THEN job_name
      ELSE name_base || ' ||| ' || envelope::text
    END
  WHERE id = 'ORD-2026-242';

  IF NOT EXISTS (
    SELECT 1 FROM public.order_confirmations c
    WHERE c.id = 'SIL/OCN/26-27/163'
      AND c.ocn_number = 'SIL/OCN/26-27/163'
      AND c.order_id = 'ORD-2026-242'
      AND c.payload ->> 'quotationNo' = 'SIL/QTN/26-27/501'
      AND c.payload ->> 'quotationId' = 'QTN-1794635964007'
      AND c.payload ->> 'sourceQuotationNo' = 'SIL/QTN/26-27/501'
      AND c.created_at = timestamptz '2026-11-16 16:27:00+05:30'
      AND c.payload ? 'conversionChargesPerKg'
      AND c.payload -> 'conversionChargesPerKg' = 'null'::jsonb
      AND c.payload ? 'fixedProfitPerKg'
      AND c.payload -> 'fixedProfitPerKg' = 'null'::jsonb
      AND c.payload ? 'minSellingPricePerKg'
      AND c.payload -> 'minSellingPricePerKg' = 'null'::jsonb
  ) THEN
    RAISE EXCEPTION 'OCN SIL/OCN/26-27/163 was not built for ORD-2026-242.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = 'ORD-2026-242'
      AND o.ocn_number = 'SIL/OCN/26-27/163'
      AND o.ocn_id = 'SIL/OCN/26-27/163'
      AND o.job_details ->> 'ocnNumber' = 'SIL/OCN/26-27/163'
      AND o.job_details ->> 'ocnId' = 'SIL/OCN/26-27/163'
      AND (
        position(' ||| ' IN COALESCE(o.job_name, '')) = 0
        OR (
          (substring(o.job_name FROM position(' ||| ' IN o.job_name) + 5))::jsonb
            -> 'jobDetails' ->> 'ocnNumber' = 'SIL/OCN/26-27/163'
          AND (substring(o.job_name FROM position(' ||| ' IN o.job_name) + 5))::jsonb
            -> 'jobDetails' ->> 'ocnId' = 'SIL/OCN/26-27/163'
        )
      )
  ) THEN
    RAISE EXCEPTION 'ORD-2026-242 was not linked to SIL/OCN/26-27/163.';
  END IF;
END $$;

INSERT INTO script_report (ord, section, detail)
SELECT 4, 'after ocn',
  c.id || ' order_id=' || COALESCE(c.order_id, '')
  || ' charges=' || COALESCE(c.payload ->> 'conversionChargesPerKg', 'null')
  || ' profit=' || COALESCE(c.payload ->> 'fixedProfitPerKg', 'null')
  || ' min=' || COALESCE(c.payload ->> 'minSellingPricePerKg', 'null')
  || ' quote=' || COALESCE(c.payload ->> 'quotationNo', '')
FROM public.order_confirmations c
WHERE c.id = 'SIL/OCN/26-27/163';

INSERT INTO script_report (ord, section, detail)
SELECT 5, 'after order',
  o.id || ' ocn_number=' || COALESCE(o.ocn_number, '')
  || ' job_details.ocnNumber=' || COALESCE(o.job_details ->> 'ocnNumber', '')
FROM public.orders o
WHERE o.id = 'ORD-2026-242';

INSERT INTO script_report (ord, section, detail)
SELECT 6, 'quote unchanged check',
  q.id || ' status=' || COALESCE(q.status, '')
FROM public.sales_quotations q
WHERE q.id = 'QTN-1794635964007';

ROLLBACK;
