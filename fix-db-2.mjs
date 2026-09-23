import WebSocket from "ws"; global.WebSocket = WebSocket;
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function runFixes() {
  console.log("Starting fixes...");

  const { data: crusty } = await supabase.from('athletes').select('id, user_id').eq('name', 'Crusty').single();

  console.log("Fetching exercises from GAS...");
  const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";
  const res = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLibrary&t=${Date.now()}`);
  const json = await res.json();
  const rawLibrary = json.library || [];
  
  console.log(`Found ${rawLibrary.length} exercises in GAS.`);
  
  const inserts = [];
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
      is_public: true, 
      owner_user_id: crusty ? crusty.user_id : null // Use AUTH ID here
    });
  }
  
  console.log(`Attempting to insert ${inserts.length} exercises into Supabase...`);
  let successCount = 0;
  for (let i = 0; i < inserts.length; i += 500) {
    const batch = inserts.slice(i, i + 500);
    const { error: exErr } = await supabase.from('exercises').upsert(batch, { onConflict: 'name', ignoreDuplicates: true });
    if (exErr) {
      console.log("Error inserting batch:", exErr.message);
    } else {
      successCount += batch.length;
    }
  }
  
  // Make sure existing ones are owned by Crusty too
  if (crusty && crusty.user_id) {
    await supabase.from('exercises').update({ owner_user_id: crusty.user_id }).is('owner_user_id', null);
  }
  
  console.log(`Successfully processed exercises.`);
}

runFixes().catch(e => console.error("Global Error:", e.message));
