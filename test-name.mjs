import WebSocket from "ws"; global.WebSocket = WebSocket;
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const res1 = await supabase.from('exercises').select('name').limit(1);
  console.log("select name ->", res1.error ? res1.error.message : res1.data);
  const res2 = await supabase.from('exercises').select('exercise_name').limit(1);
  console.log("select exercise_name ->", res2.error ? res2.error.message : res2.data);
}
run();
