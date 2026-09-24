import WebSocket from "ws"; global.WebSocket = WebSocket;
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const tables = [
  'clubs', 'teams', 'team_memberships', 'club_memberships', 'athletes',
  'athlete_team_memberships', 'schedule_sessions', 'session_logs',
  'wellness_logs', 'medical_entries', 'exercises', 'programs',
  'program_exercises', 'assignments', 'logbook_entries', 'attendance',
  'history_summaries', 'athlete_maxes', 'help_videos', 'audit_logs', 'athlete_profiles'
];

async function run() {
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (data && data.length > 0) {
      console.log(`[${t}] ->`, Object.keys(data[0]).join(', '));
    } else if (error) {
      console.log(`[${t}] -> ERROR:`, error.message);
    } else {
      console.log(`[${t}] -> (0 rows)`);
    }
  }
}
run();
