-- Merge duplicate inventory ledgers. NOT a migration. Do not put this file in
-- supabase/migrations (those run on production by themselves).
--
-- Rehearse on the test project awtjvrhpoyzjwrfumhip. Do not run this against
-- production eamstsaqkbeiywfaanhi until the code fix is deployed and this
-- output has been reviewed.
--
-- The transaction ends in ROLLBACK. Change that last line to COMMIT only
-- after the before/after totals look right.
--
-- Owner decisions already applied:
--   * Rate is the quantity-weighted average. A zero quantity does not move the rate.
--   * Location stays the survivor's location (Bay A), not the inward dock.
--   * GRN 124 (invoice K32) still points at INVT-2032. It is flagged and not moved.
--
-- Survivors: INVT-0150<-2031, 0154<-2032, 0156<-2033, 0010<-2036+2037, 0011<-2028, 0023<-2030.
-- Safe to run again. A loser that is already gone is skipped, and a duplicate
-- GRN that is already cancelled is not reversed a second time.

begin;

drop table if exists script_report;
create temp table script_report (
  ord integer not null,
  section text not null,
  detail text not null
);

insert into script_report (ord, section, detail)
select 10, 'before',
  i.id || ' | ' || split_part(i.item_name, ' ||| ', 1)
  || ' | qty=' || coalesce(i.stock_qty_kg, 0)
  || ' | alloc=' || coalesce(i.allocated_qty_kg, 0)
  || ' | rate=' || coalesce(i.unit_price, 0)
  || ' | location=' || coalesce(i.location, '')
from public.inventory i
where i.id in (
  'INVT-0150', 'INVT-2031', 'INVT-0154', 'INVT-2032', 'INVT-0156', 'INVT-2033',
  'INVT-0010', 'INVT-2036', 'INVT-2037', 'INVT-0011', 'INVT-2028', 'INVT-0023', 'INVT-2030'
)
order by i.id;

-- ---------------------------------------------------------------------------
-- Section A. Cancel duplicate GRN 170 and GRN 171.
-- They repeat GRN 166, invoice 2526008783, with trailing underscores.
-- This does not touch GRN 166. Stock posted by 170/171 is removed.
-- Their rolls are voided, not deleted, so the receipt still has a trail.
-- ---------------------------------------------------------------------------

drop table if exists cancel_dupes;
create temp table cancel_dupes as
select g.id, g.grn_number, g.invoice_number, g.stock_item_id, g.received_qty_kg, g.status
from public.grns g
where (
    coalesce(g.grn_number, g.id, '') ~ '(^|/)17[01]$'
    or coalesce(g.id, '') ~ '(^|/)17[01]$'
  )
  and lower(regexp_replace(btrim(coalesce(g.invoice_number, '')), '[\s_-]+', '', 'g')) = '2526008783'
  and coalesce(g.grn_number, g.id, '') !~ '(^|/)166$'
  and lower(coalesce(g.status, '')) not like '%cancel%';

insert into script_report (ord, section, detail)
select 20, 'cancel-grn-170-171',
  'will cancel ' || id || ' (' || coalesce(grn_number, '') || ', invoice ' || coalesce(invoice_number, '') || ', status ' || coalesce(status, '') || ')'
from cancel_dupes
union all
select 21, 'cancel-grn-170-171', 'no duplicate GRN 170/171 left to cancel'
where not exists (select 1 from cancel_dupes);

drop table if exists cancel_qty;
create temp table cancel_qty as
select item_id, sum(qty) as qty
from (
  select coalesce(nullif(l.stock_item_id, ''), nullif(g.stock_item_id, '')) as item_id,
         coalesce(l.net_weight_kg, 0) as qty
  from cancel_dupes d
  join public.grns g on g.id = d.id
  join public.grn_line_items l on l.grn_id = g.id
  union all
  select nullif(g.stock_item_id, ''), coalesce(g.received_qty_kg, 0)
  from cancel_dupes d
  join public.grns g on g.id = d.id
  where not exists (select 1 from public.grn_line_items l where l.grn_id = g.id)
) lines
where item_id is not null and qty > 0
group by item_id;

update public.inventory i
set stock_qty_kg = greatest(0, coalesce(i.stock_qty_kg, 0) - c.qty),
    last_updated = now()
from cancel_qty c
where i.id = c.item_id;

insert into script_report (ord, section, detail)
select 22, 'cancel-grn-170-171',
  'reversed ' || qty || ' kg on ' || item_id
from cancel_qty
union all
select 23, 'cancel-grn-170-171', 'no stock quantity was posted by GRN 170/171'
where exists (select 1 from cancel_dupes)
  and not exists (select 1 from cancel_qty);

update public.inventory_rolls r
set status = 'Void',
    qc_status = 'Void',
    available_weight_kg = 0,
    remarks = concat_ws(' | ', nullif(r.remarks, ''), 'Voided: duplicate of GRN 166 invoice 2526008783')
from cancel_dupes d
join public.grns g on g.id = d.id
where r.grn_id = g.id
   or (
     r.item_id = g.stock_item_id
     and lower(regexp_replace(coalesce(r.invoice_no, ''), '[\s_-]+', '', 'g')) = '2526008783'
   );

update public.grns g
set status = 'Cancelled',
    qc_remarks = 'Cancelled as a duplicate of GRN 166 (invoice 2526008783). Stock and rolls reversed.'
where g.id in (select id from cancel_dupes);

-- ---------------------------------------------------------------------------
-- Section B. Merge the duplicate ledgers into the original INVT-00xx rows.
-- ---------------------------------------------------------------------------

drop table if exists merge_map;
create temp table merge_map (loser text primary key, survivor text not null);
insert into merge_map (loser, survivor) values
  ('INVT-2031', 'INVT-0150'),
  ('INVT-2032', 'INVT-0154'),
  ('INVT-2033', 'INVT-0156'),
  ('INVT-2036', 'INVT-0010'),
  ('INVT-2037', 'INVT-0010'),
  ('INVT-2028', 'INVT-0011'),
  ('INVT-2030', 'INVT-0023');

do $$
begin
  if exists (
    select 1
    from merge_map m
    where exists (select 1 from public.inventory i where i.id = m.loser)
      and not exists (select 1 from public.inventory i where i.id = m.survivor)
  ) then
    raise exception 'survivor row is missing while its duplicate still exists';
  end if;
end $$;

delete from merge_map m
where not exists (select 1 from public.inventory i where i.id = m.loser);

insert into script_report (ord, section, detail)
select 30, 'merge', 'pairing ' || loser || ' into ' || survivor from merge_map
union all
select 31, 'merge', 'no duplicate rows left to merge'
where not exists (select 1 from merge_map);

-- GRN 124 reused INVT-2032 after the original item was deleted. Leave it.
drop table if exists grn_leave_alone;
create temp table grn_leave_alone as
select g.id as grn_id, g.grn_number, g.invoice_number, g.stock_item_id, g.master_item_id
from public.grns g
where (g.stock_item_id = 'INVT-2032' or g.master_item_id = 'INVT-2032'
    or exists (
      select 1 from public.grn_line_items l
      where l.grn_id = g.id and (l.stock_item_id = 'INVT-2032' or l.master_item_id = 'INVT-2032')
    ))
  and (
    coalesce(g.grn_number, '') ~ '(^|/)124$'
    or coalesce(g.id, '') ~ '(^|/)124$'
    or btrim(coalesce(g.invoice_number, '')) = 'K32'
  );

insert into script_report (ord, section, detail)
select 40, 'flag-grn-124',
  'LEFT UNCHANGED: ' || coalesce(grn_number, grn_id)
  || ' invoice ' || coalesce(invoice_number, '')
  || ' still points at INVT-2032 (id was reused; not moved to INVT-0154)'
from grn_leave_alone
union all
select 41, 'flag-grn-124', 'GRN 124 / invoice K32 was not in this database'
where not exists (select 1 from grn_leave_alone);

drop table if exists merged;
create temp table merged as
select m.survivor,
       sum(coalesce(i.stock_qty_kg, 0)) as qty,
       sum(coalesce(i.allocated_qty_kg, 0)) as alloc,
       case when sum(coalesce(i.stock_qty_kg, 0)) > 0
            then round(sum(coalesce(i.stock_qty_kg, 0) * coalesce(i.unit_price, 0)) / sum(coalesce(i.stock_qty_kg, 0)), 2)
       end as wavg_rate
from (
  select survivor, survivor as id from merge_map group by survivor
  union all
  select survivor, loser from merge_map
) m
join public.inventory i on i.id = m.id
group by m.survivor;

update public.inventory_rolls r
set item_id = m.survivor
from merge_map m
where r.item_id = m.loser
  and not exists (select 1 from grn_leave_alone a where a.grn_id = r.grn_id);

update public.grn_line_items l
set stock_item_id = m.survivor
from merge_map m
where l.stock_item_id = m.loser
  and not exists (select 1 from grn_leave_alone a where a.grn_id = l.grn_id);

update public.grn_line_items l
set master_item_id = m.survivor
from merge_map m
where l.master_item_id = m.loser
  and not exists (select 1 from grn_leave_alone a where a.grn_id = l.grn_id);

update public.grns g
set stock_item_id = m.survivor
from merge_map m
where g.stock_item_id = m.loser
  and not exists (select 1 from grn_leave_alone a where a.grn_id = g.id);

update public.grns g
set master_item_id = m.survivor
from merge_map m
where g.master_item_id = m.loser
  and not exists (select 1 from grn_leave_alone a where a.grn_id = g.id);

do $$
declare
  pair record;
begin
  for pair in select loser, survivor from merge_map loop
    update public.store_issue_transactions
    set payload = replace(payload::text, '"' || pair.loser || '"', '"' || pair.survivor || '"')::jsonb
    where payload::text like '%"' || pair.loser || '"%';

    update public.stock_adjustments
    set payload = replace(payload::text, '"' || pair.loser || '"', '"' || pair.survivor || '"')::jsonb
    where payload::text like '%"' || pair.loser || '"%';

    update public.material_indents
    set payload = replace(payload::text, '"' || pair.loser || '"', '"' || pair.survivor || '"')::jsonb
    where payload::text like '%"' || pair.loser || '"%';

    update public.purchase_orders
    set items = replace(items::text, '"' || pair.loser || '"', '"' || pair.survivor || '"')::jsonb
    where items::text like '%"' || pair.loser || '"%';
  end loop;
end $$;

-- barcode_registry is a view, not a table of ids. Nothing to re-point there.
insert into script_report (ord, section, detail)
values (45, 'barcode-registry', 'barcode_registry is a view; no item ids were rewritten');

do $$
declare
  rec record;
  raw_name text;
  marker integer;
  display_name text;
  meta jsonb;
  rate numeric;
begin
  for rec in select * from merged loop
    select i.item_name, coalesce(rec.wavg_rate, i.unit_price)
      into raw_name, rate
    from public.inventory i
    where i.id = rec.survivor;

    marker := position('|||' in coalesce(raw_name, ''));
    if marker = 0 then
      display_name := btrim(coalesce(raw_name, ''));
      meta := '{}'::jsonb;
    else
      display_name := btrim(substring(raw_name from 1 for marker - 1));
      begin
        meta := btrim(substring(raw_name from marker + 3))::jsonb;
      exception when others then
        meta := '{}'::jsonb;
      end;
    end if;
    if meta is null or jsonb_typeof(meta) <> 'object' then
      meta := '{}'::jsonb;
    end if;

    -- location inside the envelope is left as the survivor stored it
    meta := meta || jsonb_build_object(
      'availableQtyKg', rec.qty,
      'allocatedQtyKg', rec.alloc,
      'unitPrice', rate,
      'lastUpdated', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );

    update public.inventory
    set stock_qty_kg = rec.qty,
        allocated_qty_kg = rec.alloc,
        unit_price = rate,
        last_updated = now(),
        item_name = display_name || ' ||| ' || meta::text
    where id = rec.survivor;
  end loop;
end $$;

delete from public.inventory where id in (select loser from merge_map);

insert into script_report (ord, section, detail)
select 50, 'after',
  i.id || ' | ' || split_part(i.item_name, ' ||| ', 1)
  || ' | qty=' || coalesce(i.stock_qty_kg, 0)
  || ' | alloc=' || coalesce(i.allocated_qty_kg, 0)
  || ' | rate=' || coalesce(i.unit_price, 0)
  || ' | location=' || coalesce(i.location, '')
  || ' | rolls=' || (
    select count(*) from public.inventory_rolls r
    where r.item_id = i.id and coalesce(r.status, '') <> 'Void'
  )
  || ' | void_rolls=' || (
    select count(*) from public.inventory_rolls r
    where r.item_id = i.id and r.status = 'Void'
  )
from public.inventory i
where i.id in ('INVT-0150', 'INVT-0154', 'INVT-0156', 'INVT-0010', 'INVT-0011', 'INVT-0023')
order by i.id;

insert into script_report (ord, section, detail)
select 60, 'after-grn',
  coalesce(g.grn_number, g.id) || ' status=' || coalesce(g.status, '')
  || ' stock=' || coalesce(g.stock_item_id, '')
  || ' master=' || coalesce(g.master_item_id, '')
from public.grns g
where g.id in (select id from cancel_dupes)
   or g.id in (select grn_id from grn_leave_alone)
   or coalesce(g.grn_number, g.id, '') ~ '(^|/)16[67]$'
   or coalesce(g.grn_number, g.id, '') ~ '(^|/)17[01]$'
order by g.grn_number;

insert into script_report (ord, section, detail)
values (
  70,
  'note',
  'Location was not changed. Rate is the weighted average by quantity. Review the rows above, then change ROLLBACK to COMMIT.'
);

select ord, section, detail from script_report order by ord, section, detail;

-- commit;  -- only after review
rollback;
