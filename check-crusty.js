import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { data, error } = await supabase.from('athletes').select('name, role, primary_club_id, users!inner(email)').ilike('name', 'Crusty');
  console.log('Athletes row:', data, error);
}
test()
