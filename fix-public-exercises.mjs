import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  console.log("Fetching library from GAS to get correct ownership...");
  const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";
  const res = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLibrary&t=${Date.now()}`);
  const json = await res.json();
  const rawLibrary = json.library || [];
  
  const ownerMap = new Map();
  for (let i = 1; i < rawLibrary.length; i++) {
    const row = rawLibrary[i];
    const name = String(row[0] || '').trim().toLowerCase();
    const ownerEmail = String(row[5] || '').trim().toLowerCase();
    if (name) {
      ownerMap.set(name, ownerEmail);
    }
  }

  // Get all users so we can map email to user_id
  const { data: athletes } = await supabase.from('athlete_profiles').select('id, email');
  const emailToUserId = new Map();
  (athletes || []).forEach(a => {
    if (a.email) emailToUserId.set(a.email.toLowerCase(), a.id); // Note: a.id in athlete_profiles is athlete.id, wait, we need user_id!
  });
  
  // Let's get user_id properly
  const { data: authUsers } = await supabase.from('athletes').select('user_id, users!inner(email)');
  const authEmailToUserId = new Map();
  (authUsers || []).forEach(a => {
     if (a.users && a.users.email) {
       authEmailToUserId.set(a.users.email.toLowerCase(), a.user_id);
     }
  });

  console.log("Fetching DB exercises...");
  const { data: dbExercises } = await supabase.from('exercises').select('id, name');
  
  let publicUpdates = [];
  let privateUpdates = [];
  
  for (const ex of dbExercises) {
    const nameKey = ex.name.toLowerCase();
    const sheetOwnerEmail = ownerMap.get(nameKey);
    
    if (!sheetOwnerEmail) {
      // It's a public exercise (no owner email in sheet)
      publicUpdates.push(ex.id);
    } else {
      // It's a private exercise owned by a specific coach
      const ownerUserId = authEmailToUserId.get(sheetOwnerEmail);
      if (ownerUserId) {
        privateUpdates.push({ id: ex.id, owner_user_id: ownerUserId, is_public: false });
      } else {
        // If we can't find the user in the DB, make it public for now or leave it. Let's make it public to not lose it
        publicUpdates.push(ex.id);
      }
    }
  }

  console.log(`Setting ${publicUpdates.length} exercises to PUBLIC (owner = NULL)`);
  // Update public exercises in batches
  for(let i=0; i<publicUpdates.length; i+=500) {
    const batch = publicUpdates.slice(i, i+500);
    const {error} = await supabase.from('exercises').update({ is_public: true, owner_user_id: null }).in('id', batch);
    if(error) console.error("Error updating public batch:", error);
  }

  console.log(`Setting ${privateUpdates.length} exercises to PRIVATE (with specific owners)`);
  // Update private exercises
  for(const update of privateUpdates) {
    const {error} = await supabase.from('exercises').update({ is_public: false, owner_user_id: update.owner_user_id }).eq('id', update.id);
    if(error) console.error("Error updating private exercise:", error);
  }
  
  console.log("Done fixing exercise ownership!");
}

run().catch(console.error);
