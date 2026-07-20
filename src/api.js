const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";

export const fetchAllData = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getFullData`);
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

export const fetchLogbookByAthlete = async (athleteName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getLogbookByAthlete&athlete=${encodeURIComponent(athleteName)}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: "Empty", data: [] };
  }
};

export const createAthlete = async ({ email, name }) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=createAthlete&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const getAthleteByEmail = async (email) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getAthleteByEmail&email=${encodeURIComponent(email)}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: "Error", message: err.message };
  }
};

export const saveSession = async (payload) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=saveEntireSession&data=${encodeURIComponent(JSON.stringify(payload))}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export async function fetchExerciseLibrary(options = {}) {
  const API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";
  const response = await fetch(`${API_URL}?action=getFullData`, options);
  const json = await response.json();
  const lib = [];
  for (let i = 1; i < json.library.length; i++) {
    const row = json.library[i];
    const name = String(row[0] || '').trim();
    const url = String(row[1] || '').trim();
    const muscle = (row.length > 2 && String(row[2]).trim()) ? String(row[2]).trim() : 'Other';
    const baseLift = (row.length > 3 && String(row[3]).trim()) ? String(row[3]).trim() : '';
    const multiplier = (row.length > 4 && String(row[4]).trim()) ? parseFloat(row[4]) || 1.0 : 1.0;
    const ownerEmail = (row.length > 5 && String(row[5]).trim()) ? String(row[5]).trim() : '';
    if (!name || !url) continue;
    lib.push({ name, muscle, rawUrl: url, baseLift, multiplier, ownerEmail });
  }
  return lib;
}

export const deleteProgram = async (programName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=deleteProgram&pName=${encodeURIComponent(programName)}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const updateAssignment = async (athleteName, assignment) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=updateAssignment&aName=${encodeURIComponent(athleteName)}&assignment=${encodeURIComponent(assignment)}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const saveFullProgram = async (programRows) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=saveFullProgram&programData=${encodeURIComponent(JSON.stringify(programRows))}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const assignProgramBulk = async (athleteRows, programAssignment, columnId) => {
  try {
    let payload = JSON.stringify({ athleteRows, programAssignment, columnId });
    let url = `${GOOGLE_SCRIPT_API_URL}?action=assignProgram&data=${encodeURIComponent(payload)}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const addExerciseToLibrary = async (exerciseData) => {
  try {
    const resp = await fetch(GOOGLE_SCRIPT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addExercise', data: exerciseData })
    });
    const json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const deleteExerciseFromLibrary = async (exerciseName) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=deleteExercise&exName=${encodeURIComponent(exerciseName)}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const updateExerciseInLibrary = async (exerciseData) => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=updateExercise&data=${encodeURIComponent(JSON.stringify(exerciseData))}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const fetchHelpVideos = async () => {
  try {
    let url = `${GOOGLE_SCRIPT_API_URL}?action=getHelpVideos`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json.data || {};
  } catch (err) {
    return {};
  }
};

// ========== NEW MEDIA FUNCTIONS ==========

/**
 * Detect media type from URL extension
 * @param {string} url - The media file URL
 * @returns {'video'|'audio'|null} - The detected media type or null
 */
export function getMediaType(url) {
  if (!url) return null;
  try {
    const ext = url.split('.').pop().split('?')[0].toLowerCase();
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    // Default to video for unknown / streaming URLs (YouTube, Vimeo, etc.)
    return 'video';
  } catch {
    return 'video';
  }
}

/**
 * Parse programs from raw Google Sheets rows, extracting mediaUrl from Column M (index 12)
 * @param {Array} rawPrograms - Raw program rows from Google Sheets (including header)
 * @param {string} coachEmail - Current coach's email for ownership checks
 * @returns {Array} Parsed program objects with mediaUrl field
 */
export function parseProgramsFromRaw(rawPrograms, coachEmail) {
  const programs = [];
  if (!rawPrograms || rawPrograms.length <= 1) return programs;

  // Skip header row, process data rows
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
      rawData: row  // Keep original row for editing/saving
    });
  }

  return programs;
}
