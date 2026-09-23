import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const [progRes, exRes] = await Promise.all([
    supabase.from('programs').select('name, users!owner_user_id(email)').limit(1),
    supabase.from('exercises').select('name, users!owner_user_id(email)').limit(1)
  ]);
  console.log('Programs Error:', progRes.error);
  console.log('Exercises Error:', exRes.error);
}
test()
