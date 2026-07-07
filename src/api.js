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
