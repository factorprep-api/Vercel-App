const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";

export const fetchAllData = async () => {
  try {
    let response = await fetch(`${GOOGLE_SCRIPT_API_URL}?action=getFullData`);
    let json = await response.json();
    return {
      athletes: json.athletes || [],
      programs: json.programs || [],
      error: null
    };
  } catch (error) {
    return { athletes: [], programs: [], error: "Failed to connect to database" };
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
