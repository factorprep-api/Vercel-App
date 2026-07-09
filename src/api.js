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

export async function fetchExerciseLibrary() {
  const API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";
  const response = await fetch(`${API_URL}?action=getFullData`);
  const json = await response.json();
  const lib = [];
  for (let i = 1; i < json.library.length; i++) {
    const row = json.library[i];
    const name = String(row[0] || '').trim();
    const url = String(row[1] || '').trim();
    const muscle = (row.length > 2 && String(row[2]).trim()) ? String(row[2]).trim() : 'Other';
    if (!name || !url) continue;
    lib.push({ name, muscle, rawUrl: url });
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
    let url = `${GOOGLE_SCRIPT_API_URL}?action=addExercise&data=${encodeURIComponent(JSON.stringify(exerciseData))}`;
    let resp = await fetch(url);
    let json = await resp.json();
    return json;
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};
