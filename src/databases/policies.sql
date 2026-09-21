-- =====================================================================
-- RLS Policies — Exercise/Team Management App
-- Version: v1.4.6 (verified 2026-09-20 against live Supabase deployment)
-- Source: pg_policies dump from production
-- =====================================================================

-- assignments
create policy asg_select on public.assignments for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = assignments.athlete_id
                 and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = assignments.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

create policy asg_write on public.assignments for all
  using (
    exists (select 1 from programs p
            where p.id = assignments.program_id
              and p.owner_user_id = auth.uid())
    and (exists (select 1 from athlete_team_memberships m
                 where m.athlete_id = assignments.athlete_id
                   and user_is_team_coach(m.team_id))
      or exists (select 1 from athletes a
                 join club_memberships cm on cm.club_id = a.primary_club_id
                 where a.id = assignments.athlete_id
                   and cm.user_id = auth.uid()
                   and cm.role = 'admin'))
  ) with check (
    exists (select 1 from programs p
            where p.id = assignments.program_id
              and p.owner_user_id = auth.uid())
    and (exists (select 1 from athlete_team_memberships m
                 where m.athlete_id = assignments.athlete_id
                   and user_is_team_coach(m.team_id))
      or exists (select 1 from athletes a
                 join club_memberships cm on cm.club_id = a.primary_club_id
                 where a.id = assignments.athlete_id
                   and cm.user_id = auth.uid()
                   and cm.role = 'admin'))
  );

-- athlete_maxes
create policy max_delete on public.athlete_maxes for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

create policy max_insert on public.athlete_maxes for insert
  with check (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = athlete_maxes.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  );

create policy max_select on public.athlete_maxes for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = athlete_maxes.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = athlete_maxes.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

create policy max_update on public.athlete_maxes for update
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = athlete_maxes.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  ) with check (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = athlete_maxes.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  );

-- athlete_team_memberships
create policy atm_select on public.athlete_team_memberships for select
  using (
    (athlete_id = current_athlete_id())
    or user_is_team_coach(team_id)
    or exists (select 1 from teams t
               where t.id = athlete_team_memberships.team_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

create policy atm_write on public.athlete_team_memberships for all
  using (
    user_is_team_coach(team_id)
    or exists (select 1 from teams t
               where t.id = athlete_team_memberships.team_id
                 and t.club_id in (select get_user_admin_club_ids()))
  ) with check (
    user_is_team_coach(team_id)
    or exists (select 1 from teams t
               where t.id = athlete_team_memberships.team_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

-- athletes
create policy athletes_insert on public.athletes for insert
  with check (
    user_id = auth.uid()
    and primary_club_id is null
    and (role is null or role = 'athlete')
  );

create policy athletes_select on public.athletes for select
  using (
    (user_id = auth.uid())
    or primary_club_id in (select get_user_admin_club_ids())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = athletes.id
                 and (user_is_team_coach(m.team_id)
                   or exists (select 1 from teams t
                              where t.id = m.team_id
                                and t.club_id in (select get_user_admin_club_ids()))))
  );

create policy athletes_write on public.athletes for update
  using (
    (user_id = auth.uid())
    or primary_club_id in (select get_user_admin_club_ids())
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = athletes.id
                 and t.club_id in (select get_user_admin_club_ids()))
  ) with check (
    (user_id = auth.uid())
    or primary_club_id in (select get_user_admin_club_ids())
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = athletes.id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

-- attendance
create policy att_delete on public.attendance for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

create policy att_insert on public.attendance for insert
  with check (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = attendance.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  );

create policy att_select on public.attendance for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = attendance.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = attendance.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

create policy att_update on public.attendance for update
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = attendance.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  ) with check (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = attendance.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  );

-- audit_logs
create policy al_select on public.audit_logs for select
  using (
    (table_name = 'session_logs'
      and exists (select 1 from session_logs sl
                  where sl.id = audit_logs.record_id
                    and (sl.athlete_id = current_athlete_id()
                      or exists (select 1 from athlete_team_memberships m
                                 where m.athlete_id = sl.athlete_id
                                   and m.is_active and user_is_team_coach(m.team_id))
                      or exists (select 1 from teams t
                                 join club_memberships cm on cm.club_id = t.club_id and cm.role = 'admin'
                                 where t.id = sl.team_id
                                   and cm.user_id = auth.uid()))))
    or (table_name = 'schedule_sessions'
      and exists (select 1 from schedule_sessions ss
                  where ss.id = audit_logs.record_id
                    and (user_is_team_coach(ss.team_id)
                      or exists (select 1 from teams t
                                 join club_memberships cm on cm.club_id = t.club_id and cm.role = 'admin'
                                 where t.id = ss.team_id
                                   and cm.user_id = auth.uid()))))
  );

-- club_memberships
create policy cm_select on public.club_memberships for select
  using (
    (user_id = auth.uid())
    or club_id in (select get_user_admin_club_ids())
  );

create policy cm_write on public.club_memberships for all
  using (club_id in (select get_user_admin_club_ids()))
  with check (club_id in (select get_user_admin_club_ids()));

-- clubs
create policy clubs_select on public.clubs for select
  using (
    (id in (select get_user_admin_club_ids()))
    or exists (select 1 from teams t
               where t.club_id = clubs.id
                 and t.id in (select get_user_team_ids()))
  );

create policy clubs_update on public.clubs for update
  using (id in (select get_user_admin_club_ids()))
  with check (id in (select get_user_admin_club_ids()));

-- exercises
create policy ex_delete on public.exercises for delete
  using (owner_user_id = auth.uid());

create policy ex_insert on public.exercises for insert
  with check (owner_user_id = auth.uid() and is_public = false);

create policy ex_select on public.exercises for select
  using (
    is_public
    or owner_user_id = auth.uid()
    or exists (select 1 from program_exercises pe
               where pe.exercise_id = exercises.id
                 and viewer_has_active_assignment(pe.program_id))
  );

create policy ex_write on public.exercises for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- help_videos
create policy hv_select on public.help_videos for select using true;

-- history_summaries
create policy hs_delete on public.history_summaries for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

create policy hs_insert on public.history_summaries for insert
  with check (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = history_summaries.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  );

create policy hs_select on public.history_summaries for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = history_summaries.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = history_summaries.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

create policy hs_update on public.history_summaries for update
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = history_summaries.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  ) with check (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = history_summaries.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  );

-- logbook_entries
create policy lb_delete on public.logbook_entries for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

create policy lb_insert on public.logbook_entries for insert
  with check (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = logbook_entries.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  );

create policy lb_select on public.logbook_entries for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = logbook_entries.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = logbook_entries.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

create policy lb_update on public.logbook_entries for update
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = logbook_entries.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  ) with check (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = logbook_entries.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
  );

-- medical_entries
create policy ml_delete on public.medical_entries for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

create policy ml_insert on public.medical_entries for insert
  with check (athlete_id = current_athlete_id());

create policy ml_select on public.medical_entries for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = medical_entries.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = medical_entries.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

create policy ml_update on public.medical_entries for update
  using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());

-- program_exercises
create policy pe_select on public.program_exercises for select
  using (
    exists (select 1 from programs p
            where p.id = program_exercises.program_id
              and (p.privacy = 'public'
                or p.owner_user_id = auth.uid()
                or viewer_has_active_assignment(p.id)))
  );

create policy pe_write on public.program_exercises for all
  using (
    exists (select 1 from programs p
            where p.id = program_exercises.program_id
              and p.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from programs p
            where p.id = program_exercises.program_id
              and p.owner_user_id = auth.uid())
  );

-- programs
create policy prg_select on public.programs for select
  using (
    privacy = 'public'
    or owner_user_id = auth.uid()
    or viewer_has_active_assignment(id)
  );

create policy prg_write on public.programs for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- schedule_sessions
create policy ss_select on public.schedule_sessions for select
  using (
    user_is_team_coach(team_id)
    or exists (select 1 from teams t
               where t.id = schedule_sessions.team_id
                 and t.club_id in (select get_user_admin_club_ids()))
    or exists (select 1 from athlete_team_memberships m
               where m.team_id = schedule_sessions.team_id
                 and m.athlete_id = current_athlete_id()
                 and m.is_active)
  );

create policy ss_write on public.schedule_sessions for all
  using (user_is_team_coach(team_id))
  with check (user_is_team_coach(team_id));

-- session_logs
create policy sl_delete on public.session_logs for delete
  using (
    (athlete_id = current_athlete_id())
    or (team_id is not null
      and exists (select 1 from teams t
                  where t.id = session_logs.team_id
                    and t.club_id in (select get_user_admin_club_ids())))
  );

create policy sl_insert on public.session_logs for insert
  with check (
    ((athlete_id = current_athlete_id())
      and ((team_id is null)
        or exists (select 1 from athlete_team_memberships atm
                   where atm.athlete_id = session_logs.athlete_id
                     and atm.team_id = session_logs.team_id
                     and atm.is_active)))
    or (team_id is not null and user_is_team_coach(team_id))
  );

create policy sl_select on public.session_logs for select
  using (
    (athlete_id = current_athlete_id())
    or (team_id is not null and user_is_team_coach(team_id))
    or (team_id is not null
      and exists (select 1 from teams t
                  where t.id = session_logs.team_id
                    and t.club_id in (select get_user_admin_club_ids())))
  );

create policy sl_update on public.session_logs for update
  using (
    (athlete_id = current_athlete_id())
    or (team_id is not null and user_is_team_coach(team_id))
  ) with check (
    (athlete_id = current_athlete_id())
    or (team_id is not null and user_is_team_coach(team_id))
  );

-- team_memberships
create policy tm_select on public.team_memberships for select
  using (
    (user_id = auth.uid())
    or user_is_team_coach(team_id)
  );

create policy tm_write on public.team_memberships for all
  using (
    exists (select 1 from teams t
            where t.id = team_memberships.team_id
              and t.club_id in (select get_user_admin_club_ids()))
  ) with check (
    exists (select 1 from teams t
            where t.id = team_memberships.team_id
              and t.club_id in (select get_user_admin_club_ids()))
  );

-- teams
create policy teams_select on public.teams for select
  using (
    (id in (select get_user_team_ids()))
    or club_id in (select get_user_admin_club_ids())
  );

create policy teams_update on public.teams for update
  using (club_id in (select get_user_admin_club_ids()))
  with check (club_id in (select get_user_admin_club_ids()));

-- wellness_logs
create policy wl_delete on public.wellness_logs for delete
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from club_memberships
               where user_id = auth.uid() and role = 'admin')
  );

create policy wl_insert on public.wellness_logs for insert
  with check (athlete_id = current_athlete_id());

create policy wl_select on public.wellness_logs for select
  using (
    (athlete_id = current_athlete_id())
    or exists (select 1 from athlete_team_memberships m
               where m.athlete_id = wellness_logs.athlete_id
                 and m.is_active and user_is_team_coach(m.team_id))
    or exists (select 1 from athlete_team_memberships m
               join teams t on t.id = m.team_id
               where m.athlete_id = wellness_logs.athlete_id
                 and t.club_id in (select get_user_admin_club_ids()))
  );

create policy wl_update on public.wellness_logs for update
  using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());