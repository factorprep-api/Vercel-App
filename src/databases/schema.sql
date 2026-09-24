-- =====================================================================
-- FactorPrep Schema — v1.4.6 (Updated FINAL 21.09.2026, consolidated)
-- Target: Supabase / PostgreSQL
--
-- RUN THIS FILE FIRST, then policies.sql, then nothing else.
-- Sequence:
--   1. Tables (21, including audit_logs)
--   2. Indexes
--   3. Triggers (immutability, admin-field protection, retagging,
--      fingerprints, audit capture)
--   4. RLS enabled on every table (zero policies until policies.sql)
--
-- Design decisions D1–D14 are documented in the project blueprint.
-- v1.4.6 changes: exercises (formula dropped, metric_type nullable);
-- program_exercises (phase); wellness_logs (numeric sliders);
-- logbook_entries (weight_kg → metric_value); history_summaries
-- (date → timestamptz, 21.09.2026).
-- =====================================================================

-- ---------- CLUB / TEAM STRUCTURE ----------

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'coach' check (role in ('coach')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (team_id, user_id)
);

create table public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);

-- ---------- ATHLETES ----------
-- The PERSON. user_id = their own login (immutable, trigger-enforced).
-- role: NULL or 'athlete' at signup; admins promote to 'coach'
-- (trigger-enforced). primary_club_id: admin-set anchor (trigger-enforced).
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  primary_club_id uuid references public.clubs(id),
  role text check (role in ('athlete', 'coach')),
  created_at timestamptz not null default now()
);

create table public.athlete_team_memberships (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  active_pods text[] not null default array['schedule'],
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (athlete_id, team_id)
);

-- ---------- SESSIONS ----------
-- schedule_sessions: coach proposals only. Athletes never write here.
create table public.schedule_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  date date not null,
  session_type text not null,
  proposed_mins int,
  proposed_rpe int check (proposed_rpe between 1 and 10),
  proposed_load int,
  location text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- session_logs: athlete actuals. team_id nullable (D5: solo athletes).
-- audit_mode/audit_notes (D13): app writes WHY a session was modified;
-- the database records WHAT changed via the audit trigger.
create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.schedule_sessions(id) on delete set null,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  session_type text not null,
  date date not null,
  actual_mins int not null check (actual_mins >= 0),
  actual_rpe int not null check (actual_rpe between 1 and 10),
  actual_load int generated always as (actual_mins * actual_rpe) stored,
  notes text,
  audit_mode text check (audit_mode in ('exact','modified','injury')),
  audit_notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (team_id is not null or session_id is null)
);

-- ---------- WELLNESS & MEDICAL (ATHLETE-OWNED, athlete-entered ONLY) ----------
create table public.wellness_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  date date not null,
  grip_kg numeric,
  feeling numeric check (feeling between 1 and 10),
  soreness numeric check (soreness between 1 and 10),
  sleep numeric check (sleep between 1 and 10),
  nutrition numeric check (nutrition between 1 and 10),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.medical_entries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  date_logged date not null,
  body_part text,
  pain_level int,
  mechanism text,
  training_status text,
  notes text,
  is_resolved boolean not null default false,
  date_resolved date,
  injury_grade text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- PROGRAMS & EXERCISES ----------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  exercise_name text not null,
  video_url text,
  muscle_category text,
  metric_type text check (metric_type is null
                      or metric_type in ('weight','time','distance')),
  is_public boolean not null default false,
  owner_user_id uuid references auth.users(id),
  notes text
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  phase text,
  privacy text not null default 'public' check (privacy in ('public','private')),
  owner_user_id uuid references auth.users(id),
  media_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.program_exercises (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  sort_order int not null default 0,
  sets int,
  reps text,
  intensity_pct numeric,
  tempo text,
  rest text,
  advanced jsonb not null default '{}'::jsonb,
  notes text,
  phase text check (phase in ('Warm Up','Work Block','Cool Down'))
);

-- ---------- TRAINING DATA (SOFT-DELETE) ----------
-- maxes / logbook / attendance / history: athletes self-insert;
-- coaches may insert AND update for their active-team athletes (D8).
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  expires_at date,
  status text not null default 'active' check (status in ('active','expired','archived')),
  deleted_at timestamptz
);

create table public.logbook_entries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  date date not null,
  program_id uuid references public.programs(id) on delete set null,
  exercise_id uuid not null references public.exercises(id),
  intensity_pct numeric,
  metric_value numeric,
  reps int,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  attended_at timestamptz not null,
  program_id uuid references public.programs(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.history_summaries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  date timestamp with time zone not null,
  program_id uuid references public.programs(id) on delete set null,
  workout_summary text,
  pr_updates text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.athlete_maxes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  date date not null,
  exercise_id uuid not null references public.exercises(id),
  one_rm_kg numeric not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.help_videos (
  id uuid primary key default gen_random_uuid(),
  page_name text not null,
  video_url text not null
);

-- ---------- AUDIT LOG (D13, generic + trigger-written) ----------
-- Machine-written by trg_audit_* triggers (SECURITY DEFINER, bypasses
-- RLS). Append-only: no UPDATE/DELETE policies will ever exist.
-- Clients can only SELECT (see policies.sql).
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('session_logs','schedule_sessions')),
  record_id uuid not null,
  changed_by uuid not null,
  old_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- INDEXES ----------

-- Structure tier
create index idx_teams_club_id       on public.teams(club_id);
create index idx_tm_user_team        on public.team_memberships(user_id, team_id);
create index idx_cm_user_club        on public.club_memberships(user_id, club_id);
create index idx_cm_user_admin       on public.club_memberships(user_id, role) where role = 'admin';
create index idx_atm_athlete         on public.athlete_team_memberships(athlete_id);
create index idx_atm_team            on public.athlete_team_memberships(team_id);
create index idx_atm_lookup          on public.athlete_team_memberships(athlete_id, team_id, is_active);
create index idx_athletes_user_id    on public.athletes(user_id);
create index idx_athletes_role       on public.athletes(role);

-- Session tier
create index idx_ss_team_date        on public.schedule_sessions(team_id, date);
create index idx_sl_session          on public.session_logs(session_id);
create index idx_sl_athlete_date     on public.session_logs(athlete_id, date);
create index idx_sl_athlete_team     on public.session_logs(athlete_id, team_id);

-- Athlete-data tier
create index idx_wl_athlete_date     on public.wellness_logs(athlete_id, date);
create index idx_me_athlete_date     on public.medical_entries(athlete_id, date_logged);
create index idx_lb_athlete_date     on public.logbook_entries(athlete_id, date);
create index idx_att_athlete_ts      on public.attendance(athlete_id, attended_at);
create index idx_hs_athlete_date     on public.history_summaries(athlete_id, date);
create index idx_max_athlete_ex_date on public.athlete_maxes(athlete_id, exercise_id, date);

-- Assignment / library / audit tier
create index idx_asg_athlete         on public.assignments(athlete_id);
create index idx_pe_program          on public.program_exercises(program_id);
create index idx_ex_owner            on public.exercises(owner_user_id);
create index idx_prg_owner           on public.programs(owner_user_id);
create index idx_audit_record        on public.audit_logs(table_name, record_id);

-- ---------- TRIGGERS ----------

-- (1) athletes.user_id is absolutely immutable — even admins cannot
--     reassign identity.
create or replace function public.prevent_athlete_user_id_change()
returns trigger language plpgsql as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'athletes.user_id is immutable.';
  end if;
  return new;
end;
$$;

create trigger trg_protect_athlete_user_id
before update on public.athletes
for each row execute function public.prevent_athlete_user_id_change();

-- (2) athletes.role and athletes.primary_club_id are admin-controlled.
--     Athletes updating their own name pass through untouched
--     (columns unchanged -> early return).
create or replace function public.protect_athlete_admin_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role
     or new.primary_club_id is distinct from old.primary_club_id then
    if not exists (
      select 1 from public.club_memberships
      where user_id = (select auth.uid()) and role = 'admin'
    ) then
      raise exception 'role and primary_club_id are admin-controlled fields.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_protect_athlete_admin_fields
before update on public.athletes
for each row execute function public.protect_athlete_admin_fields();

-- (3) session_logs.team_id may not be retagged to a team the actor
--     doesn't coach or administer (D12). De-teaming (NULL) is allowed.
create or replace function public.protect_session_log_retagging()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.team_id is distinct from old.team_id then
    if new.team_id is null then
      return new;
    end if;
    if exists (select 1 from public.team_memberships
               where user_id = (select auth.uid()) and team_id = new.team_id)
       or exists (select 1 from public.teams t
                  join public.club_memberships cm
                    on cm.club_id = t.club_id and cm.role = 'admin'
                  where t.id = new.team_id
                    and cm.user_id = (select auth.uid()))
    then
      return new;
    end if;
    raise exception 'session_logs.team_id can only be changed by a coach or admin.';
  end if;
  return new;
end;
$$;

create trigger trg_protect_session_log_team
before update on public.session_logs
for each row execute function public.protect_session_log_retagging();

-- (4) Record fingerprints (D14): athlete_id and created_at are immutable
--     on all athlete-data tables. Blocks backdating and re-attribution
--     in every policy branch, including the coach branch.
create or replace function public.protect_record_fingerprint()
returns trigger language plpgsql as $$
begin
  if new.athlete_id is distinct from old.athlete_id then
    raise exception '%.athlete_id is immutable.', tg_table_name;
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception '%.created_at is immutable.', tg_table_name;
  end if;
  return new;
end;
$$;

create trigger trg_fp_session_logs      before update on public.session_logs       for each row execute function public.protect_record_fingerprint();
create trigger trg_fp_wellness_logs    before update on public.wellness_logs      for each row execute function public.protect_record_fingerprint();
create trigger trg_fp_medical_entries  before update on public.medical_entries    for each row execute function public.protect_record_fingerprint();
create trigger trg_fp_logbook_entries  before update on public.logbook_entries    for each row execute function public.protect_record_fingerprint();
create trigger trg_fp_attendance       before update on public.attendance         for each row execute function public.protect_record_fingerprint();
create trigger trg_fp_history_summaries before update on public.history_summaries for each row execute function public.protect_record_fingerprint();
create trigger trg_fp_athlete_maxes    before update on public.athlete_maxes     for each row execute function public.protect_record_fingerprint();

-- (5) Audit capture (D13): every UPDATE to session_logs and
--     schedule_sessions automatically writes an audit row with full
--     old/new row images. Machine-written; app cannot suppress it.
create or replace function public.write_audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (table_name, record_id, changed_by, old_data, new_data)
  values (tg_table_name, new.id, (select auth.uid()), to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;

create trigger trg_audit_session_logs
after update on public.session_logs
for each row execute function public.write_audit_row();

create trigger trg_audit_schedule_sessions
after update on public.schedule_sessions
for each row execute function public.write_audit_row();

-- ---------- ENABLE RLS ON EVERY TABLE (LOCKDOWN) ----------
alter table public.clubs                    enable row level security;
alter table public.teams                    enable row level security;
alter table public.team_memberships         enable row level security;
alter table public.club_memberships         enable row level security;
alter table public.athletes                 enable row level security;
alter table public.athlete_team_memberships enable row level security;
alter table public.schedule_sessions        enable row level security;
alter table public.session_logs             enable row level security;
alter table public.wellness_logs            enable row level security;
alter table public.medical_entries          enable row level security;
alter table public.programs                 enable row level security;
alter table public.assignments             enable row level security;
alter table public.logbook_entries          enable row level security;
alter table public.attendance               enable row level security;
alter table public.history_summaries       enable row level security;
alter table public.athlete_maxes            enable row level security;
alter table public.exercises                enable row level security;
alter table public.program_exercises        enable row level security;
alter table public.help_videos              enable row level security;
alter table public.audit_logs               enable row level security;

-- ---------- VIEWS ----------
-- athlete_profiles: Securely exposes athlete information alongside their auth email
create or replace view public.athlete_profiles as
select 
  a.id,
  a.name,
  a.role,
  a.primary_club_id,
  u.email
from public.athletes a
join auth.users u on a.user_id = u.id;

grant select on public.athlete_profiles to anon, authenticated;