import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function runFixes() {
  console.log("Starting fixes...");

  // 1. Give Crusty his pods
  const { data: crusty } = await supabase.from('athletes').select('id').eq('name', 'Crusty').single();
  const { data: team } = await supabase.from('teams').select('id').eq('name', 'Development Team').single();
  
  if (crusty && team) {
    const { error: podErr } = await supabase.from('athlete_team_memberships').upsert({
      athlete_id: crusty.id,
      team_id: team.id,
      active_pods: ['wellness', 'schedule', 'medical']
    }, { onConflict: 'athlete_id, team_id' });
    console.log("Pods updated:", podErr ? podErr.message : "Success");
  } else {
    console.log("Crusty or team not found");
  }

  // 2. Fetch the 3000 exercises from Google Apps Script and insert them into Supabase
  console.log("Fetching exercises from GAS...");
  const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";
  const res = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLibrary&t=${Date.now()}`);
  const json = await res.json();
  const rawLibrary = json.library || [];
  
  console.log(`Found ${rawLibrary.length} exercises in GAS.`);
  
  const inserts = [];
  // Start from index 1 to skip header
  for (let i = 1; i < rawLibrary.length; i++) {
    const row = rawLibrary[i];
    const name = String(row[0] || '').trim();
    if (!name) continue;
    
    const url = String(row[1] || '').trim();
    const muscle = (row[2] && String(row[2]).trim()) ? String(row[2]).trim() : 'Other';
    const formula = (row[3] && String(row[3]).trim()) ? String(row[3]).trim().toLowerCase() : '';
    
    let metricType = null;
    if (formula === 'yes' || formula === 'weight') metricType = 'weight';
    else if (formula === 'time') metricType = 'time';
    else if (formula === 'distance') metricType = 'distance';
    else if (formula === 'reps_only') metricType = 'reps_only';

    inserts.push({
      name: name,
      muscle_category: muscle,
      video_url: url,
      metric_type: metricType,
      is_public: true, // Master library is public
      owner_user_id: crusty ? crusty.id : null // Crusty owns master library
    });
  }
  
  console.log(`Attempting to insert ${inserts.length} exercises into Supabase...`);
  // Insert in batches of 500
  let successCount = 0;
  for (let i = 0; i < inserts.length; i += 500) {
    const batch = inserts.slice(i, i + 500);
    // Use upsert to avoid duplicate name conflicts
    const { error: exErr } = await supabase.from('exercises').upsert(batch, { onConflict: 'name', ignoreDuplicates: true });
    if (exErr) {
      console.log("Error inserting batch:", exErr.message);
    } else {
      successCount += batch.length;
    }
  }
  console.log(`Successfully processed ${successCount} exercises.`);
}

runFixes().catch(e => console.error("Global Error:", e.message));
