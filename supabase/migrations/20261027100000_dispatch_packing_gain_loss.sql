-- Dispatch Packing consumption lands on the order's open packing list.
-- Gain/loss (packed net versus FG consumed) is stored for Admin only.
-- Safe to re-run. Existing packing lists are not rewritten.
-- The alert threshold setting is dispatch_packing_gain_loss_threshold_pct.
-- When that setting is missing, the threshold is 2%.

ALTER TABLE public.dispatch_shipments
  ADD COLUMN IF NOT EXISTS packing_status text;

CREATE TABLE IF NOT EXISTS public.packing_list_consumptions (
  id text PRIMARY KEY,
  packing_list_id text NOT NULL,
  order_id text,
  job_name text,
  job_code text,
  barcode text,
  consumed_kg numeric NOT NULL,
  operator_name text,
  consumed_by text,
  consumed_at timestamptz NOT NULL,
  shift text,
  target_machine text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS packing_list_consumptions_list_idx
  ON public.packing_list_consumptions (packing_list_id);

CREATE INDEX IF NOT EXISTS dispatch_shipments_open_order_idx
  ON public.dispatch_shipments (order_id)
  WHERE packing_status = 'Open';

CREATE TABLE IF NOT EXISTS public.packing_gain_loss (
  packing_list_id text PRIMARY KEY,
  order_id text,
  job_name text,
  client_name text,
  packing_status text,
  fg_consumed_kg numeric NOT NULL DEFAULT 0,
  packed_net_kg numeric NOT NULL DEFAULT 0,
  difference_kg numeric NOT NULL DEFAULT 0,
  difference_pct numeric,
  threshold_pct numeric NOT NULL DEFAULT 2,
  alerted boolean NOT NULL DEFAULT false,
  opened_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.packing_list_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_gain_loss ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.packing_list_consumptions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.packing_gain_loss FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.packing_list_consumptions TO authenticated;
GRANT SELECT ON TABLE public.packing_gain_loss TO authenticated;

DROP POLICY IF EXISTS packing_list_consumptions_read ON public.packing_list_consumptions;
CREATE POLICY packing_list_consumptions_read
  ON public.packing_list_consumptions
  FOR SELECT
  TO authenticated
  USING (private.can_any(ARRAY['dispatch', 'sfg_store', 'production_records', 'inventory']));

DROP POLICY IF EXISTS packing_gain_loss_admin_read ON public.packing_gain_loss;
CREATE POLICY packing_gain_loss_admin_read
  ON public.packing_gain_loss
  FOR SELECT
  TO authenticated
  USING (private.app_role() = 'Admin');

-- Staff who can read other notices still cannot read this variance.
DO $$
BEGIN
  IF to_regclass('public.erp_notifications') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS erp_notifications_gain_loss_read ON public.erp_notifications';
  EXECUTE 'DROP POLICY IF EXISTS erp_notifications_gain_loss_insert ON public.erp_notifications';
  EXECUTE 'DROP POLICY IF EXISTS erp_notifications_gain_loss_update ON public.erp_notifications';
  EXECUTE 'DROP POLICY IF EXISTS erp_notifications_gain_loss_delete ON public.erp_notifications';
  EXECUTE $policy$
    CREATE POLICY erp_notifications_gain_loss_read
      ON public.erp_notifications
      AS RESTRICTIVE
      FOR SELECT
      TO authenticated
      USING (
        coalesce(payload->>'type', '') <> 'PACKING_GAIN_LOSS'
        OR private.app_role() = 'Admin'
      )
  $policy$;
  EXECUTE $policy$
    CREATE POLICY erp_notifications_gain_loss_insert
      ON public.erp_notifications
      AS RESTRICTIVE
      FOR INSERT
      TO authenticated
      WITH CHECK (
        coalesce(payload->>'type', '') <> 'PACKING_GAIN_LOSS'
        OR private.app_role() = 'Admin'
      )
  $policy$;
  EXECUTE $policy$
    CREATE POLICY erp_notifications_gain_loss_update
      ON public.erp_notifications
      AS RESTRICTIVE
      FOR UPDATE
      TO authenticated
      USING (
        coalesce(payload->>'type', '') <> 'PACKING_GAIN_LOSS'
        OR private.app_role() = 'Admin'
      )
      WITH CHECK (
        coalesce(payload->>'type', '') <> 'PACKING_GAIN_LOSS'
        OR private.app_role() = 'Admin'
      )
  $policy$;
  EXECUTE $policy$
    CREATE POLICY erp_notifications_gain_loss_delete
      ON public.erp_notifications
      AS RESTRICTIVE
      FOR DELETE
      TO authenticated
      USING (
        coalesce(payload->>'type', '') <> 'PACKING_GAIN_LOSS'
        OR private.app_role() = 'Admin'
      )
  $policy$;
END $$;

CREATE OR REPLACE FUNCTION private.packing_gain_loss_threshold()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  raw text;
  parsed numeric;
BEGIN
  SELECT setting_value INTO raw
  FROM public.system_settings
  WHERE setting_key = 'dispatch_packing_gain_loss_threshold_pct';
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN 2;
  END IF;
  BEGIN
    parsed := btrim(btrim(raw), '"')::numeric;
  EXCEPTION WHEN others THEN
    RETURN 2;
  END;
  IF parsed IS NULL OR parsed < 0 THEN
    RETURN 2;
  END IF;
  RETURN round(parsed, 2);
END;
$$;

CREATE OR REPLACE FUNCTION private.packing_consumption_json(p_dispatch_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'packingListId', c.packing_list_id,
    'barcode', c.barcode,
    'jobName', c.job_name,
    'jobCode', c.job_code,
    'orderId', c.order_id,
    'consumedKg', c.consumed_kg,
    'operatorName', c.operator_name,
    'consumedBy', c.consumed_by,
    'consumedAt', c.consumed_at,
    'shift', c.shift,
    'targetMachine', c.target_machine,
    'notes', c.notes,
    'targetProcess', 'Dispatch Packing'
  ) ORDER BY c.consumed_at, c.id), '[]'::jsonb)
  FROM public.packing_list_consumptions c
  WHERE c.packing_list_id = p_dispatch_id;
$$;

CREATE OR REPLACE FUNCTION private.packing_shipment_json(p_dispatch_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shipment public.dispatch_shipments%ROWTYPE;
BEGIN
  SELECT * INTO shipment
  FROM public.dispatch_shipments
  WHERE dispatch_id = p_dispatch_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'id', coalesce(shipment.id, shipment.dispatch_id),
    'dispatchId', shipment.dispatch_id,
    'orderId', coalesce(shipment.order_id, ''),
    'jobName', shipment.job_name,
    'clientName', shipment.client_name,
    'vehicleNo', coalesce(shipment.vehicle_no, ''),
    'lrNo', coalesce(shipment.lr_no, ''),
    'transporterName', coalesce(shipment.transporter_name, ''),
    'poNo', coalesce(shipment.po_no, ''),
    'invoiceNo', coalesce(shipment.invoice_no, ''),
    'dispatchDate', shipment.dispatch_date,
    'createdAt', shipment.created_at,
    'packingStatus', coalesce(shipment.packing_status, 'Finalised'),
    'totalRolls', coalesce(shipment.total_rolls, 0),
    'totalNetWeightKg', coalesce(shipment.total_net_weight_kg, 0),
    'totalGrossWeightKg', coalesce(shipment.total_gross_weight_kg, 0),
    'items', coalesce(shipment.items, '[]'::jsonb),
    'hideBranding', coalesce(shipment.hide_branding, false),
    'dispatchConsumptions', private.packing_consumption_json(shipment.dispatch_id),
    'stockApplied', true,
    'source', 'Dispatch Packing'
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.refresh_packing_gain_loss(p_dispatch_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  shipment public.dispatch_shipments%ROWTYPE;
  consumed numeric := 0;
  packed numeric := 0;
  diff numeric := 0;
  pct numeric;
  threshold numeric;
  package_count integer := 0;
  should_alert boolean := false;
  notif_id text;
  message text;
BEGIN
  IF p_dispatch_id IS NULL OR btrim(p_dispatch_id) = '' THEN
    RETURN;
  END IF;
  notif_id := 'PACKING-GAIN-LOSS-' || p_dispatch_id;

  SELECT * INTO shipment
  FROM public.dispatch_shipments
  WHERE dispatch_id = p_dispatch_id;

  IF NOT FOUND THEN
    DELETE FROM public.packing_gain_loss WHERE packing_list_id = p_dispatch_id;
    IF to_regclass('public.erp_notifications') IS NOT NULL THEN
      DELETE FROM public.erp_notifications WHERE id = notif_id;
    END IF;
    RETURN;
  END IF;

  SELECT coalesce(sum(consumed_kg), 0) INTO consumed
  FROM public.packing_list_consumptions
  WHERE packing_list_id = p_dispatch_id;
  consumed := round(consumed, 2);

  IF consumed <= 0 THEN
    DELETE FROM public.packing_gain_loss WHERE packing_list_id = p_dispatch_id;
    IF to_regclass('public.erp_notifications') IS NOT NULL THEN
      DELETE FROM public.erp_notifications WHERE id = notif_id;
    END IF;
    RETURN;
  END IF;

  packed := round(coalesce(shipment.total_net_weight_kg, 0), 2);
  diff := round(packed - consumed, 2);
  pct := round((diff / consumed) * 100, 2);
  threshold := private.packing_gain_loss_threshold();
  package_count := coalesce(jsonb_array_length(
    CASE WHEN jsonb_typeof(shipment.items) = 'array' THEN shipment.items ELSE '[]'::jsonb END
  ), 0);
  should_alert := abs(pct) > threshold
    AND (package_count > 0 OR packed > 0 OR shipment.packing_status = 'Finalised')
    AND (packed > 0 OR shipment.packing_status = 'Finalised');

  INSERT INTO public.packing_gain_loss (
    packing_list_id, order_id, job_name, client_name, packing_status,
    fg_consumed_kg, packed_net_kg, difference_kg, difference_pct,
    threshold_pct, alerted, opened_at, updated_at
  ) VALUES (
    p_dispatch_id,
    shipment.order_id,
    shipment.job_name,
    shipment.client_name,
    coalesce(shipment.packing_status, 'Finalised'),
    consumed,
    packed,
    diff,
    pct,
    threshold,
    should_alert,
    coalesce(shipment.created_at, now()),
    now()
  )
  ON CONFLICT (packing_list_id) DO UPDATE SET
    order_id = EXCLUDED.order_id,
    job_name = EXCLUDED.job_name,
    client_name = EXCLUDED.client_name,
    packing_status = EXCLUDED.packing_status,
    fg_consumed_kg = EXCLUDED.fg_consumed_kg,
    packed_net_kg = EXCLUDED.packed_net_kg,
    difference_kg = EXCLUDED.difference_kg,
    difference_pct = EXCLUDED.difference_pct,
    threshold_pct = EXCLUDED.threshold_pct,
    alerted = EXCLUDED.alerted,
    opened_at = coalesce(public.packing_gain_loss.opened_at, EXCLUDED.opened_at),
    updated_at = now();

  IF to_regclass('public.erp_notifications') IS NULL THEN
    RETURN;
  END IF;

  IF should_alert THEN
    message := format(
      'Packing list %s (%s, %s): FG consumed %s kg, packed net %s kg, difference %s kg (%s%%). Alert threshold is %s%%.',
      p_dispatch_id,
      coalesce(shipment.order_id, 'no order'),
      coalesce(shipment.job_name, 'no job'),
      to_char(consumed, 'FM999999990.00'),
      to_char(packed, 'FM999999990.00'),
      to_char(diff, 'SG999999990.00'),
      to_char(pct, 'SG999999990.00'),
      to_char(threshold, 'FM999999990.00')
    );
    INSERT INTO public.erp_notifications (id, payload, created_at, updated_at)
    VALUES (
      notif_id,
      jsonb_build_object(
        'id', notif_id,
        'type', 'PACKING_GAIN_LOSS',
        'audience', 'Admin',
        'title', 'Dispatch packing gain/loss is over the alert threshold',
        'message', message,
        'packingListId', p_dispatch_id,
        'orderId', shipment.order_id,
        'jobName', shipment.job_name,
        'fgConsumedKg', consumed,
        'packedNetKg', packed,
        'differenceKg', diff,
        'differencePct', pct,
        'thresholdPct', threshold,
        'timestamp', now(),
        'read', false
      ),
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = now();
  ELSE
    DELETE FROM public.erp_notifications WHERE id = notif_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_dispatch_packing_gain_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.refresh_packing_gain_loss(NEW.dispatch_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_consumption_gain_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  list_id text := coalesce(NEW.packing_list_id, OLD.packing_list_id);
BEGIN
  PERFORM private.refresh_packing_gain_loss(list_id);
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION private.delete_dispatch_packing_gain_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.packing_list_consumptions WHERE packing_list_id = OLD.dispatch_id;
  DELETE FROM public.packing_gain_loss WHERE packing_list_id = OLD.dispatch_id;
  IF to_regclass('public.erp_notifications') IS NOT NULL THEN
    DELETE FROM public.erp_notifications WHERE id = 'PACKING-GAIN-LOSS-' || OLD.dispatch_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_shipments_gain_loss ON public.dispatch_shipments;
CREATE TRIGGER dispatch_shipments_gain_loss
  AFTER INSERT OR UPDATE OF total_net_weight_kg, items, packing_status
  ON public.dispatch_shipments
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_dispatch_packing_gain_loss();

DROP TRIGGER IF EXISTS dispatch_shipments_gain_loss_delete ON public.dispatch_shipments;
CREATE TRIGGER dispatch_shipments_gain_loss_delete
  AFTER DELETE ON public.dispatch_shipments
  FOR EACH ROW
  EXECUTE FUNCTION private.delete_dispatch_packing_gain_loss();

DROP TRIGGER IF EXISTS packing_list_consumptions_gain_loss ON public.packing_list_consumptions;
CREATE TRIGGER packing_list_consumptions_gain_loss
  AFTER INSERT OR UPDATE OR DELETE ON public.packing_list_consumptions
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_consumption_gain_loss();

CREATE OR REPLACE FUNCTION private.record_dispatch_packing_consumption(p_entry jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_entry_id text;
  v_order_id text;
  v_job_name text;
  v_consumed numeric;
  v_consumed_at timestamptz;
  v_target_id text;
  v_candidate text;
  v_created boolean := false;
BEGIN
  IF coalesce(private.app_role(), '') = ''
     OR NOT private.can_any(ARRAY['dispatch', 'sfg_store', 'production_records', 'inventory']) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'consumption entry is required';
  END IF;
  IF coalesce(p_entry->>'targetProcess', 'Dispatch Packing') <> 'Dispatch Packing' THEN
    RAISE EXCEPTION 'only Dispatch Packing consumption is recorded on a packing list';
  END IF;

  v_entry_id := btrim(coalesce(p_entry->>'id', ''));
  v_order_id := btrim(coalesce(p_entry->>'orderId', ''));
  v_job_name := btrim(coalesce(p_entry->>'jobName', ''));
  IF v_entry_id = '' THEN
    RAISE EXCEPTION 'consumption id is required';
  END IF;
  BEGIN
    v_consumed := round(coalesce((p_entry->>'consumedKg')::numeric, 0), 2);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'consumed weight must be greater than 0 kg';
  END;
  IF v_consumed <= 0 THEN
    RAISE EXCEPTION 'consumed weight must be greater than 0 kg';
  END IF;
  IF v_order_id = '' AND v_job_name = '' THEN
    RAISE EXCEPTION 'order or job is required';
  END IF;
  BEGIN
    v_consumed_at := coalesce(nullif(p_entry->>'consumedAt', '')::timestamptz, now());
  EXCEPTION WHEN others THEN
    v_consumed_at := now();
  END;

  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(nullif(v_order_id, ''), lower(v_job_name)), 0));

  SELECT c.packing_list_id INTO v_target_id
  FROM public.packing_list_consumptions c
  WHERE c.id = v_entry_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'idempotent', true,
      'created', false,
      'dispatchId', v_target_id,
      'shipment', private.packing_shipment_json(v_target_id)
    );
  END IF;

  SELECT ds.dispatch_id INTO v_target_id
  FROM public.dispatch_shipments ds
  WHERE ds.packing_status = 'Open'
    AND (
      (v_order_id <> '' AND ds.order_id = v_order_id)
      OR (v_order_id = '' AND lower(ds.job_name) = lower(v_job_name))
    )
  ORDER BY ds.created_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_target_id IS NULL THEN
    v_candidate := nullif(btrim(coalesce(p_entry->>'suggestedDispatchId', '')), '');
    IF v_candidate IS NULL OR EXISTS (
      SELECT 1 FROM public.dispatch_shipments existing WHERE existing.dispatch_id = v_candidate
    ) THEN
      v_candidate := 'PL-' || to_char(v_consumed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || substr(md5(v_entry_id), 1, 8);
    END IF;
    INSERT INTO public.dispatch_shipments (
      dispatch_id, id, order_id, job_name, client_name, vehicle_no, lr_no,
      transporter_name, po_no, invoice_no, dispatch_date, total_rolls,
      total_net_weight_kg, total_gross_weight_kg, items, hide_branding,
      packing_status, payload, created_at, updated_at
    ) VALUES (
      v_candidate,
      'DISP-PL-' || v_entry_id,
      nullif(v_order_id, ''),
      coalesce(nullif(v_job_name, ''), 'Finished Goods Job'),
      coalesce(nullif(btrim(coalesce(p_entry->>'clientName', '')), ''), 'Customer'),
      '',
      '',
      '',
      coalesce(p_entry->>'poNo', ''),
      '',
      v_consumed_at,
      0,
      0,
      0,
      '[]'::jsonb,
      false,
      'Open',
      '{}'::jsonb,
      v_consumed_at,
      now()
    );
    v_target_id := v_candidate;
    v_created := true;
  END IF;

  INSERT INTO public.packing_list_consumptions (
    id, packing_list_id, order_id, job_name, job_code, barcode, consumed_kg,
    operator_name, consumed_by, consumed_at, shift, target_machine, notes
  ) VALUES (
    v_entry_id,
    v_target_id,
    nullif(v_order_id, ''),
    nullif(v_job_name, ''),
    nullif(btrim(coalesce(p_entry->>'jobCode', '')), ''),
    nullif(btrim(coalesce(p_entry->>'barcode', '')), ''),
    v_consumed,
    nullif(btrim(coalesce(p_entry->>'operatorName', '')), ''),
    nullif(btrim(coalesce(p_entry->>'consumedBy', '')), ''),
    v_consumed_at,
    nullif(btrim(coalesce(p_entry->>'shift', '')), ''),
    nullif(btrim(coalesce(p_entry->>'targetMachine', '')), ''),
    nullif(btrim(coalesce(p_entry->>'notes', '')), '')
  );

  UPDATE public.dispatch_shipments
  SET payload = private.packing_shipment_json(v_target_id),
      updated_at = now()
  WHERE dispatch_id = v_target_id;

  RETURN jsonb_build_object(
    'idempotent', false,
    'created', v_created,
    'dispatchId', v_target_id,
    'shipment', private.packing_shipment_json(v_target_id)
  );
EXCEPTION WHEN unique_violation THEN
  SELECT c.packing_list_id INTO v_target_id
  FROM public.packing_list_consumptions c
  WHERE c.id = v_entry_id;
  IF v_target_id IS NULL THEN
    RAISE;
  END IF;
  RETURN jsonb_build_object(
    'idempotent', true,
    'created', false,
    'dispatchId', v_target_id,
    'shipment', private.packing_shipment_json(v_target_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.packing_gain_loss_report(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_only_over boolean DEFAULT false
)
RETURNS TABLE (
  packing_list_id text,
  order_id text,
  job_name text,
  client_name text,
  packing_status text,
  fg_consumed_kg numeric,
  packed_net_kg numeric,
  difference_kg numeric,
  difference_pct numeric,
  threshold_pct numeric,
  over_threshold boolean,
  alerted boolean,
  opened_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  threshold numeric;
BEGIN
  IF private.app_role() IS DISTINCT FROM 'Admin' THEN
    RETURN;
  END IF;
  threshold := private.packing_gain_loss_threshold();
  RETURN QUERY
  SELECT
    row.packing_list_id,
    row.order_id,
    row.job_name,
    row.client_name,
    row.packing_status,
    row.fg_consumed_kg,
    row.packed_net_kg,
    row.difference_kg,
    row.difference_pct,
    threshold,
    (row.difference_pct IS NOT NULL AND abs(row.difference_pct) > threshold),
    row.alerted,
    row.opened_at,
    row.updated_at
  FROM public.packing_gain_loss row
  WHERE row.fg_consumed_kg > 0
    AND (p_from IS NULL OR row.opened_at >= p_from)
    AND (p_to IS NULL OR row.opened_at <= p_to)
    AND (p_status IS NULL OR btrim(p_status) = '' OR lower(p_status) = 'all' OR row.packing_status = p_status)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
      OR lower(concat_ws(' ', row.packing_list_id, row.order_id, row.job_name, row.client_name))
         LIKE '%' || lower(btrim(p_search)) || '%'
    )
    AND (
      NOT coalesce(p_only_over, false)
      OR (row.difference_pct IS NOT NULL AND abs(row.difference_pct) > threshold)
    )
  ORDER BY row.opened_at DESC NULLS LAST, row.packing_list_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_dispatch_packing_consumption(p_entry jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.record_dispatch_packing_consumption(p_entry);
$$;

CREATE OR REPLACE FUNCTION public.packing_gain_loss_report(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_only_over boolean DEFAULT false
)
RETURNS TABLE (
  packing_list_id text,
  order_id text,
  job_name text,
  client_name text,
  packing_status text,
  fg_consumed_kg numeric,
  packed_net_kg numeric,
  difference_kg numeric,
  difference_pct numeric,
  threshold_pct numeric,
  over_threshold boolean,
  alerted boolean,
  opened_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.packing_gain_loss_report(p_from, p_to, p_search, p_status, p_only_over);
$$;

REVOKE ALL ON FUNCTION private.packing_gain_loss_threshold() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.packing_consumption_json(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.packing_shipment_json(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.refresh_packing_gain_loss(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.sync_dispatch_packing_gain_loss() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.sync_consumption_gain_loss() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.delete_dispatch_packing_gain_loss() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.record_dispatch_packing_consumption(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.packing_gain_loss_report(timestamptz, timestamptz, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_dispatch_packing_consumption(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.packing_gain_loss_report(timestamptz, timestamptz, text, text, boolean) FROM PUBLIC, anon;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.record_dispatch_packing_consumption(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.packing_gain_loss_report(timestamptz, timestamptz, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_dispatch_packing_consumption(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.packing_gain_loss_report(timestamptz, timestamptz, text, text, boolean) TO authenticated;
