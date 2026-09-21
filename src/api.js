export const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";
import { supabase } from './supabase';

// ==========================================
// LIGHTWEIGHT PIPES
// ==========================================
export const fetchAthletes = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getAthletes&t=${Date.now()}`);
    if (!response.ok) { return { athletes: [], error: "Failed to connect" }; } 
    let json = await response.json();
    return { athletes: json.athletes || [], error: null };
  } catch (error) { return { athletes: [], error: "Failed to connect" }; }
};

export const fetchPrograms = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getPrograms&t=${Date.now()}`);
    if (!response.ok) { return { programs: [], error: "Failed to connect" }; } 
    let json = await response.json();
    return { programs: json.programs || [], error: null };
  } catch (error) { return { programs: [], error: "Failed to connect" }; }
};

export const fetchLibrary = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLibrary&t=${Date.now()}`);
    if (!response.ok) { return { library: [], error: "Failed to connect" }; } 
    let json = await response.json();
    return { library: json.library || [], error: null };
  } catch (error) { return { library: [], error: "Failed to connect" }; }
};

// ==========================================
// NEW POD PIPES (Wellness, Medical, Schedule)
// ==========================================
// Legacy Wellness_Logs sheet layout: Date, Email, Athlete, Grip, Feeling,
// Soreness, Sleep, Nutrition (consumers index positionally and slice(1))
const WELLNESS_SHEET_HEADER = ['Date','Email','Athlete','Grip','Feeling','Soreness','Sleep','Nutrition'];

export const saveWellnessLog = async (payload) => {
  try {
    let athleteId = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: mine } = await supabase.from('athletes').select('id').eq('user_id', user.id).maybeSingle();
      if (mine) athleteId = mine.id;
    }
    if (!athleteId && payload.athlete) {
      const { data: byName } = await supabase.from('athletes').select('id').ilike('name', payload.athlete).limit(1);
      if (byName && byName.length > 0) athleteId = byName[0].id;
    }
    if (!athleteId) return { status: 'Error', message: 'Athlete not found' };

    const num = (v) => (v !== undefined && v !== null && v !== '') ? Number(v) : null;
    const insert = {
      athlete_id: athleteId,
      date: new Date().toISOString().split('T')[0],
      grip_kg: num(payload.grip),
      feeling: num(payload.feeling),
      soreness: num(payload.soreness),
      sleep: num(payload.sleep),
      nutrition: num(payload.nutrition)
    };
    const { error } = await supabase.from('wellness_logs').insert(insert);
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchWellnessLogs = async (athleteName, email) => {
  try {
    const { data, error } = await supabase
      .from('wellness_logs')
      .select('date, grip_kg, feeling, soreness, sleep, nutrition, athletes(name, email)')
      .is('deleted_at', null)
      .order('date', { ascending: true });
    if (error) return { data: [] };
    const rows = (data || []).map(w => [
      w.date ? `${w.date}T00:00:00` : '',   // local-midnight so date displays correctly everywhere
      
      w.athletes ? w.athletes.email : '',    // email — CoachSchedule joins wellness by email
      w.athletes ? w.athletes.name : '',
      w.grip_kg ?? '',
      w.feeling ?? '',
      w.soreness ?? '',
      w.sleep ?? '',
      w.nutrition ?? ''
    ]);
    return { data: [WELLNESS_SHEET_HEADER, ...rows] };
  } catch (err) { return { data: [] }; }
};

export const saveScheduleSession = async (payload) => {
  try {
    let resp = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=saveSchedule&t=${Date.now()}`, {
      method: 'POST',
      body: JSON.stringify({ data: JSON.stringify(payload) })
    });
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchSchedule = async (athleteName, email) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getSchedule&t=${Date.now()}`;
    if (athleteName) url += `&athlete=${encodeURIComponent(athleteName)}`;
    if (email) url += `&email=${encodeURIComponent(email)}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { data: [] }; } 
    return await resp.json();
  } catch (err) { return { data: [] }; }
};

// Maps medical_entries rows back into the legacy sheet row shape
// (positional arrays, header first) so existing pages keep working.
const MED_SHEET_HEADER = ['Date Logged','Email','Athlete','Body Part','Pain Level','Mechanism','Training Status','Notes','Is Resolved','Date Resolved','Injury Grade'];

export const fetchMedicalLogs = async (athleteName, email) => {
  try {
    const { data, error } = await supabase
      .from('medical_entries')
      .select('date_logged, body_part, pain_level, mechanism, training_status, notes, is_resolved, date_resolved, injury_grade, athletes(name)')
      .is('deleted_at', null)
      .order('date_logged', { ascending: true });
    if (error) return { data: [] };
    const rows = (data || []).map(m => [
      m.date_logged,
      '',                                     // email column — see note below
      m.athletes ? m.athletes.name : '',
      m.body_part || '',
      m.pain_level ?? '',
      m.mechanism || '',
      m.training_status || '',
      m.notes || '',
      m.is_resolved ? 'Yes' : 'No',
      m.date_resolved || '',
      m.injury_grade ?? ''
    ]);
    return { data: [MED_SHEET_HEADER, ...rows] };
  } catch (err) { return { data: [] }; }
};

export const saveMedicalLog = async (payload) => {
  try {
    // Resolve the athlete: own account first, then lookup by name
    let athleteId = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: mine } = await supabase.from('athletes').select('id').eq('user_id', user.id).maybeSingle();
      if (mine) athleteId = mine.id;
    }
    if (!athleteId && payload.athlete) {
      const { data: byName } = await supabase.from('athletes').select('id').ilike('name', payload.athlete).limit(1);
      if (byName && byName.length > 0) athleteId = byName[0].id;
    }
    if (!athleteId) return { status: 'Error', message: 'Athlete not found' };

    const isResolved = payload.isResolved === 'Yes';
    const insert = {
      athlete_id: athleteId,
      date_logged: new Date().toISOString().split('T')[0],
      body_part: payload.bodyPart || '',
      pain_level: parseInt(payload.pain) || 0,
      mechanism: payload.mechanism || '',
      training_status: payload.trainingStatus || '',
      notes: payload.notes || '',
      is_resolved: isResolved,
      injury_grade: (payload.injuryGrade !== undefined && payload.injuryGrade !== '') ? parseInt(payload.injuryGrade) : null
    };
    if (isResolved) insert.date_resolved = new Date().toISOString().split('T')[0];

    const { error } = await supabase.from('medical_entries').insert(insert);
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// ==========================================
// EXISTING ENDPOINTS
// ==========================================
export const fetchLogbookByAthlete = async (athleteName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getLogbookByAthlete&athlete=${encodeURIComponent(athleteName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: "Error", data: [] }; } 
    return await resp.json();
  } catch (err) { return { status: "Error", data: [] }; }
};
export const getLogbookByAthlete = fetchLogbookByAthlete;

export const getLatestMaxes = async (athleteName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getLatestMaxes&athlete=${encodeURIComponent(athleteName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: "Error", maxes: {} }; } 
    return await resp.json();
  } catch (err) { return { status: "Error", maxes: {} }; }
};

export const getLastLoggedWeight = async (athleteName, exerciseName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getLastLoggedWeight&athlete=${encodeURIComponent(athleteName)}&exercise=${encodeURIComponent(exerciseName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: "NotFound" }; } 
    return await resp.json();
  } catch (err) { return { status: "NotFound" }; }
};

// Fixed to accept both object syntax and standard arguments to prevent crashes
export const createAthlete = async (emailOrObj, nameStr) => {
  try {
    const email = typeof emailOrObj === 'object' ? emailOrObj.email : emailOrObj;
    const name = typeof emailOrObj === 'object' ? emailOrObj.name : nameStr;
    let url = `${GOOGLE_SCRIPT_API_URL}?action=createAthlete&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const getAthleteByEmail = async (email) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getAthleteByEmail&email=${encodeURIComponent(email)}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const saveSession = async (payload) => {
  try {
    let resp = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=saveEntireSession&t=${Date.now()}`, {
      method: 'POST',
      body: JSON.stringify({ data: JSON.stringify(payload) })
    });
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export async function fetchExerciseLibrary(options = {}) {
  const response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLibrary&t=${Date.now()}`, options);
  if (!response.ok) { return []; } 
  const json = await response.json();
  const lib = [];
  const rawLibrary = json.library || [];
  for (let i = 0; i < rawLibrary.length; i++) {
    const row = rawLibrary[i];
    const name = String(row[0] || '').trim();
    const url = String(row[1] || '').trim();
    const muscle = (row[2] && String(row[2]).trim()) ? String(row[2]).trim() : 'Other';
    const formula = (row[3] && String(row[3]).trim()) ? String(row[3]).trim().toLowerCase() : '';
    const ownerEmail = (row[5] && String(row[5]).trim()) ? String(row[5]).trim() : '';
    if (!name) continue;
    lib.push({ name, muscle, rawUrl: url, formula, isEpley: formula === 'yes' || formula === 'weight', ownerEmail });
  }
  return lib;
}

export const deleteProgram = async (programName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=deleteProgram&pName=${encodeURIComponent(programName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const updateAssignment = async (athleteName, assignment) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=updateAssignment&aName=${encodeURIComponent(athleteName)}&assignment=${encodeURIComponent(assignment)}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const saveFullProgram = async (programRows) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=saveFullProgram&t=${Date.now()}`;
    let resp = await fetch(url, { method: 'POST', body: JSON.stringify({ programData: JSON.stringify(programRows) }) });
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const assignProgramBulk = async (athleteRows, programAssignment, columnId) => {
  try {
    let payload = JSON.stringify({ athleteRows, programAssignment, columnId });
    let url = `${GOOGLE_SCRIPT_API_URL}?action=assignProgram&data=${encodeURIComponent(payload)}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};
export const assignProgramToAthletes = assignProgramBulk; 

export const addExerciseToLibrary = async (exerciseData) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=addExercise&data=${encodeURIComponent(JSON.stringify(exerciseData))}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const deleteExerciseFromLibrary = async (exerciseName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=deleteExercise&exName=${encodeURIComponent(exerciseName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const updateExerciseInLibrary = addExerciseToLibrary;

export const fetchHelpVideos = async () => {
  try {
    const { data, error } = await supabase
      .from('help_videos')
      .select('page_name, video_url');
    if (error) return [];
    return data || [];
  } catch (err) { return []; }
};

export const updateProgram = async (oldName, programRows) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=updateProgram&t=${Date.now()}`;
    let resp = await fetch(url, { method: 'POST', body: JSON.stringify({ oldName: oldName, programData: JSON.stringify(programRows) }) });
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// ==========================================
// LOGBOOK EDIT & AUDIT PIPES (Step B+C)
// ==========================================
export const updateLogbookEntry = async ({ athlete, sessionDate, program, exercise, setNumber, field, newValue, editorEmail, editorRole }) => {
  try {
    const payload = { athlete, sessionDate, program, exercise, setNumber, field, newValue, editorEmail, editorRole };
    let url = `${GOOGLE_SCRIPT_API_URL}?action=updateLogbookEntry&data=${encodeURIComponent(JSON.stringify(payload))}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchAuditLog = async (filters = {}) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=fetchAuditLog&t=${Date.now()}`;
    if (filters.athlete) url += `&athlete=${encodeURIComponent(filters.athlete)}`;
    if (filters.program) url += `&program=${encodeURIComponent(filters.program)}`;
    if (filters.dateStart) url += `&dateStart=${encodeURIComponent(filters.dateStart)}`;
    if (filters.dateEnd) url += `&dateEnd=${encodeURIComponent(filters.dateEnd)}`;

    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export function getMediaType(url) {
  if (!url) return null;
  try {
    const ext = url.split('.').pop().split('?')[0].toLowerCase();
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    return 'video';
  } catch { return 'video'; }
}

export function parseProgramsFromRaw(rawPrograms, coachEmail) {
  const programs = [];
  if (!rawPrograms || rawPrograms.length <= 1) return programs;
  for (let i = 1; i < rawPrograms.length; i++) {
    const row = rawPrograms[i];
    const name = String(row[0] || '').trim();
    const privacyLevel = (row.length > 10 && String(row[10]).trim()) ? String(row[10]).trim() : 'PRIVATE';
    const ownerEmail = (row.length > 11 && String(row[11]).trim()) ? String(row[11]).trim() : '';
    const mediaUrl = (row.length > 12 && String(row[12]).trim()) ? String(row[12]).trim() : '';
    if (!name) continue;
    programs.push({
      name, privacyLevel, ownerEmail, mediaUrl,
      mediaType: mediaUrl ? getMediaType(mediaUrl) : null,
      isOwnedByCoach: ownerEmail.toLowerCase() === (coachEmail || '').toLowerCase(),
      rawData: row
    });
  }
  return programs;
}

// ==========================================
// FAILSAFE DEFAULT EXPORT
// ==========================================
const api = {
  fetchAthletes, fetchPrograms, fetchLibrary, saveWellnessLog, 
  fetchWellnessLogs, saveScheduleSession, fetchSchedule, saveMedicalLog, 
  fetchMedicalLogs, fetchLogbookByAthlete, getLogbookByAthlete, getLatestMaxes, 
  getLastLoggedWeight, createAthlete, getAthleteByEmail, saveSession, 
  fetchExerciseLibrary, deleteProgram, updateAssignment, saveFullProgram, 
  assignProgramBulk, assignProgramToAthletes, addExerciseToLibrary, 
  deleteExerciseFromLibrary, updateExerciseInLibrary, fetchHelpVideos, 
  updateProgram, updateLogbookEntry, fetchAuditLog, getMediaType, 
  parseProgramsFromRaw, GOOGLE_SCRIPT_API_URL
};
export default api;
