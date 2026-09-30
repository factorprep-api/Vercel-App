import WebSocket from "ws"; global.WebSocket = WebSocket;
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const { error: e1 } = await supabase.from('schedule_sessions').select('attached_program_id').limit(1);
console.log('schedule_sessions.attached_program_id:', e1 ? 'MISSING (' + e1.message + ')' : 'OK');

const { error: e2 } = await supabase.from('assignments').select('source_session_id').limit(1);
console.log('assignments.source_session_id:', e2 ? 'MISSING (' + e2.message + ')' : 'OK');
