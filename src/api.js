const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec';

// --- CORE / LEGACY ACTIONS ---

export async function fetchAllData() {
  const url = `${SCRIPT_URL}?action=getFullData&t=${Date.now()}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching all data:', error);
    throw error;
  }
}

export async function getAthleteByEmail(email) {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getAthleteByEmail&email=${encodeURIComponent(email)}&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error getting athlete by email:', error);
    throw error;
  }
}

export async function createAthlete(name, email) {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=createAthlete&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error creating athlete:', error);
    throw error;
  }
}

export async function fetchAthletes() {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getAthletes&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching athletes:', error);
    throw error;
  }
}

export async function fetchPrograms() {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getPrograms&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching programs:', error);
    throw error;
  }
}

export async function fetchLibrary() {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getLibrary&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching library:', error);
    throw error;
  }
}

export async function getLogbookByAthlete(athleteName) {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getLogbookByAthlete&athlete=${encodeURIComponent(athleteName)}&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error getting logbook:', error);
    throw error;
  }
}
export const fetchLogbookByAthlete = getLogbookByAthlete;

export async function getLastLoggedWeight(athleteName, exerciseName) {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getLastLoggedWeight&athlete=${encodeURIComponent(athleteName)}&exercise=${encodeURIComponent(exerciseName)}&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error getting last logged weight:', error);
    throw error;
  }
}

export async function fetchHelpVideos() {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getHelpVideos&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching help videos:', error);
    throw error;
  }
}

// --- ADMIN / PROGRAM MANAGEMENT ---

export async function saveFullProgram(programData) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=saveFullProgram&programData=${encodeURIComponent(JSON.stringify(programData))}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error saving program:', error);
    throw error;
  }
}

export async function updateProgram(oldName, programData) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=updateProgram&oldName=${encodeURIComponent(oldName)}&programData=${encodeURIComponent(JSON.stringify(programData))}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating program:', error);
    throw error;
  }
}

export async function deleteProgram(pName) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=deleteProgram&pName=${encodeURIComponent(pName)}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error deleting program:', error);
    throw error;
  }
}

export async function addAthlete(aName, pin) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=addAthlete&aName=${encodeURIComponent(aName)}&pin=${encodeURIComponent(pin)}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error adding athlete:', error);
    throw error;
  }
}

export async function deleteAthlete(aName) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=deleteAthlete&aName=${encodeURIComponent(aName)}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error deleting athlete:', error);
    throw error;
  }
}

export async function updateAssignment(aName, assignment) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=updateAssignment&aName=${encodeURIComponent(aName)}&assignment=${encodeURIComponent(assignment)}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating assignment:', error);
    throw error;
  }
}

export async function assignProgramToAthletes(athleteRows, programAssignment, columnId) {
  const payload = { athleteRows, programAssignment, columnId };
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=assignProgram&data=${encodeURIComponent(JSON.stringify(payload))}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error assigning program:', error);
    throw error;
  }
}

export async function addExercise(exerciseData) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=addExercise&data=${encodeURIComponent(JSON.stringify(exerciseData))}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error adding exercise:', error);
    throw error;
  }
}

export async function saveEntireSession(payload) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=saveEntireSession&data=${encodeURIComponent(JSON.stringify(payload))}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error saving entire session:', error);
    throw error;
  }
}

// --- NEW POD ENDPOINTS ---

export async function saveWellnessLog(payload) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=saveWellness&data=${encodeURIComponent(JSON.stringify(payload))}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error saving wellness log:', error);
    throw error;
  }
}

export async function fetchWellnessLogs() {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getWellness&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching wellness logs:', error);
    throw error;
  }
}

export async function saveScheduleSession(payload) {
  // Payload now expects: { email, athlete, type, proposedMins, proposedRpe, actualMins, actualRpe, location, notes }
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=saveSchedule&data=${encodeURIComponent(JSON.stringify(payload))}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error saving schedule session:', error);
    throw error;
  }
}

export async function fetchSchedule() {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getSchedule&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching schedule logs:', error);
    throw error;
  }
}

export async function saveMedicalLog(payload) {
  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `action=saveMedical&data=${encodeURIComponent(JSON.stringify(payload))}`
    });
    return await response.json();
  } catch (error) {
    console.error('Error saving medical log:', error);
    throw error;
  }
}

export async function fetchMedicalLogs() {
  try {
    const response = await fetch(`${SCRIPT_URL}?action=getMedical&t=${Date.now()}`);
    return await response.json();
  } catch (error) {
    console.error('Error fetching medical logs:', error);
    throw error;
  }
}
