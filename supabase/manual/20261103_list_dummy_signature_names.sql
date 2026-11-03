-- List rows that still store the old dummy signature names.
-- NOT a migration. This file is not in supabase/migrations and does not run
-- on deploy. It does not rewrite any business row.
--
-- Names: Virendra Singh, Rajesh Sharma, Dilip Joshi (including
-- "Store Mgr Dilip Joshi"), and the sample "Plant Manager (Ramesh Kumar)".
-- A hit on public.users or public.employees is a directory row. Leave it.
-- Review the SELECT, then ROLLBACK. Nothing in this script is committed.
--
-- Rehearse on the test project before pointing it at production.

begin;

drop table if exists dummy_person_hits;
create temp table dummy_person_hits (
  table_name text not null,
  column_name text not null,
  row_id text not null,
  excerpt text not null
);

do $scan$
declare
  rec record;
  has_id boolean;
  id_expr text;
  pattern constant text := '(virendra[[:space:]]+singh|rajesh[[:space:]]+sharma|dilip[[:space:]]+joshi|plant[[:space:]]+manager[[:space:]]*\([[:space:]]*ramesh[[:space:]]+kumar[[:space:]]*\))';
begin
  for rec in
    select c.table_schema, c.table_name, c.column_name
    from information_schema.columns as c
    join information_schema.tables as t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.data_type in ('text', 'character varying', 'json', 'jsonb')
    order by c.table_name, c.column_name
  loop
    select exists (
      select 1
      from information_schema.columns as idcol
      where idcol.table_schema = rec.table_schema
        and idcol.table_name = rec.table_name
        and idcol.column_name = 'id'
    ) into has_id;

    id_expr := case when has_id then 'id::text' else 'ctid::text' end;

    execute format(
      'insert into dummy_person_hits (table_name, column_name, row_id, excerpt)
       select %L, %L, left(coalesce(%s, ''''), 120), left(coalesce(%I::text, ''''), 240)
       from %I.%I
       where coalesce(%I::text, '''') ~* %L',
      rec.table_name,
      rec.column_name,
      id_expr,
      rec.column_name,
      rec.table_schema,
      rec.table_name,
      rec.column_name,
      pattern
    );
  end loop;
end
$scan$;

select table_name, column_name, count(*) as hits
from dummy_person_hits
group by table_name, column_name
order by table_name, column_name;

select table_name, column_name, row_id, excerpt
from dummy_person_hits
order by table_name, column_name, row_id;

rollback;
