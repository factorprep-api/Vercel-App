export const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";

// ==========================================
// MASSIVE PIPE (Legacy)
// ==========================================
export const fetchAllData = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getFullData&t=${Date.now()}`);
    if (!response.ok) { return { athletes: [], programs: [], library: [], error: "Failed to connect to database" }; } 
    let json = await response.json();
    return { athletes: json.athletes || [], programs: json.programs || json.program || [], library: json.library || [], error: null };
  } catch (error) {
    return { athletes: [], programs: [], library: [], error: "Failed to connect to database" };
  }
};

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
export const saveWellnessLog = async (payload) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=saveWellness&data=${encodeURIComponent(JSON.stringify(payload))}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchWellnessLogs = async () => {
  try {
    let resp = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getWellness&t=${Date.now()}`);
    if (!resp.ok) { return { data: [] }; } 
    return await resp.json();
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

export const fetchSchedule = async () => {
  try {
    let resp = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getSchedule&t=${Date.now()}`);
    if (!resp.ok) { return { data: [] }; } 
    return await resp.json();
  } catch (err) { return { data: [] }; }
};

export const saveMedicalLog = async (payload) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=saveMedical&data=${encodeURIComponent(JSON.stringify(payload))}&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return { status: 'Error', message: 'HTTP ' + resp.status }; } 
    return await resp.json();
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchMedicalLogs = async () => {
  try {
    let resp = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getMedical&t=${Date.now()}`);
    if (!resp.ok) { return { data: [] }; } 
    return await resp.json();
  } catch (err) { return { data: [] }; }
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
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getHelpVideos&t=${Date.now()}`;
    let resp = await fetch(url);
    if (!resp.ok) { return {}; } 
    let json = await resp.json();
    return json.data || json.helpVideos || json;
  } catch (err) { return {}; }
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
  fetchAllData, fetchAthletes, fetchPrograms, fetchLibrary, saveWellnessLog, 
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
