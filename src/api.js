export const GOOGLE_SCRIPT_API_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";
import { supabase } from './supabase';

// ==========================================
// LIGHTWEIGHT PIPES
// ==========================================
export const fetchAthletes = async () => {
  try {
    const [ { data: profiles, error: pErr }, { data: athletesData, error: aErr } ] = await Promise.all([
      supabase.from('athlete_profiles').select('*'),
      supabase.from('athletes').select('id, user_id, coach_user_id, role, email, athlete_team_memberships(active_pods), assignments(status, programs(name))')
    ]);

    if (pErr) return { athletes: [], error: pErr.message };
    if (aErr) return { athletes: [], error: aErr.message };

    const ATHLETE_SHEET_HEADER = ['Name', 'Role', 'PrimaryClub', 'CoachName', 'C4', 'C5', 'C6', 'C7', 'C8', 'Email', 'C10', 'Active Pods', 'Program Assignment'];

    // Coach email map built from athletes table directly (it has user_id AND email)
    const coachEmailByUserId = {};
    (athletesData || []).forEach(a => {
      if (a.user_id && a.email) coachEmailByUserId[a.user_id] = a.email;
    });

    const rows = (athletesData || []).map(a => {
      const profile = (profiles || []).find(p => p.id === a.id) || {};
      const row = Array(13).fill('');
      row[0] = a.name || profile.name || '';
      row[1] = a.role || profile.role || '';
      row[9] = a.email || profile.email || '';
      
      if (a.coach_user_id) {
        row[3] = coachEmailByUserId[a.coach_user_id] || '';
      }
      
      if (a.athlete_team_memberships && a.athlete_team_memberships.length > 0) {
        const pods = a.athlete_team_memberships[0].active_pods;
        row[11] = (pods && pods.length > 0) ? pods.join(', ') : 'wellness, medical, schedule';
      } else {
        row[11] = 'wellness, medical, schedule';
      }
      if (a.assignments && a.assignments.length > 0) {
        row[12] = a.assignments.filter(asg => asg.status === 'active' && asg.programs).map(asg => asg.programs.name).join(', ');
      }
      return row;
    });

    return { athletes: [ATHLETE_SHEET_HEADER, ...rows], error: null };
  } catch (error) { return { athletes: [], error: error.message }; }
};

export const fetchPrograms = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const currentUserEmail = user ? user.email : '';
    const currentUserId = user ? user.id : '';

    const { data, error } = await supabase
      .from('programs')
      .select(`
        name, category, privacy, media_url, notes,
        owner_user_id,
        program_exercises (
          sets, reps, intensity_pct, tempo, rest, phase, advanced,
          exercises (exercise_name)
        )
      `) // CHANGED: exercises (name) -> exercises (exercise_name)
      .order('created_at', { ascending: false });
      
    if (error) return { programs: [], error: error.message };

    const PROGRAM_HEADER = ['Program Name', 'Category', 'Phase', 'Exercise Name', 'Sets', 'Reps', 'Intensity', 'Tempo', 'Rest Time', 'Notes', 'PrivacyLevel', 'OwnerEmail', 'MediaUrl', 'Advanced'];
    
    const rows = [PROGRAM_HEADER];
    for (const prog of (data || [])) {
      const ownerEmail = prog.owner_user_id === currentUserId ? currentUserEmail : 'other@example.com';
      const privacy = (prog.privacy || 'PUBLIC').toUpperCase();
      const media = prog.media_url || '';
      const notes = prog.notes || '';
      
      if (!prog.program_exercises || prog.program_exercises.length === 0) {
         const row = Array(14).fill('');
         row[0] = prog.name;
         row[1] = prog.category || '';
         row[9] = notes;
         row[10] = privacy;
         row[11] = ownerEmail;
         row[12] = media;
         rows.push(row);
         continue;
      }
      
      for (const pe of prog.program_exercises) {
         const row = Array(14).fill('');
         row[0] = prog.name;
         row[1] = prog.category || '';
         row[2] = pe.phase || '';
         row[3] = pe.exercises ? pe.exercises.exercise_name : ''; // CHANGED
         row[4] = pe.sets ?? '';
         row[5] = pe.reps || '';
         row[6] = pe.intensity_pct ?? '';
         row[7] = pe.tempo || '';
         row[8] = pe.rest || '';
         row[9] = notes;
         row[10] = privacy;
         row[11] = ownerEmail;
         row[12] = media;
         row[13] = typeof pe.advanced === 'object' ? JSON.stringify(pe.advanced) : (pe.advanced || '{}');
         rows.push(row);
      }
    }

    return { programs: rows, error: null };
  } catch (err) {
    return { programs: [], error: err.message };
  }
};

export const fetchLibrary = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const currentUserEmail = user ? user.email : '';
    const currentUserId = user ? user.id : '';

    // CHANGED: Supabase/PostgREST caps each request at 1000 rows regardless of
    // the range requested, so we paginate until a page comes back short.
    const PAGE_SIZE = 1000;
    const allRows = [];
    let from = 0;
    let page = null;

    do {
      const { data, error } = await supabase
        .from('exercises')
        .select('exercise_name, video_url, muscle_category, metric_type, is_public, owner_user_id')
        .order('exercise_name', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) return { library: [], error: error.message };

      page = data || [];
      allRows.push(...page);
      from += PAGE_SIZE;
    } while (page.length === PAGE_SIZE);

    const LIB_HEADER = ['Name', 'Video', 'Muscle', 'Formula', 'IsPublic', 'Owner'];
    const rows = allRows.map(ex => {
      const row = Array(6).fill('');
      row[0] = ex.exercise_name || '';
      row[1] = ex.video_url || '';
      row[2] = ex.muscle_category || '';
      row[3] = ex.metric_type || '';
      row[4] = ex.is_public ? 'TRUE' : 'FALSE';

      if (ex.is_public) {
        row[5] = '';
      } else {
        row[5] = ex.owner_user_id === currentUserId ? currentUserEmail : 'other@example.com';
      }
      return row;
    });

    return { library: [LIB_HEADER, ...rows], error: null };
  } catch (err) {
    return { library: [], error: err.message };
  }
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

// ==========================================
// SCHEDULE PIPE (Supabase) — proposals in
// schedule_sessions, completions/manual logs in
// session_logs, linked by session_id.
// Read adapter emits the legacy sheet row shape
// (positional arrays, header first, r[0]..r[12])
// so existing pages keep working unchanged.
// ==========================================
const SCHED_SHEET_HEADER = ['Date','Email','Athlete','Type','Proposed Mins','Proposed RPE','Proposed Load','Actual Mins','Actual RPE','Actual Load','Location','Notes','ID'];

// Resolve an athlete UUID: signed-in user first, then lookup by name
async function resolveAthleteRow(athleteName) {
  if (athleteName) {
    const { data: byName } = await supabase.from('athletes').select('id').ilike('name', athleteName).limit(1);
    if (byName && byName.length > 0) return byName[0].id;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: mine } = await supabase.from('athletes').select('id').eq('user_id', user.id).maybeSingle();
    if (mine) return mine.id;
  }
  return null;
}

export const deleteScheduleSession = async (sessionId) => {
  try {
    if (!sessionId) return { status: 'Error', message: 'Missing session ID.' };

    // Failsafe check: verify no session_logs exist for this proposal
    const { data: logs } = await supabase
      .from('session_logs')
      .select('id')
      .eq('session_id', sessionId)
      .is('deleted_at', null);

    if (logs && logs.length > 0) {
      return { status: 'Error', message: 'Cannot delete a session that has completed athlete logs.' };
    }

    const { error } = await supabase
      .from('schedule_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const saveScheduleSession = async (payload) => {
  try {
    // --- BRANCH 1: completion of a proposed session ---
    // Authoritative proposal data comes from the DB row, not the client.
    if (payload.sessionId) {
      const { data: prop, error: propErr } = await supabase
        .from('schedule_sessions')
        .select('id, athlete_id, team_id, date, session_type, location')
        .eq('id', payload.sessionId)
        .maybeSingle();
      if (propErr) return { status: 'Error', message: propErr.message };
      if (!prop) return { status: 'Error', message: 'Proposed session not found' };

      const actualMins = parseInt(payload.actualMins) || 0;
      const actualRpe = parseInt(payload.actualRpe) || 0;
      // NOTE: actual_load is a GENERATED column in session_logs — never insert it;
      // the database computes it from actual_mins × actual_rpe automatically.
      const { error } = await supabase.from('session_logs').insert({
        session_id: prop.id,
        athlete_id: prop.athlete_id,
        team_id: prop.team_id,
        session_type: prop.session_type,
        date: prop.date,
        actual_mins: actualMins,
        actual_rpe: actualRpe,
        location: payload.location || prop.location || '',
        notes: payload.notes || '',
        audit_mode: payload.auditMode || null,
        audit_notes: null
      });

      if (error) return { status: 'Error', message: error.message };
      return { status: 'Success' };
    }

    // --- BRANCH 2: coach proposal (proposedMins > 0) ---
    if (parseInt(payload.proposedMins) > 0) {
      const athleteId = await resolveAthleteRow(payload.athlete);
      if (!athleteId) return { status: 'Error', message: 'Athlete not found: ' + payload.athlete };

      const proposedMins = parseInt(payload.proposedMins) || 0;
      const proposedRpe = parseInt(payload.proposedRpe) || 0;
      const { error } = await supabase.from('schedule_sessions').insert({
        athlete_id: athleteId,
        date: payload.date || new Date().toISOString().split('T')[0],
        session_type: payload.type || 'Other',
        proposed_mins: proposedMins,
        proposed_rpe: proposedRpe,
        proposed_load: proposedMins * proposedRpe,
        location: payload.location || '',
        notes: payload.notes || ''
      });
      if (error) return { status: 'Error', message: error.message };
      return { status: 'Success' };
    }

    // --- BRANCH 3: manual log (no proposal) ---
    const athleteId = await resolveAthleteRow(payload.athlete);
    if (!athleteId) return { status: 'Error', message: 'Athlete not found: ' + payload.athlete };

       const actualMins = parseInt(payload.actualMins) || 0;
    const actualRpe = parseInt(payload.actualRpe) || 0;
    // NOTE: actual_load is a GENERATED column — never insert it.
    const { error } = await supabase.from('session_logs').insert({
      session_id: null,
      athlete_id: athleteId,
      session_type: payload.type || 'Other',
      date: payload.date || new Date().toISOString().split('T')[0],
      actual_mins: actualMins,
      actual_rpe: actualRpe,
      location: payload.location || 'Mobile Log',
      notes: payload.notes || ''
    });
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchSchedule = async (athleteName, email) => {
  try {
    const [sessRes, logRes] = await Promise.all([
      supabase.from('schedule_sessions')
        .select('id, date, session_type, proposed_mins, proposed_rpe, proposed_load, location, notes, athletes(name, email)')
        .order('date', { ascending: true }),
      supabase.from('session_logs')
        .select('id, session_id, date, session_type, actual_mins, actual_rpe, actual_load, location, notes, athletes(name, email)')
        .is('deleted_at', null)
        .order('date', { ascending: true })
    ]);
    if (sessRes.error || logRes.error) return { data: [] };

    const proposals = sessRes.data || [];
    const logs = logRes.data || [];

    // Row filter: no args = coach view (everything); otherwise match email OR name
    const matches = (rowEmail, rowName) => {
      if (!athleteName && !email) return true;
      if (email && rowEmail && rowEmail.toLowerCase() === email.toLowerCase()) return true;
      if (athleteName && rowName && rowName.toLowerCase() === athleteName.toLowerCase()) return true;
      return false;
    };

    const rows = [];
    const emit = (r) => {
      const rowName = r.athletes ? r.athletes.name : '';
      const rowEmail = r.athletes ? r.athletes.email : '';
      if (!matches(rowEmail, rowName)) return;
      rows.push([
        r.date ? `${r.date}T00:00:00` : '',
        rowEmail,
        rowName,
        r.session_type || '',
        r.proposed_mins ?? 0,
        r.proposed_rpe ?? 0,
        r.proposed_load ?? 0,
        r.actual_mins ?? 0,
        r.actual_rpe ?? 0,
        r.actual_load ?? 0,
        r.location || '',
        r.notes || '',
        r.row_id || ''
      ]);
    };

    // Proposals — merged with linked completion log if one exists.
    // The proposal row itself is never mutated; the merge is display-only.
    proposals.forEach(p => {
      const linked = logs.find(l => l.session_id === p.id) || null;
      emit({
        ...p,
        row_id: p.id,
        actual_mins: linked ? linked.actual_mins : null,
        actual_rpe: linked ? linked.actual_rpe : null,
        actual_load: linked ? linked.actual_load : null,
        location: linked ? linked.location : p.location,
        notes: linked ? linked.notes : p.notes
      });
    });

    // Standalone logs — manual entries (and any orphans)
    logs
      .filter(l => !l.session_id || !proposals.some(p => p.id === l.session_id))
      .forEach(l => emit({
        ...l,
        row_id: l.id,
        proposed_mins: null,
        proposed_rpe: null,
        proposed_load: null
      }));

    return { data: [SCHED_SHEET_HEADER, ...rows] };
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
// ==========================================
// LOGBOOK PIPES (Supabase) — Wave 1
// Wire shapes replicated exactly from the
// Apps Script handlers (v9.2-edit-audit).
// ==========================================

export const fetchLogbookByAthlete = async (athleteName) => {
  try {
    const athleteId = await resolveAthleteRow(athleteName);
    if (!athleteId) return { status: "Success", count: 0, data: [] };
    const { data, error } = await supabase
      .from('logbook_entries')
      .select('created_at, intensity_pct, metric_value, reps, exercises(exercise_name), programs(name)') // CHANGED
      .eq('athlete_id', athleteId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return { status: "Error", data: [] };
    const rows = (data || []).map(r => ({
      date: r.created_at,
      prog: r.programs ? r.programs.name : '',
      ex: r.exercises ? r.exercises.exercise_name : '', // CHANGED
      intensity: r.intensity_pct ?? 0,
      wt: r.metric_value ?? 0,
      reps: r.reps ?? 0
    }));
    return { status: "Success", count: rows.length, data: rows };
  } catch (err) { return { status: "Error", data: [] }; }
};
export const getLogbookByAthlete = fetchLogbookByAthlete;

export const getLatestMaxes = async (athleteName) => {
  try {
    const athleteId = await resolveAthleteRow(athleteName);
    if (!athleteId) return { status: "Success", count: 0, maxes: {} };
    const { data, error } = await supabase
      .from('athlete_maxes')
      .select('date, one_rm_kg, exercises(exercise_name)') // CHANGED
      .eq('athlete_id', athleteId)
      .is('deleted_at', null)
      .order('date', { ascending: false });
    if (error) return { status: "Error", maxes: {} };
    const maxes = {};
    for (const row of data || []) {
      const exercise = row.exercises ? row.exercises.exercise_name : null; // CHANGED
      const val = Number(row.one_rm_kg) || 0;
      if (exercise && val > 0 && !maxes[exercise]) maxes[exercise] = val;
    }
    return { status: "Success", count: Object.keys(maxes).length, maxes: maxes };
  } catch (err) { return { status: "Error", maxes: {} }; }
};

export const getLastLoggedWeight = async (athleteName, exerciseName) => {
  try {
    const athleteId = await resolveAthleteRow(athleteName);
    if (!athleteId) return { status: "NotFound" };
    const { data: exRow } = await supabase
      .from('exercises').select('id').ilike('exercise_name', exerciseName).limit(1); // CHANGED
    if (!exRow || exRow.length === 0) return { status: "NotFound" };
    const { data, error } = await supabase
      .from('logbook_entries')
      .select('created_at, intensity_pct, metric_value, reps, programs(name)')
      .eq('athlete_id', athleteId)
      .eq('exercise_id', exRow[0].id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return { status: "NotFound" };
    const r = data[0];
    return {
      status: "Success",
      date: r.created_at,
      program: r.programs ? r.programs.name : '',
      exercise: exerciseName,
      intensity: Number(r.intensity_pct) || 0,
      weight: Number(r.metric_value) || 0,
      reps: r.reps ?? 0
    };
  } catch (err) { return { status: "NotFound" }; }
};

// Fixed to accept both object syntax and standard arguments to prevent crashes
export const createAthlete = async (emailOrObj, nameStr) => {
  try {
    // Supabase handles athlete creation via login hooks, so this is just a stub for backwards compatibility
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const getAthleteByEmail = async (email) => {
  try {
    const { athletes } = await fetchAthletes();
    if (!athletes || athletes.length < 2) return { status: 'NotFound' };
    const lowerEmail = String(email).toLowerCase().trim();
    const row = athletes.slice(1).find(a => String(a[9]).toLowerCase().trim() === lowerEmail);
    
    if (!row) return { status: 'NotFound' };
    
    return {
      status: 'Success',
      name: row[0],
      athleteName: row[0],
      role: row[1],
      coachEmail: row[3] || '', // ← THIS WAS MISSING BEFORE
      headers: athletes[0],
      rowData: row
    };
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const saveSession = async (payload) => {
  try {
    const { data: byName } = await supabase.from('athletes').select('id').ilike('name', payload.athlete).limit(1);
    if (!byName || byName.length === 0) return { status: 'Error', message: 'Athlete not found' };
    const athleteId = byName[0].id;

    const { data: sessionLog, error: sErr } = await supabase.from('session_logs').insert({
      athlete_id: athleteId,
      session_type: payload.type || 'Gym Workout',
      date: payload.date || new Date().toISOString().split('T')[0],
      actual_mins: parseInt(payload.duration) || 0,
      actual_rpe: parseInt(payload.rpe) || 0,
      notes: payload.notes || ''
    }).select('id').single();

    if (sErr) return { status: 'Error', message: sErr.message };

    if (payload.sets && payload.sets.length > 0) {
      const { data: allExercises } = await supabase.from('exercises').select('id, exercise_name'); // CHANGED
      const { data: allPrograms } = await supabase.from('programs').select('id, name');
      
      const logbookInserts = [];
      
      for (const set of payload.sets) {
        const exRow = allExercises.find(e => e.exercise_name.toLowerCase() === (set.exercise || '').toLowerCase()); // CHANGED
        const progRow = allPrograms.find(p => p.name.toLowerCase() === (set.program || '').toLowerCase());
        
        if (!exRow) continue;
        
        logbookInserts.push({
          athlete_id: athleteId,
          date: payload.date || new Date().toISOString().split('T')[0],
          program_id: progRow ? progRow.id : null,
          exercise_id: exRow.id,
          intensity_pct: parseInt(set.intensity) || null,
          metric_value: parseFloat(set.weight) || null,
          reps: parseInt(set.reps) || null
        });
      }

      if (logbookInserts.length > 0) {
        const { error: lbErr } = await supabase.from('logbook_entries').insert(logbookInserts);
        if (lbErr) return { status: 'Error', message: lbErr.message };
      }
    }

    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export async function fetchExerciseLibrary(options = {}) {
  const { library } = await fetchLibrary();
  const lib = [];
  const rawLibrary = library || [];
  for (let i = 1; i < rawLibrary.length; i++) {
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
    const { error } = await supabase.from('programs').delete().eq('name', programName);
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const updateAssignment = async (athleteName, assignment) => {
  try {
    const { data: ath } = await supabase.from('athletes').select('id').eq('name', athleteName).single();
    if (!ath) return { status: 'Error', message: 'Athlete not found' };

    await supabase.from('assignments').update({ status: 'archived' }).eq('athlete_id', ath.id);

    if (!assignment) return { status: 'Success' };

    const progNames = assignment.split(',').map(s => s.trim()).filter(Boolean);
    const { data: progs } = await supabase.from('programs').select('id, name').in('name', progNames);
    if (!progs) return { status: 'Error', message: 'Programs not found' };

    const { data: { user } } = await supabase.auth.getUser();

    const inserts = progs.map(p => ({
      athlete_id: ath.id,
      program_id: p.id,
      assigned_by: user ? user.id : null,
      status: 'active'
    }));

    if (inserts.length > 0) {
      await supabase.from('assignments').insert(inserts);
    }
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const saveFullProgram = async (programRows) => {
  try {
    if (!programRows || programRows.length === 0) return { status: 'Error', message: 'No rows provided' };

    const { data: { user } } = await supabase.auth.getUser();
    const { data: exercises } = await supabase.from('exercises').select('id, exercise_name'); // CHANGED
    const exMap = {};
    (exercises || []).forEach(e => { exMap[e.exercise_name.toLowerCase()] = e.id; }); // CHANGED

    const firstRow = programRows[0];
    const progName = firstRow[0];
    const cat = firstRow[1] || 'Gym Workout';
    const notes = firstRow[9] || '';
    const privacy = (firstRow[10] || 'PUBLIC').toLowerCase();
    const mediaUrl = firstRow[12] || '';

    const { data: prog, error: pErr } = await supabase.from('programs').insert({
      name: progName,
      category: cat,
      privacy: privacy,
      notes: notes,
      media_url: mediaUrl,
      owner_user_id: user ? user.id : null
    }).select('id').single();

    if (pErr) return { status: 'Error', message: pErr.message };

    const peInserts = [];
    let sortOrder = 0;
    for (const r of programRows) {
      const exName = (r[3] || '').trim();
      if (!exName) continue;
      const exId = exMap[exName.toLowerCase()];
      if (!exId) continue;

      let adv = {};
      try { adv = typeof r[13] === 'string' ? JSON.parse(r[13]) : (r[13] || {}); } catch(e) {}

      peInserts.push({
        program_id: prog.id,
        exercise_id: exId,
        sort_order: sortOrder++,
        sets: parseInt(r[4]) || null,
        reps: r[5] || '',
        intensity_pct: parseInt(r[6]) || null,
        tempo: r[7] || '',
        rest: r[8] || '',
        phase: r[2] || 'Work Block',
        advanced: adv,
        notes: ''
      });
    }

    if (peInserts.length > 0) {
      const { error: peErr } = await supabase.from('program_exercises').insert(peInserts);
      if (peErr) return { status: 'Error', message: peErr.message };
    }

    return { status: 'Success' };
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const assignProgramBulk = async (athleteRows, programAssignment, columnId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Front end passes an array of row indices from the athletes table
    const { athletes: allAthletesRaw } = await fetchAthletes();
    const athleteNamesToAssign = [];
    athleteRows.forEach(rowIdx => {
      if (allAthletesRaw[rowIdx] && allAthletesRaw[rowIdx][0]) {
        athleteNamesToAssign.push(allAthletesRaw[rowIdx][0]);
      }
    });

    const { data: athletes } = await supabase.from('athletes').select('id, name');
    const programNames = programAssignment.split(',').map(s => s.trim()).filter(Boolean);
    const { data: programs } = await supabase.from('programs').select('id, name').in('name', programNames);

    if (!athletes || !programs) return { status: 'Error', message: 'Missing data' };
    
    const athleteIds = athletes.filter(a => athleteNamesToAssign.includes(a.name)).map(a => a.id);

    const inserts = [];
    for (const athId of athleteIds) {
      for (const prog of programs) {
        inserts.push({
          athlete_id: athId,
          program_id: prog.id,
          assigned_by: user ? user.id : null,
          status: 'active'
        });
      }
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('assignments').insert(inserts);
      if (error) return { status: 'Error', message: error.message };
    }

    return { status: 'Success', rowsUpdated: athleteIds.length };
  } catch (err) { return { status: 'Error', message: err.message }; }
};
export const assignProgramToAthletes = assignProgramBulk; 

export const addExerciseToLibrary = async (exerciseData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    let metricType = null;
    if (exerciseData.formula === 'yes' || exerciseData.formula === 'weight') metricType = 'weight';
    else if (exerciseData.formula === 'time') metricType = 'time';
    else if (exerciseData.formula === 'distance') metricType = 'distance';
    else if (exerciseData.formula === 'reps_only') metricType = 'reps_only';

    const { error } = await supabase.from('exercises').insert({
      exercise_name: exerciseData.name, // CHANGED
      muscle_category: exerciseData.muscle || 'Other',
      video_url: exerciseData.video || '',
      metric_type: metricType,
      is_public: false,
      owner_user_id: user ? user.id : null
    });
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const updateExerciseInLibrary = async (exerciseData) => {
  try {
    let metricType = null;
    if (exerciseData.formula === 'yes' || exerciseData.formula === 'weight') metricType = 'weight';
    else if (exerciseData.formula === 'time') metricType = 'time';
    else if (exerciseData.formula === 'distance') metricType = 'distance';
    else if (exerciseData.formula === 'reps_only') metricType = 'reps_only';

    const targetName = exerciseData.originalName || exerciseData.name;
    const { error } = await supabase.from('exercises')
      .update({
        exercise_name: exerciseData.name, // CHANGED
        muscle_category: exerciseData.muscle || 'Other',
        video_url: exerciseData.video || '',
        metric_type: metricType
      })
      .eq('exercise_name', targetName); // CHANGED
      
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// DELETE EXERCISE FUNCTION (missing from your api.js — add this now)
export const deleteExerciseFromLibrary = async (exerciseName) => {
  try {
    const { error } = await supabase.from('exercises').delete().eq('exercise_name', exerciseName);
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

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
    const { error: delErr } = await supabase.from('programs').delete().eq('name', oldName);
    if (delErr) return { status: 'Error', message: delErr.message };
    return await saveFullProgram(programRows);
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// ==========================================
// LOGBOOK EDIT & AUDIT PIPES (Step B+C)
// ==========================================
export const updateLogbookEntry = async ({ athlete, sessionDate, program, exercise, setNumber, field, newValue, editorEmail, editorRole }) => {
  try {
    const { data: ath } = await supabase.from('athletes').select('id').eq('name', athlete).single();
    if (!ath) return { status: 'Error', message: 'Athlete not found' };

    const { data: ex } = await supabase.from('exercises').select('id').eq('exercise_name', exercise).single(); // CHANGED
    if (!ex) return { status: 'Error', message: 'Exercise not found' };

    const { data: entries } = await supabase.from('logbook_entries')
      .select('id')
      .eq('athlete_id', ath.id)
      .eq('exercise_id', ex.id)
      .eq('date', sessionDate)
      .order('created_at', { ascending: true });

    if (!entries || entries.length < setNumber) return { status: 'Error', message: 'Entry not found' };

    const targetId = entries[setNumber - 1].id;
    const updateData = {};
    if (field === 'weight') updateData.metric_value = parseFloat(newValue) || 0;
    if (field === 'reps') updateData.reps = parseInt(newValue) || 0;
    if (field === 'intensity') updateData.intensity_pct = parseInt(newValue) || 0;

    const { error } = await supabase.from('logbook_entries').update(updateData).eq('id', targetId);
    if (error) return { status: 'Error', message: error.message };

    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchAuditLog = async (filters = {}) => {
  try {
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
    const { data, error } = await query;
    if (error) return { status: 'Error', message: error.message };
    
    const rows = (data || []).map(r => [
      r.created_at,
      r.table_name + ' updated',
      JSON.stringify(r.new_data),
      r.changed_by, // Return UUID since we can't join auth.users from frontend easily without a view
      'admin',
      '',
      ''
    ]);
    return { status: 'Success', data: rows };
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
  fetchWellnessLogs, saveScheduleSession, deleteScheduleSession, fetchSchedule, saveMedicalLog, 
  fetchMedicalLogs, fetchLogbookByAthlete, getLogbookByAthlete, getLatestMaxes, 
  getLastLoggedWeight, createAthlete, getAthleteByEmail, saveSession, 
  fetchExerciseLibrary, deleteProgram, updateAssignment, saveFullProgram, 
  assignProgramBulk, assignProgramToAthletes, addExerciseToLibrary, 
  deleteExerciseFromLibrary, updateExerciseInLibrary, fetchHelpVideos, 
  updateProgram, updateLogbookEntry, fetchAuditLog, getMediaType, 
  parseProgramsFromRaw, GOOGLE_SCRIPT_API_URL
};
export default api;
