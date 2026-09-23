import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function runFixes() {
  console.log("Starting ownership fixes...");

  const { data: crusty } = await supabase.from('athletes').select('id, user_id').eq('name', 'Crusty').single();
  
  if (crusty && crusty.user_id) {
    // Update owner of all programs
    const { error: pErr } = await supabase.from('programs').update({ owner_user_id: crusty.user_id }).is('owner_user_id', null);
    console.log("Programs updated:", pErr ? pErr.message : "Success");

    // Update owner of all exercises
    const { error: eErr } = await supabase.from('exercises').update({ owner_user_id: crusty.user_id }).is('owner_user_id', null);
    console.log("Exercises updated:", eErr ? eErr.message : "Success");
  } else {
    console.log("Crusty user_id not found");
  }
}

runFixes().catch(e => console.error("Global Error:", e.message));
