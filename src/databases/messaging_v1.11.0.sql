-- =====================================================================
-- Messaging v1.11.0 — Coach/staff ↔ athlete messages ("Messages" header icon)
-- =====================================================================
-- Design: threads are strictly 1 athlete ↔ 1 staff member. A staff member
-- is any coach-role user connected to the athlete (athletes.coach_user_id
-- OR a coach on one of the athlete's active teams — the same org-scoping
-- predicate the Medical/Treatment pods use). "Send to all athletes" fans
-- out one thread per athlete sharing a broadcast_group id; athlete replies
-- stay private to the sending staff member. Read receipts via
-- message_reads. All writes go through security-definer RPCs; RLS gates
-- reads. Run in the Supabase SQL editor.
-- =====================================================================

-- ---------- TABLES ----------

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  broadcast_group uuid,
  staff_name text not null default '',    -- snapshot at send time
  athlete_name text not null default '',  -- snapshot at send time
  message_count int not null default 0,   -- maintained by trigger
  last_message_at timestamptz,            -- maintained by trigger
  last_message_sender_id uuid,            -- maintained by trigger
  created_at timestamptz not null default now()
);

create table public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.message_reads (
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index idx_threads_staff     on public.message_threads(staff_id, last_message_at desc);
create index idx_threads_athlete   on public.message_threads(athlete_id, last_message_at desc);
create index idx_threads_group     on public.message_threads(broadcast_group);
create index idx_thread_msg_thread on public.thread_messages(thread_id, created_at);

-- ---------- HELPER FUNCTIONS ----------
-- All security definer + empty search_path, mirroring functions.sql style.
-- staff_can_see_athlete(): the shared org predicate — the athlete's
-- coach_user_id OR an active team coach of one of the athlete's active teams.

create or replace function public.staff_can_see_athlete(p_staff uuid, p_athlete_id uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (
        a.coach_user_id = p_staff
        or exists (
          select 1
          from public.athlete_team_memberships atm
          join public.team_memberships tm on tm.team_id = atm.team_id
          where atm.athlete_id = a.id
            and atm.is_active
            and tm.user_id = p_staff
            and tm.left_at is null
        )
      )
  );
$function$;

-- Staff user ids the signed-in athlete may message (their own coach +
-- every active team coach of their active teams; self excluded).
create or replace function public.athlete_visible_staff()
returns table (staff_id uuid, staff_name text)
language sql stable security definer
set search_path to ''
as $function$
  select a.coach_user_id, s.name
  from public.athletes a
  join public.athletes s on s.user_id = a.coach_user_id
  where a.user_id = (select auth.uid())
    and a.coach_user_id is not null
    and a.coach_user_id <> (select auth.uid())
  union
  select tm.user_id, s2.name
  from public.athletes a
  join public.athlete_team_memberships atm on atm.athlete_id = a.id and atm.is_active
  join public.team_memberships tm on tm.team_id = atm.team_id
  join public.athletes s2 on s2.user_id = tm.user_id
  where a.user_id = (select auth.uid())
    and tm.user_id <> (select auth.uid())
$function$;

-- Roster for the staff compose picker: athletes the signed-in staff
-- member is connected to.
create or replace function public.messaging_roster()
returns table (athlete_id uuid, athlete_name text, is_own_coach boolean)
language sql stable security definer
set search_path to ''
as $function$
  select a.id, a.name, (a.coach_user_id = (select auth.uid())) as is_own_coach
  from public.athletes a
  where public.staff_can_see_athlete((select auth.uid()), a.id)
  order by a.name asc
$function$;

-- Thread participant check (auth.uid() is the thread's staff OR athlete).
create or replace function public.is_thread_participant(p_thread_id uuid)
returns boolean
language sql stable security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.message_threads t
    where t.id = p_thread_id
      and (
        t.staff_id = (select auth.uid())
        or t.athlete_id = (select public.current_athlete_id())
      )
  );
$function$;

-- ========== RPCs (all writes) ==========

-- Staff: message one athlete (creates the thread + first message).
create or replace function public.staff_send_message(p_athlete_id uuid, p_body text)
returns uuid
language plpgsql security definer
set search_path to ''
as $function$
declare
  v_sender  uuid := (select auth.uid());
  v_body    text := btrim(p_body);
  v_thread  uuid;
  v_staff_name    text;
  v_athlete_name  text;
begin
  if v_sender is null then raise exception 'Not signed in.'; end if;
  if v_body is null or v_body = '' or length(v_body) > 4000 then
    raise exception 'Message must be between 1 and 4000 characters.';
  end if;
  if not public.staff_can_see_athlete(v_sender, p_athlete_id) then
    raise exception 'That athlete is not on your roster.';
  end if;

  select s.name into v_staff_name from public.athletes s where s.user_id = v_sender;
  select a.name into v_athlete_name from public.athletes a where a.id = p_athlete_id;

  insert into public.message_threads (staff_id, athlete_id, staff_name, athlete_name)
  values (v_sender, p_athlete_id, coalesce(v_staff_name, ''), coalesce(v_athlete_name, ''))
  returning id into v_thread;

  insert into public.thread_messages (thread_id, sender_id, body)
  values (v_thread, v_sender, v_body);

  return v_thread;
end;
$function$;

-- Staff: fan out one broadcast to every connected athlete (one shared
-- broadcast_group). Returns the number of threads created.
create or replace function public.staff_broadcast(p_body text)
returns int
language plpgsql security definer
set search_path to ''
as $function$
declare
  v_sender  uuid := (select auth.uid());
  v_body    text := btrim(p_body);
  v_group   uuid := gen_random_uuid();
  v_count   int := 0;
  v_thread  uuid;
  v_staff_name text;
  v_target  record;
begin
  if v_sender is null then raise exception 'Not signed in.'; end if;
  if v_body is null or v_body = '' or length(v_body) > 4000 then
    raise exception 'Message must be between 1 and 4000 characters.';
  end if;
  select s.name into v_staff_name from public.athletes s where s.user_id = v_sender;

  for v_target in
    select a.id, a.name
    from public.athletes a
    where public.staff_can_see_athlete(v_sender, a.id)
  loop
    insert into public.message_threads (staff_id, athlete_id, broadcast_group, staff_name, athlete_name)
    values (v_sender, v_target.id, v_group, coalesce(v_staff_name, ''), coalesce(v_target.name, ''))
    returning id into v_thread;
    insert into public.thread_messages (thread_id, sender_id, body)
    values (v_thread, v_sender, v_body);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

-- Staff: send the same body to a specific subset (multi-select picker).
create or replace function public.staff_send_messages(p_athlete_ids uuid[], p_body text)
returns int
language plpgsql security definer
set search_path to ''
as $function$
declare
  v_count int := 0;
begin
  if p_athlete_ids is null or array_length(p_athlete_ids, 1) is null then
    raise exception 'No recipients selected.';
  end if;
  for i in 1 .. array_length(p_athlete_ids, 1) loop
    if public.staff_send_message(p_athlete_ids[i], p_body) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;

-- Athlete: start (or continue) a thread with a connected staff member.
create or replace function public.athlete_send_message(p_staff_id uuid, p_body text)
returns uuid
language plpgsql security definer
set search_path to ''
as $function$
declare
  v_sender   uuid := (select auth.uid());
  v_athlete  uuid;
  v_body     text := btrim(p_body);
  v_thread   uuid;
  v_staff_name  text;
  v_athlete_name text;
begin
  if v_sender is null then raise exception 'Not signed in.'; end if;
  v_athlete := (select public.current_athlete_id());
  if v_athlete is null then raise exception 'No athlete record for this account.'; end if;
  if v_body is null or v_body = '' or length(v_body) > 4000 then
    raise exception 'Message must be between 1 and 4000 characters.';
  end if;
  if not exists (select 1 from public.athlete_visible_staff() vs where vs.staff_id = p_staff_id) then
    raise exception 'That staff member is not connected to you.';
  end if;

  select t.id into v_thread
  from public.message_threads t
  where t.staff_id = p_staff_id and t.athlete_id = v_athlete
  order by t.created_at asc
  limit 1;

  if v_thread is null then
    select s.name into v_staff_name from public.athletes s where s.user_id = p_staff_id;
    select a.name into v_athlete_name from public.athletes a where a.id = v_athlete;
    insert into public.message_threads (staff_id, athlete_id, staff_name, athlete_name)
    values (p_staff_id, v_athlete, coalesce(v_staff_name, ''), coalesce(v_athlete_name, ''))
    returning id into v_thread;
  end if;

  insert into public.thread_messages (thread_id, sender_id, body)
  values (v_thread, v_sender, v_body);

  return v_thread;
end;
$function$;

-- Read receipt (either participant marks a thread read).
create or replace function public.mark_thread_read(p_thread_id uuid)
returns void
language plpgsql security definer
set search_path to ''
as $function$
begin
  if not public.is_thread_participant(p_thread_id) then
    raise exception 'Not a participant in this thread.';
  end if;
  insert into public.message_reads (thread_id, user_id, last_read_at)
  values (p_thread_id, (select auth.uid()), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
end;
$function$;

-- ---------- TRIGGER (thread counters) ----------

create or replace function public.touch_message_thread()
returns trigger
language plpgsql security definer
set search_path to ''
as $function$
begin
  update public.message_threads
  set last_message_at = new.created_at,
      last_message_sender_id = new.sender_id,
      message_count = message_count + 1
  where id = new.thread_id;
  return new;
end;
$function$;

create trigger thread_messages_touch
after insert on public.thread_messages
for each row execute function public.touch_message_thread();

-- ========== RLS ==========

alter table public.message_threads enable row level security;
alter table public.thread_messages  enable row level security;
alter table public.message_reads   enable row level security;

-- message_threads: reads are participant-scoped.
create policy msg_thread_select_staff on public.message_threads for select
  using (
    staff_id = (select auth.uid())
    and public.staff_can_see_athlete((select auth.uid()), athlete_id)
  );

create policy msg_thread_select_athlete on public.message_threads for select
  using (
    athlete_id = (select public.current_athlete_id())
    and exists (select 1 from public.athlete_visible_staff() vs
                where vs.staff_id = message_threads.staff_id)
  );

-- Direct staff insert is allowed (the UI uses staff_send_message, but the
-- policy keeps the table honest without the RPC).
create policy msg_thread_insert_staff on public.message_threads for insert
  with check (
    staff_id = (select auth.uid())
    and public.staff_can_see_athlete((select auth.uid()), athlete_id)
  );

create policy msg_thread_delete_staff on public.message_threads for delete
  using (staff_id = (select auth.uid()));

-- thread_messages: reads and replies are participant-scoped.
create policy tmsg_select on public.thread_messages for select
  using (public.is_thread_participant(thread_id));

create policy tmsg_insert on public.thread_messages for insert
  with check (
    sender_id = (select auth.uid())
    and public.is_thread_participant(thread_id)
  );

-- message_reads: a user sees only their own receipts (writes via RPC).
create policy reads_select_own on public.message_reads for select
  using (user_id = (select auth.uid()));

