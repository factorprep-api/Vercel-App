-- ============================================================================
-- FactorPrep v1.13.0 — SHOP PROGRAM BUNDLES + GUIDANCE CARDS MIGRATION
-- Paste into Supabase SQL Editor. Run ONCE, top to bottom. Idempotent.
-- ============================================================================
-- (1) valid_athlete_guidance(): shape + limits for the guidance jsonb.
-- (2) shop_product_programs: one product bundles many ordered programs
--     (any count, any names — Dale supplies naming at authoring time).
-- (3) shop_products.athlete_guidance: ONE sheet per bundle — dos / donts /
--     red_flags / note, all optional. Never per program, never inherited.
-- (4) shop_products.archived_at: archive-instead-of-delete for products
--     with entitlements; archived = hidden from shop + bundle building,
--     existing buyers keep access.
-- (5) viewer_has_program_entitlement: + bundle-membership OR branch, so a
--     purchased bundle lights up every program in it. No webhook change.
-- (6) program_guidance_sheets(): entitlement-gated per-program guidance.
--     Resolution: most recently purchased owned product wins (ties: earliest
--     purchased_at); ALL owned sheets are returned for the disclosure.
-- (7) program_live_product_count(): powers the edit warning in the builder.
-- ============================================================================

-- ---------------------------------------------------------------- (1) shape
create or replace function public.valid_athlete_guidance(g jsonb)
returns boolean
language plpgsql
immutable
as $function$
declare
  section_key text;
  section jsonb;
  bullet jsonb;
begin
  if g is null then return true; end if;
  if jsonb_typeof(g) is distinct from 'object' then return false; end if;
  if exists (
    select 1 from jsonb_object_keys(g) k
    where k not in ('dos', 'donts', 'red_flags', 'note')
  ) then return false; end if;
  foreach section_key in array array['dos', 'donts', 'red_flags'] loop
    section := g -> section_key;
    if section is null then continue; end if;
    if jsonb_typeof(section) is distinct from 'array' then return false; end if;
    if jsonb_array_length(section) > 20 then return false; end if;
    for bullet in select * from jsonb_array_elements(section) loop
      if jsonb_typeof(bullet) is distinct from 'string' then return false; end if;
      if length(bullet #>> '{}') > 300 then return false; end if;
    end loop;
  end loop;
  if g ? 'note' and g -> 'note' is not null then
    if jsonb_typeof(g -> 'note') is distinct from 'string' then return false; end if;
    if length(g ->> 'note') > 2000 then return false; end if;
  end if;
  return true;
end;
$function$;

-- --------------------------------------------------- (2) junction table
create table if not exists public.shop_product_programs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  sort_order int not null default 0,
  stage_label text,   -- display only; never used to infer progression
  advance_criteria text, -- blank default; next-program card renders it only when populated
  unique (product_id, program_id)
);

-- --------------------------------- (3) guidance + archive on shop_products
alter table public.shop_products
  add column if not exists athlete_guidance jsonb;
alter table public.shop_products
  add column if not exists archived_at timestamptz;

-- Re-create the shape check idempotently (drop by name, re-add).
alter table public.shop_products drop constraint if exists sp_athlete_guidance_check;
alter table public.shop_products
  add constraint sp_athlete_guidance_check
  check (athlete_guidance is null or public.valid_athlete_guidance(athlete_guidance));

-- ------------------------------------------------------- (4) junction RLS
alter table public.shop_product_programs enable row level security;
drop policy if exists spp_admin_all on public.shop_product_programs;
create policy spp_admin_all on public.shop_product_programs
  for all
  using (public.is_shop_admin())
  with check (public.is_shop_admin());

-- --------------------------------------------------- (5) RLS visibility
-- One OR branch covers every program in every purchased bundle.
create or replace function public.viewer_has_program_entitlement(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from user_entitlements e
    join athletes a on a.id = e.athlete_id
    join shop_products sp on sp.id = e.product_id
    left join shop_product_programs spp on spp.product_id = sp.id
    where a.user_id = auth.uid()
      and e.status in ('active', 'lifetime')
      and (sp.linked_program_id = p_program_id or spp.program_id = p_program_id)
  );
$function$;

-- ------------------------------------------------- (6) guidance RPC
create or replace function public.program_guidance_sheets(p_program_name text)
returns table (
  product_id uuid,
  product_name text,
  purchased_at timestamptz,
  position_in_bundle int,
  bundle_program_count int,
  advance_criteria text,
  next_program_id uuid,
  next_program_name text,
  next_advance_criteria text,
  athlete_guidance jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- v1.13.0: guidance sheets for one program, entitlement-gated. The client
  -- resolves deterministically: the RESOLVED sheet is the most recently
  -- purchased owned product (ties broken by the earliest purchased_at);
  -- every other owned sheet is returned too, for the collapsed
  -- "Also applies to you" disclosure. Bundle context (position / next
  -- program) only exists for junction memberships — legacy
  -- linked_program_id products return a bare sheet.
  with owned as (
    select e.product_id, e.purchased_at
    from user_entitlements e
    join athletes a on a.id = e.athlete_id
    where a.user_id = auth.uid()
      and e.status in ('active', 'lifetime')
  ),
  program_ids as (
    select id from programs where name = p_program_name
  ),
  ordered as (
    select spp.product_id, spp.program_id, spp.sort_order, spp.advance_criteria,
           row_number() over (partition by spp.product_id order by spp.sort_order asc, pg.name asc) as pos,
           count(*) over (partition by spp.product_id) as bundle_count
    from shop_product_programs spp
    join programs pg on pg.id = spp.program_id
    join program_ids pi on pi.id = spp.program_id
  ),
  pairs as (
    select a.product_id, a.program_id as this_program, a.pos, a.bundle_count,
           a.advance_criteria, b.program_id as next_program_id,
           b.advance_criteria as next_advance_criteria
    from ordered a
    left join ordered b on b.product_id = a.product_id and b.pos = a.pos + 1
  )
  select distinct
         sp.id as product_id, sp.name as product_name, o.purchased_at,
         pr.pos::int as position_in_bundle, pr.bundle_count::int as bundle_program_count,
         pr.advance_criteria, pr.next_program_id,
         (select name from programs where id = pr.next_program_id) as next_program_name,
         pr.next_advance_criteria,
         sp.athlete_guidance
  from pairs pr
  join shop_products sp on sp.id = pr.product_id
  join owned o on o.product_id = sp.id
  where pr.this_program in (select id from program_ids)
  union all
  select distinct
         sp.id as product_id, sp.name as product_name, o.purchased_at,
         null::int as position_in_bundle, null::int as bundle_program_count,
         null::text as advance_criteria, null::uuid as next_program_id,
         null::text as next_program_name, null::text as next_advance_criteria,
         sp.athlete_guidance
  from shop_products sp
  join owned o on o.product_id = sp.id
  where sp.linked_program_id in (select id from program_ids)
    and not exists (
      select 1 from shop_product_programs x
      where x.product_id = sp.id and x.program_id in (select id from program_ids)
    );
$function$;

-- ------------------------------------------------- (7) edit-warning count
create or replace function public.program_live_product_count(p_program_name text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select count(distinct e.product_id)::int
  from user_entitlements e
  where e.status in ('active', 'lifetime')
    and e.product_id in (
      select sp.id from shop_products sp
      join programs p on p.id = sp.linked_program_id
      where p.name = p_program_name
      union
      select spp.product_id from shop_product_programs spp
      join programs p on p.id = spp.program_id
      where p.name = p_program_name
    );
$function$;
