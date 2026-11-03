-- Close the five print runs left open together on MAC-PRINT-30.
-- NOT a migration. This file is not in supabase/migrations and does not run
-- on deploy.
--
-- Orders: ORD-2026-224, ORD-2026-203, ORD-2026-201, ORD-2026-180, ORD-2026-131.
--
-- The screen reads press state from the job-name envelope, then job_details,
-- then the printing columns. Closing only the columns would leave those jobs
-- looking active. This script writes all three, clears print_active_slot when
-- that column exists, and closes a matching open print_runs row when that
-- table exists. It does not delete the orders.
--
-- The transaction ends in ROLLBACK. Review the before/after report, then
-- change the last line to COMMIT. Rehearse on the test project
-- awtjvrhpoyzjwrfumhip first. Do not run this against production until the
-- one-run guard is deployed and the preview looks right.
-- Safe to run again: an order that is already ended is left as it is.

begin;

drop table if exists script_report;
create temp table script_report (
  ord integer not null,
  section text not null,
  detail text not null
);

insert into script_report (ord, section, detail)
select 1, 'before',
  o.id || ' status=' || coalesce(o.printing_status, '')
    || ' machine=' || coalesce(o.machine_id, '')
    || ' start=' || coalesce(o.printing_start_time::text, '')
    || ' end=' || coalesce(o.printing_end_time::text, '')
from public.orders as o
where o.id in (
  'ORD-2026-224', 'ORD-2026-203', 'ORD-2026-201', 'ORD-2026-180', 'ORD-2026-131'
)
order by o.id;

do $close$
declare
  target_ids text[] := array[
    'ORD-2026-224', 'ORD-2026-203', 'ORD-2026-201', 'ORD-2026-180', 'ORD-2026-131'
  ];
  order_id text;
  row public.orders;
  details jsonb;
  envelope jsonb;
  delim integer;
  base text;
  raw text;
  ended_at timestamptz := pg_catalog.now();
  has_slot boolean;
  closed_count integer := 0;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'print_active_slot'
  ) into has_slot;

  foreach order_id in array target_ids loop
    select * into row from public.orders where id = order_id for update;
    if not found then
      insert into script_report (ord, section, detail)
      values (2, 'missing', order_id || ' is not in public.orders');
      continue;
    end if;

    delim := position(' ||| ' in coalesce(row.job_name, ''));
    if delim > 0 then
      base := substring(row.job_name from 1 for delim - 1);
      raw := substring(row.job_name from delim + 5);
      begin
        envelope := raw::jsonb;
      exception when others then
        envelope := '{}'::jsonb;
      end;
    else
      base := coalesce(row.job_name, '');
      envelope := '{}'::jsonb;
    end if;
    if jsonb_typeof(envelope) is distinct from 'object' then
      envelope := '{}'::jsonb;
    end if;

    details := coalesce(row.job_details, '{}'::jsonb);
    if jsonb_typeof(envelope->'jobDetails') = 'object' then
      details := envelope->'jobDetails';
    end if;

    -- Already ended in the envelope, the details, and the column.
    if coalesce(row.printing_end_time, null) is not null
       and lower(btrim(coalesce(row.printing_status, ''))) in ('completed', 'cancelled', 'canceled')
       and nullif(envelope->>'printingEndTime', '') is not null
       and lower(btrim(coalesce(envelope->>'printingStatus', details->>'printingStatus', ''))) in ('completed', 'cancelled', 'canceled') then
      insert into script_report (ord, section, detail)
      values (3, 'already-ended', order_id);
      continue;
    end if;

    details := jsonb_set(details, '{printingStatus}', to_jsonb('Completed'::text), true);
    details := jsonb_set(details, '{isPrintingCompleted}', 'true'::jsonb, true);
    details := jsonb_set(details, '{printingEndTime}', to_jsonb(ended_at), true);
    envelope := jsonb_set(envelope, '{printingStatus}', to_jsonb('Completed'::text), true);
    envelope := jsonb_set(envelope, '{isPrintingCompleted}', 'true'::jsonb, true);
    envelope := jsonb_set(envelope, '{printingEndTime}', to_jsonb(ended_at), true);
    envelope := jsonb_set(envelope, '{jobDetails}', details, true);

    if has_slot then
      update public.orders
      set
        printing_status = 'Completed',
        printing_end_time = coalesce(printing_end_time, ended_at),
        print_active_slot = null,
        job_details = details,
        job_name = base || ' ||| ' || envelope::text
      where id = order_id;
    else
      update public.orders
      set
        printing_status = 'Completed',
        printing_end_time = coalesce(printing_end_time, ended_at),
        job_details = details,
        job_name = base || ' ||| ' || envelope::text
      where id = order_id;
    end if;
    closed_count := closed_count + 1;
  end loop;

  if to_regclass('public.print_runs') is not null then
    update public.print_runs
    set ended_at = coalesce(ended_at, pg_catalog.now())
    where order_id = any (target_ids)
      and ended_at is null;
  end if;

  insert into script_report (ord, section, detail)
  values (4, 'closed', closed_count::text || ' order(s) marked completed');
end
$close$;

insert into script_report (ord, section, detail)
select 5, 'after',
  o.id || ' status=' || coalesce(o.printing_status, '')
    || ' machine=' || coalesce(o.machine_id, '')
    || ' end=' || coalesce(o.printing_end_time::text, '')
from public.orders as o
where o.id in (
  'ORD-2026-224', 'ORD-2026-203', 'ORD-2026-201', 'ORD-2026-180', 'ORD-2026-131'
)
order by o.id;

select ord, section, detail from script_report order by ord, detail;

-- Change ROLLBACK to COMMIT only after the report looks right.
rollback;
