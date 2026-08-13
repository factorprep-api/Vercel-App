const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";

// ==========================================
// FULL DATA FETCH (Fallback)
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
// LIGHTNING FAST PIPES (Separated)
// ==========================================
export const fetchAthletes = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getAthletes&t=${Date.now()}`);
    let json = await response.json();
    return { athletes: json.athletes || [], error: null };
  } catch (error) {
    return { athletes: [], error: "Failed to fetch athletes" };
  }
};

export const fetchPrograms = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getPrograms&t=${Date.now()}`);
    let json = await response.json();
    return { programs: json.programs || [], error: null };
  } catch (error) {
    return { programs: [], error: "Failed to fetch programs" };
  }
};

export const fetchLibrary = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLibrary&t=${Date.now()}`);
    let json = await response.json();
    return { library: json.library || [], error: null };
  } catch (error) {
    return { library: [], error: "Failed to fetch library" };
  }
};

// ==========================================
// SPECIFIC DB QUERIES
// ==========================================
export const getAthleteByEmail = async (email) => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getAthleteByEmail&email=${encodeURIComponent(email)}&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    return { status: 'Error', message: error.message };
  }
};

export const fetchLogbookByAthlete = async (athleteName) => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLogbook&athlete=${encodeURIComponent(athleteName)}&t=${Date.now()}`);
    let json = await response.json();
    return { status: 'Success', data: json.data || [] };
  } catch (error) {
    return { status: 'Error', message: error.message };
  }
};

export const getLatestMaxes = async (athleteName) => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getLatestMaxes&athlete=${encodeURIComponent(athleteName)}&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    return { status: 'Error', message: error.message };
  }
};

// ==========================================
// SECURE POST REQUESTS (Saving Data)
// ==========================================
export const saveSession = async (payload) => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=saveSession&t=${Date.now()}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return await response.json();
  } catch (error) {
    return { status: 'Error', message: error.message };
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

// ==========================================
// UTILITIES
// ==========================================
export const getMediaType = (url) => {
  if (!url) return null;
  const lower = url.toLowerCase();
  
  // Videos
  if (lower.match(/\.(mp4|webm|mov)$/) || lower.includes('youtube') || lower.includes('youtu.be')) {
    return 'video';
  }
  // Audio
  if (lower.match(/\.(mp3|wav|m4a)$/)) {
    return 'audio';
  }
  // Images
  if (lower.match(/\.(png|jpe?g|gif|webp)$/)) {
    return 'image';
  }
  
  return 'video'; // default
};
