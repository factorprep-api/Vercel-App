const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";

// ==========================================
// MASSIVE PIPE (Legacy)
// ==========================================
export const fetchAllData = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getFullData&t=${Date.now()}`);
    let json = await response.json();
    return {
      athletes: json.athletes || [],
      programs: json.programs || json.program || [],
      library: json.library || [],
      error: null
    };
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
    let json = await response.json();
    return { athletes: json.athletes || [], error: null };
  } catch (error) {
    return { athletes: [], error: "Failed to connect to database" };
  }
};

export const fetchPrograms = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getPrograms&t=${Date.now()}`);
    let json = await response.json();
    return { programs: json.programs || [], error: null };
  } catch (error) {
    return { programs: [], error: "Failed to connect to database" };
  }
};

export const fetchLibrary = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLibrary&t=${Date.now()}`);
    let json = await response.json();
    return { library: json.library || [], error: null };
  } catch (error) {
    return { library: [], error: "Failed to connect to database" };
  }
};

// ==========================================
// EXISTING ENDPOINTS
// ==========================================
export const fetchLogbookByAthlete = async (athleteName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getLogbookByAthlete&athlete=${encodeURIComponent(athleteName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: "Empty", data: [] };
  }
};

export const getLatestMaxes = async (athleteName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getLatestMaxes&athlete=${encodeURIComponent(athleteName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    return await resp.json();
  } catch (err) {
    return { status: "Error", maxes: {} };
  }
};

export const getLastLoggedWeight = async (athleteName, exerciseName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getLastLoggedWeight&athlete=${encodeURIComponent(athleteName)}&exercise=${encodeURIComponent(exerciseName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    return await resp.json();
  } catch (err) {
    return { status: "NotFound" };
  }
};

export const createAthlete = async ({ email, name }) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=createAthlete&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const getAthleteByEmail = async (email) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getAthleteByEmail&email=${encodeURIComponent(email)}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: "Error", message: err.message };
  }
};

export const saveSession = async (payload) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=saveEntireSession&data=${encodeURIComponent(JSON.stringify(payload))}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export async function fetchExerciseLibrary(options = {}) {
  const response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLibrary&t=${Date.now()}`, options);
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
    
    lib.push({
      name,
      muscle,
      rawUrl: url,
      formula,
      isEpley: formula === 'yes',
      ownerEmail
    });
  }
  return lib;
}

export const deleteProgram = async (programName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=deleteProgram&pName=${encodeURIComponent(programName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const updateAssignment = async (athleteName, assignment) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=updateAssignment&aName=${encodeURIComponent(athleteName)}&assignment=${encodeURIComponent(assignment)}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const saveFullProgram = async (programRows) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=saveFullProgram&t=${Date.now()}`;
    let resp = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ programData: JSON.stringify(programRows) })
    });
    return await resp.json();
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};


export const assignProgramBulk = async (athleteRows, programAssignment, columnId) => {
  try {
    let payload = JSON.stringify({ athleteRows, programAssignment, columnId });
    let url = `${GOOGLE_SCRIPT_API_URL}?action=assignProgram&data=${encodeURIComponent(payload)}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const addExerciseToLibrary = async (exerciseData) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=addExercise&data=${encodeURIComponent(JSON.stringify(exerciseData))}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const deleteExerciseFromLibrary = async (exerciseName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=deleteExercise&exName=${encodeURIComponent(exerciseName)}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const updateExerciseInLibrary = async (exerciseData) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=updateExercise&data=${encodeURIComponent(JSON.stringify(exerciseData))}&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const fetchHelpVideos = async () => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getHelpVideos&t=${Date.now()}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json.data || {};
  } catch (err) {
    return {};
  }
};

export const updateProgram = async (oldName, programRows) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=updateProgram&t=${Date.now()}`;
    let resp = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ oldName: oldName, programData: JSON.stringify(programRows) })
    });
    return await resp.json();
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
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
  } catch {
    return 'video';
  }
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
      name,
      privacyLevel,
      ownerEmail,
      mediaUrl,
      mediaType: mediaUrl ? getMediaType(mediaUrl) : null,
      isOwnedByCoach: ownerEmail.toLowerCase() === (coachEmail || '').toLowerCase(),
      rawData: row
    });
  }
  return programs;
}
