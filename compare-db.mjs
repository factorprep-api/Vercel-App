import WebSocket from "ws"; global.WebSocket = WebSocket;
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const expectedTables = [
  'clubs', 'teams', 'team_memberships', 'club_memberships', 'athletes',
  'athlete_team_memberships', 'schedule_sessions', 'session_logs',
  'wellness_logs', 'medical_entries', 'exercises', 'programs',
  'program_exercises', 'assignments', 'logbook_entries', 'attendance',
  'history_summaries', 'athlete_maxes', 'help_videos', 'audit_logs'
];

async function compare() {
  console.log("Checking expected tables in live Supabase DB...\n");
  
  for (const table of expectedTables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`❌ Table/View '${table}': ERROR -> ${error.message}`);
    } else {
      const keys = data && data.length > 0 ? Object.keys(data[0]) : '(Table exists, 0 rows or empty)';
      console.log(`✅ Table '${table}': EXISTS -> Columns sample:`, keys);
    }
  }

  console.log("\nChecking Views...");
  const { data: vData, error: vErr } = await supabase.from('athlete_profiles').select('*').limit(1);
  if (vErr) {
    console.log(`❌ View 'athlete_profiles': ERROR -> ${vErr.message}`);
  } else {
    console.log(`✅ View 'athlete_profiles': EXISTS -> Columns:`, vData && vData.length > 0 ? Object.keys(vData[0]) : '(Empty)');
  }
}

compare();
