import WebSocket from "ws"; global.WebSocket = WebSocket;
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const schema = {
  clubs: ['id', 'name', 'created_at'],
  teams: ['id', 'club_id', 'name', 'created_at'],
  team_memberships: ['id', 'team_id', 'user_id', 'role', 'joined_at', 'left_at'],
  club_memberships: ['id', 'club_id', 'user_id', 'role', 'created_at'],
  athletes: ['id', 'user_id', 'name', 'primary_club_id', 'role', 'created_at'],
  athlete_team_memberships: ['id', 'athlete_id', 'team_id', 'active_pods', 'is_active', 'joined_at', 'left_at'],
  schedule_sessions: ['id', 'team_id', 'date', 'session_type', 'proposed_mins', 'proposed_rpe', 'proposed_load', 'location', 'created_by', 'created_at'],
  session_logs: ['id', 'session_id', 'athlete_id', 'team_id', 'session_type', 'date', 'actual_mins', 'actual_rpe', 'actual_load', 'notes', 'audit_mode', 'audit_notes', 'deleted_at', 'created_at'],
  wellness_logs: ['id', 'athlete_id', 'date', 'grip_kg', 'feeling', 'soreness', 'sleep', 'nutrition', 'deleted_at', 'created_at'],
  medical_entries: ['id', 'athlete_id', 'date_logged', 'body_part', 'pain_level', 'mechanism', 'training_status', 'notes', 'is_resolved', 'date_resolved', 'injury_grade', 'deleted_at', 'created_at'],
  exercises: ['id', 'name', 'video_url', 'muscle_category', 'metric_type', 'is_public', 'owner_user_id', 'notes'],
  programs: ['id', 'name', 'category', 'phase', 'privacy', 'owner_user_id', 'media_url', 'notes', 'created_at'],
  program_exercises: ['id', 'program_id', 'exercise_id', 'sort_order', 'sets', 'reps', 'intensity_pct', 'tempo', 'rest', 'advanced', 'notes', 'phase'],
  assignments: ['id', 'athlete_id', 'program_id', 'assigned_by', 'assigned_at', 'expires_at', 'status', 'deleted_at'],
  logbook_entries: ['id', 'athlete_id', 'date', 'program_id', 'exercise_id', 'intensity_pct', 'metric_value', 'reps', 'deleted_at', 'created_at'],
  attendance: ['id', 'athlete_id', 'attended_at', 'program_id', 'deleted_at', 'created_at'],
  history_summaries: ['id', 'athlete_id', 'date', 'program_id', 'workout_summary', 'pr_updates', 'deleted_at', 'created_at'],
  athlete_maxes: ['id', 'athlete_id', 'date', 'exercise_id', 'one_rm_kg', 'deleted_at', 'created_at'],
  help_videos: ['id', 'page_name', 'video_url'],
  audit_logs: ['id', 'table_name', 'record_id', 'changed_by', 'old_data', 'new_data', 'created_at']
};

async function checkSchema() {
  console.log("=== COMPARING SCHEMA.SQL COLUMNS WITH LIVE DB ===\n");
  for (const [table, cols] of Object.entries(schema)) {
    const missing = [];
    for (const col of cols) {
      const { error } = await supabase.from(table).select(col).limit(1);
      if (error && error.message.includes("does not exist")) {
        missing.push(col);
      }
    }
    if (missing.length > 0) {
      console.log(`❌ [${table}]: Column(s) in schema.sql but MISSING in DB ->`, missing);
    } else {
      console.log(`✅ [${table}]: All ${cols.length} columns from schema.sql match DB.`);
    }
  }
}

checkSchema();
