import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { data, error } = await supabase.from('athletes').select('id, name, athlete_team_memberships(team_id, active_pods)').eq('name', 'Crusty');
  console.log('Crusty:', JSON.stringify(data, null, 2));
  console.log('Error:', error);
}
test()
