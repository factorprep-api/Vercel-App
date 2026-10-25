import { supabase } from './supabase';

// Local-clock date helper — 'today' must be the user's actual calendar day,
// never the UTC day (an evening log is still 'today' locally).
import { ymd } from './utils/cycleMath';

// ==========================================
// LIGHTWEIGHT PIPES
// ==========================================
export const fetchAthletes = async () => {
  try {
    const { data: athletesData, error: aErr } = await supabase
      .from('athletes')
      .select('id, name, role, primary_club_id, user_id, coach_user_id, email, athlete_team_memberships(active_pods), assignments(status, expires_at, programs(name))');

    if (aErr) return { athletes: [], error: aErr.message };

    const ATHLETE_SHEET_HEADER = ['Name', 'Role', 'PrimaryClub', 'CoachName', 'C4', 'C5', 'C6', 'C7', 'C8', 'Email', 'C10', 'Active Pods', 'Program Assignment'];

    const coachEmailByUserId = {};
    (athletesData || []).forEach(a => {
      if (a.user_id && a.email) coachEmailByUserId[a.user_id] = a.email;
    });

    const rows = (athletesData || []).map(a => {
      const row = Array(13).fill('');
      row[0] = a.name || '';
      row[1] = a.role || '';
      row[2] = a.primary_club_id || '';
      row[9] = a.email || '';

      if (a.coach_user_id) {
        row[3] = coachEmailByUserId[a.coach_user_id] || '';
      }

      // v1.5.0: no default injection — actual granted pods only, so a lack
      // of pods means the hub hides the pod cards (see fetchMyPods union).
      if (a.athlete_team_memberships && a.athlete_team_memberships.length > 0) {
        const pods = a.athlete_team_memberships[0].active_pods;
        row[11] = (pods && pods.length > 0) ? pods.join(', ') : '';
      } else {
        row[11] = '';
      }
      if (a.assignments && a.assignments.length > 0) {
        row[12] = a.assignments
          .filter(asg => asg.status === 'active' && asg.programs
            && (!asg.expires_at || new Date(asg.expires_at).getTime() > Date.now()))
          .map(asg => asg.programs.name)
          .join(', ');
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
    // Local calendar day, not UTC — keeps the athlete's log on the day they logged
    const todayYMD = ymd(new Date());
    const logData = {
      grip_kg: num(payload.grip),
      feeling: num(payload.feeling),
      soreness: num(payload.soreness),
      sleep: num(payload.sleep),
      nutrition: num(payload.nutrition)
    };

    // Check if a wellness log already exists for this athlete today
    const { data: existing } = await supabase
      .from('wellness_logs')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('date', todayYMD)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      // Update today's existing log
      const { error } = await supabase
        .from('wellness_logs')
        .update(logData)
        .eq('id', existing.id);
      if (error) return { status: 'Error', message: error.message };
    } else {
      // Insert new log for today
      const { error } = await supabase
        .from('wellness_logs')
        .insert({
          athlete_id: athleteId,
          date: todayYMD,
          ...logData
        });
      if (error) return { status: 'Error', message: error.message };
    }

    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchWellnessLogs = async () => {
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
  } catch { return { data: [] }; }
};

// ==========================================
// CYCLE TRACKING PIPE (v1.6.0) — opt-in
// menstrual cycle logs (cycle_logs table).
// Same adapter conventions as wellness: save
// resolves the athlete, fetch emits legacy
// sheet-row shape (header first).
// ==========================================
const CYCLE_SHEET_HEADER = ['Date','Email','Athlete','Kind','ID'];

export const saveCycleLog = async (payload) => {
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

    const entryKind = payload.entryKind === 'missed_cycle' ? 'missed_cycle' : 'period_start';
    const entryDate = payload.date || new Date().toISOString().split('T')[0];

    // Guard against double-logging the same kind on the same day
    const { data: existing } = await supabase
      .from('cycle_logs')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('entry_kind', entryKind)
      .eq('entry_date', entryDate)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) return { status: 'Success', duplicate: true };

    const { error } = await supabase
      .from('cycle_logs')
      .insert({ athlete_id: athleteId, entry_kind: entryKind, entry_date: entryDate });
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchCycleLogs = async () => {
  try {
    const { data, error } = await supabase
      .from('cycle_logs')
      .select('entry_date, entry_kind, athletes(name, email)')
      .is('deleted_at', null)
      .order('entry_date', { ascending: true });
    if (error) return { data: [] };
    const rows = (data || []).map(c => [
      c.entry_date ? `${c.entry_date}T00:00:00` : '',
      c.athletes ? c.athletes.email : '',
      c.athletes ? c.athletes.name : '',
      c.entry_kind || 'period_start',
      c.id || ''
    ]);
    return { data: [CYCLE_SHEET_HEADER, ...rows] };
  } catch { return { data: [] }; }
};

// Soft-delete a cycle entry (athlete fixing a wrong date). RLS: athlete
// owns the row, admins may too.
export const deleteCycleLog = async (id) => {
  try {
    if (!id) return { status: 'Error', message: 'Missing entry ID.' };
    const { error } = await supabase
      .from('cycle_logs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// ==========================================
// NUTRITION POD PIPES (v1.8.2)
// ==========================================
// foods / v_food_scores are REFERENCE data (9,365 FNDDS + AUSNUT foods,
// scored over 17 directional nutrient axes — see scripts/nutrition_etl.mjs
// and scripts/simulate_scores.mjs).
// nutrition_logs stores items DENORMALIZED: each item carries the per-100g
// nutrient values + score captured at log time, so athlete/coach views
// compute daily totals client-side with zero joins (per plan §3).
// Item shape: { food_id, grams, name, portionLabel, kj100, protein100,
//               carbs100, fat100, fibre100, percentileScore, scoreAxes }
// raw_score is deliberately NOT in the client payload (view-only, for
// debug_scores.mjs): it is an audit/continuity figure, not a ranking.
// ==========================================

// Full food database for client-side search — the exercise-library pattern:
// load all 9,365 FNDDS + AUSNUT foods once (merged with their percentile
// scores), cache in localStorage, then pages filter instantly with
// multi-word tokens. Foods only change when the ETL re-imports, and the
// background refetch on every page load keeps the cache self-healing.
export const fetchFoodDatabase = async () => {
  try {
    const [foodsRes, scoresRes] = await Promise.all([
      supabase.from('foods').select('id, source, description, category, portion_label, portion_grams, energy_kj, protein_g, carbohydrate_g, fat_total_g, fibre_g').order('description', { ascending: true }),
      supabase.from('v_food_scores').select('id, percentile_score, score_axes, density_per_kj, score_axes_kj')
    ]);
    if (foodsRes.error) return { foods: [], error: foodsRes.error.message };
    if (scoresRes.error) return { foods: [], error: scoresRes.error.message };
    const scoreById = new Map((scoresRes.data || []).map(s => [s.id, s]));
    const foods = (foodsRes.data || []).map(f => ({
      id: f.id,
      description: f.description,
      source: f.source,
      category: f.category || '',
      portionLabel: f.portion_label || '',
      portionGrams: f.portion_grams != null ? Number(f.portion_grams) : null,
      kj100: f.energy_kj != null ? Number(f.energy_kj) : null,
      protein100: f.protein_g != null ? Number(f.protein_g) : null,
      carbs100: f.carbohydrate_g != null ? Number(f.carbohydrate_g) : null,
      fat100: f.fat_total_g != null ? Number(f.fat_total_g) : null,
      fibre100: f.fibre_g != null ? Number(f.fibre_g) : null,
      percentileScore: scoreById.get(f.id)?.percentile_score ?? null,
      scoreAxes: scoreById.get(f.id)?.score_axes ?? null,
      densityPerKj: scoreById.get(f.id)?.density_per_kj ?? null,
      scoreAxesKj: scoreById.get(f.id)?.score_axes_kj ?? null
    }));
    return { foods, error: null };
  } catch (err) { return { foods: [], error: err.message }; }
};

// ---- Favourites (v1.8.1): starred foods for one-tap repeat logging ----
// Same food shape as fetchFoodDatabase items so the page can treat them
// identically. Scores come from v_food_scores (no FK to a materialized
// view, so it's a second query keyed by id).
// NOTE: fat_total_g must be in the join — without it every favourite logged
// from a chip carried fat100: undefined, so fat totals silently under-counted.

export const fetchFoodFavorites = async () => {
  try {
    const { data, error } = await supabase
      .from('nutrition_favorites')
      .select('id, food_id, created_at, foods(description, source, category, portion_label, portion_grams, energy_kj, protein_g, carbohydrate_g, fat_total_g, fibre_g)')
      .order('created_at', { ascending: false });
    if (error) return { foods: [], error: error.message };
    const rows = data || [];
    const ids = rows.map(r => r.food_id).filter(Boolean);
    const scoreById = new Map();
    if (ids.length > 0) {
      const { data: scores, error: sErr } = await supabase
        .from('v_food_scores')
        .select('id, percentile_score, score_axes, density_per_kj, score_axes_kj')
        .in('id', ids);
      if (!sErr) (scores || []).forEach(s => scoreById.set(s.id, s));
    }
    const foods = rows
      .map(r => {
        const f = r.foods;
        if (!f) return null;
        return {
          id: r.food_id,
          description: f.description,
          source: f.source,
          category: f.category || '',
          portionLabel: f.portion_label || '',
          portionGrams: f.portion_grams != null ? Number(f.portion_grams) : null,
          kj100: f.energy_kj != null ? Number(f.energy_kj) : null,
          protein100: f.protein_g != null ? Number(f.protein_g) : null,
          carbs100: f.carbohydrate_g != null ? Number(f.carbohydrate_g) : null,
          fat100: f.fat_total_g != null ? Number(f.fat_total_g) : null,
          fibre100: f.fibre_g != null ? Number(f.fibre_g) : null,
          percentileScore: scoreById.get(r.food_id)?.percentile_score ?? null,
          scoreAxes: scoreById.get(r.food_id)?.score_axes ?? null,
          densityPerKj: scoreById.get(r.food_id)?.density_per_kj ?? null,
          scoreAxesKj: scoreById.get(r.food_id)?.score_axes_kj ?? null
        };
      })
      .filter(Boolean);
    return { foods, error: null };
  } catch (err) { return { foods: [], error: err.message }; }
};

export const addFoodFavorite = async (foodId) => {
  try {
    if (!foodId) return { status: 'Error', message: 'Missing food ID.' };
    let athleteId = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: mine } = await supabase.from('athletes').select('id').eq('user_id', user.id).maybeSingle();
      if (mine) athleteId = mine.id;
    }
    if (!athleteId) return { status: 'Error', message: 'Athlete not found' };
    const { error } = await supabase
      .from('nutrition_favorites')
      .upsert({ athlete_id: athleteId, food_id: foodId }, { onConflict: 'athlete_id,food_id', ignoreDuplicates: true });
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const removeFoodFavorite = async (foodId) => {
  try {
    if (!foodId) return { status: 'Error', message: 'Missing food ID.' };
    // RLS (nf_delete) restricts the delete to the owning athlete.
    const { error } = await supabase
      .from('nutrition_favorites')
      .delete()
      .eq('food_id', foodId);
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// ---- Meal archetypes (v1.9): the three-tap meal path ----
// One round-trip of five small reference queries, merged client-side:
//   meal_archetypes        — id/name/meal_slots/display_order (active only)
//   v_archetype_scores     — weighted percentile_score + density_per_kj
//   v_archetype_nutrients  — kJ/protein/carbs/fat/fibre per NORMAL serve
//   quality_tier_modifiers — five tier multipliers (§5.2)
//   portion_size_scalars   — small/normal/large multipliers (worksheet §4)
// All reference data: no user scoping, RLS grants read to authenticated.
// The UI resolves grams at log time as base_grams × portion multiplier and
// snapshots the multipliers on the item (§5.3), so retuning the tables
// later never rewrites logged history.
export const fetchMealArchetypes = async () => {
  try {
    const [metaRes, scoresRes, nutrientsRes, tiersRes, portionsRes] = await Promise.all([
      supabase.from('meal_archetypes').select('id, slug, name, meal_slots, display_order').eq('active', true),
      supabase.from('v_archetype_scores').select('archetype_id, percentile_score, density_per_kj, component_count, scored_components'),
      supabase.from('v_archetype_nutrients').select('archetype_id, base_grams, energy_kj, protein_g, carbohydrate_g, fat_g, fibre_g'),
      supabase.from('quality_tier_modifiers').select('tier, score_multiplier, display_badge'),
      supabase.from('portion_size_scalars').select('portion_size, multiplier')
    ]);
    const firstErr = [metaRes, scoresRes, nutrientsRes, tiersRes, portionsRes].find(r => r.error)?.error;
    if (firstErr) return { archetypes: [], tiers: [], portions: [], error: firstErr.message };
    const scoreById = new Map((scoresRes.data || []).map(s => [s.archetype_id, s]));
    const nutById = new Map((nutrientsRes.data || []).map(n => [n.archetype_id, n]));
    const archetypes = (metaRes.data || [])
      .map(m => {
        const s = scoreById.get(m.id);
        const n = nutById.get(m.id);
        return {
          id: m.id,
          slug: m.slug,
          name: m.name,
          mealSlots: Array.isArray(m.meal_slots) ? m.meal_slots : [],
          displayOrder: m.display_order,
          baseGrams: n?.base_grams != null ? Number(n.base_grams) : null,
          energyKj: n?.energy_kj != null ? Number(n.energy_kj) : null,
          proteinG: n?.protein_g != null ? Number(n.protein_g) : null,
          carbsG: n?.carbohydrate_g != null ? Number(n.carbohydrate_g) : null,
          fatG: n?.fat_g != null ? Number(n.fat_g) : null,
          fibreG: n?.fibre_g != null ? Number(n.fibre_g) : null,
          percentileScore: s?.percentile_score != null ? Number(s.percentile_score) : null,
          densityPerKj: s?.density_per_kj != null ? Number(s.density_per_kj) : null,
          componentCount: s?.component_count != null ? Number(s.component_count) : null,
          scoredComponents: s?.scored_components != null ? Number(s.scored_components) : null
        };
      })
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || a.name.localeCompare(b.name));
    const tiers = (tiersRes.data || [])
      .map(t => ({ tier: t.tier, scoreMultiplier: Number(t.score_multiplier), badge: t.display_badge }))
      .sort((a, b) => a.scoreMultiplier - b.scoreMultiplier);
    const portions = (portionsRes.data || [])
      .map(p => ({ portionSize: p.portion_size, multiplier: Number(p.multiplier) }))
      .sort((a, b) => a.multiplier - b.multiplier);
    return { archetypes, tiers, portions, error: null };
  } catch (err) { return { archetypes: [], tiers: [], portions: [], error: err.message }; }
};

// Append items to today's free-form nutrition log (creates the day's row on
// first save, merges into it afterwards). Date is the LOCAL calendar day —
// the same ymd() fix that keeps wellness logs on the athlete's actual day.
// sessionLogId is reserved for session-anchored fueling (plan §7.1); the
// athlete UI passes null for now.
export const saveNutritionLog = async ({ items, athlete, sessionLogId, date }) => {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return { status: 'Error', message: 'Nothing to log.' };
    }
    let athleteId = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: mine } = await supabase.from('athletes').select('id').eq('user_id', user.id).maybeSingle();
      if (mine) athleteId = mine.id;
    }
    if (!athleteId && athlete) {
      const { data: byName } = await supabase.from('athletes').select('id').ilike('name', athlete).limit(1);
      if (byName && byName.length > 0) athleteId = byName[0].id;
    }
    if (!athleteId) return { status: 'Error', message: 'Athlete not found' };

    const entryDate = date || ymd(new Date());

    // Find today's free-form row (session-anchored entries live separately)
    let q = supabase
      .from('nutrition_logs')
      .select('id, items')
      .eq('athlete_id', athleteId)
      .eq('entry_date', entryDate)
      .is('deleted_at', null);
    if (sessionLogId) q = q.eq('session_log_id', sessionLogId);
    else q = q.is('session_log_id', null);
    const { data: found } = await q.maybeSingle();
    const existing = found;

    if (existing) {
      const merged = [...(Array.isArray(existing.items) ? existing.items : []), ...items];
      const { error } = await supabase
        .from('nutrition_logs')
        .update({ items: merged })
        .eq('id', existing.id);
      if (error) return { status: 'Error', message: error.message };
      return { status: 'Success', items: merged };
    }

    const { data: inserted, error } = await supabase
      .from('nutrition_logs')
      .insert({
        athlete_id: athleteId,
        entry_date: entryDate,
        session_log_id: sessionLogId || null,
        items
      })
      .select('id, items')
      .single();
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success', items: inserted ? inserted.items : items };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// Rewrite the items array of a specific log row (used by the per-item delete
// in the athlete UI). RLS (nl_update) only allows the owning athlete.
export const updateNutritionItems = async (logId, items) => {
  try {
    if (!logId) return { status: 'Error', message: 'Missing log ID.' };
    const { error } = await supabase
      .from('nutrition_logs')
      .update({ items })
      .eq('id', logId);
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// Recent nutrition logs visible to the signed-in user (RLS handles scoping:
// athletes see their own, coaches see their athletes'). Joins the athlete's
// name so coach pages can attribute logs. Items are denormalized, so views
// compute totals client-side. sessionLogId present on session-anchored entries.
export const fetchNutritionLogs = async (days = 30) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabase
      .from('nutrition_logs')
      .select('id, entry_date, session_log_id, items, notes, athlete_id, athletes(name)')
      .is('deleted_at', null)
      .gte('entry_date', ymd(since))
      .order('entry_date', { ascending: false });
    if (error) return { logs: [], error: error.message };
    return {
      logs: (data || []).map(l => ({
        id: l.id,
        athleteId: l.athlete_id,
        athleteName: l.athletes ? l.athletes.name : null,
        date: l.entry_date,
        sessionLogId: l.session_log_id,
        items: Array.isArray(l.items) ? l.items : [],
        notes: l.notes
      })),
      error: null
    };
  } catch (err) { return { logs: [], error: err.message }; }
};

// ==========================================
// SCHEDULE PIPE (Supabase) — proposals in
// schedule_sessions, completions/manual logs in
// session_logs, linked by session_id.
// Read adapter emits the legacy sheet row shape
// (positional arrays, header first, r[0]..r[16])
// so existing pages keep working unchanged.
// ==========================================
const SCHED_SHEET_HEADER = ['Date','Email','Athlete','Type','Proposed Mins','Proposed RPE','Proposed Load','Actual Mins','Actual RPE','Actual Load','Location','Notes','ID','Attached Program','Log ID','Log Date','Log Type'];

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
      // Record completion on the actual execution date (payload.date) if provided,
      // defaulting to today's date so load reflects when the athlete physically performed it.
      const actualDate = payload.date || new Date().toISOString().split('T')[0];

      // NOTE: actual_load is a GENERATED column in session_logs — never insert it;
      // the database computes it from actual_mins × actual_rpe automatically.
      const { error } = await supabase.from('session_logs').insert({
        session_id: prop.id,
        athlete_id: prop.athlete_id,
        team_id: prop.team_id,
        session_type: prop.session_type,
        date: actualDate,
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
      const insertData = {
        athlete_id: athleteId,
        date: payload.date || new Date().toISOString().split('T')[0],
        session_type: payload.type || 'Other',
        proposed_mins: proposedMins,
        proposed_rpe: proposedRpe,
        proposed_load: proposedMins * proposedRpe,
        location: payload.location || '',
        notes: payload.notes || ''
      };
      if (payload.attachedProgramId) insertData.attached_program_id = payload.attachedProgramId;

      const { data: insRow, error } = await supabase.from('schedule_sessions').insert(insertData).select('id').single();
      if (error) return { status: 'Error', message: error.message };

      // --- TRANSIENT ASSIGNMENT ---
      // Attaching a program to a proposed session is a temporary assignment:
      // the athlete can open it in Program Viewer until the session expires
      // (3-day Upcoming rule). expires_at = session date + 4 days mirrors that
      // rule exactly under the RLS check (expires_at > now() with date semantics).
      // Permanent assignments (Program Library) never set expires_at and are untouched.
      if (payload.attachedProgramId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const expiry = new Date(insertData.date);
          expiry.setDate(expiry.getDate() + 4);
          const { error: asgErr } = await supabase.from('assignments').insert({
            athlete_id: athleteId,
            program_id: payload.attachedProgramId,
            assigned_by: user ? user.id : null,
            expires_at: expiry.toISOString().split('T')[0],
            status: 'active',
            source_session_id: insRow.id
          });
          if (asgErr) console.warn('Transient assignment warning:', asgErr.message);
        } catch (asgE) { console.warn('Transient assignment warning:', asgE.message); }
      }
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

// ==========================================
// DISCREET SESSION EDIT — long-press / right-click on a session card.
// RLS does the ownership check (sl_update / ss_update); the DB audit
// triggers record exactly WHAT changed. actual_load is a GENERATED
// column on session_logs — never written here.
// ==========================================

// Edit an athlete's own completion log (manual logs AND completions of
// proposed sessions — pass the session_logs id, not the proposal id).
export const updateSessionLog = async (logId, fields) => {
  try {
    if (!logId) return { status: 'Error', message: 'Missing log ID.' };
    const patch = {
      audit_mode: 'modified',
      audit_notes: fields.auditNotes || 'Edited by athlete'
    };
    if (fields.date) patch.date = fields.date;
    if (fields.type) patch.session_type = fields.type;
    if (fields.actualMins !== undefined && fields.actualMins !== '') patch.actual_mins = parseInt(fields.actualMins) || 0;
    if (fields.actualRpe !== undefined && fields.actualRpe !== '') patch.actual_rpe = parseInt(fields.actualRpe) || 0;
    if (fields.notes !== undefined) patch.notes = fields.notes;

    const { error } = await supabase.from('session_logs').update(patch).eq('id', logId);
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// Edit a proposed session's planned details (date/type/planned load).
// Works for both coach-authored proposals (athlete correcting what was
// planned) and athlete-authored ones. proposed_load is stored denormalised
// (not generated), so it is recomputed alongside mins × rpe.
export const updateScheduleProposal = async (sessionId, fields) => {
  try {
    if (!sessionId) return { status: 'Error', message: 'Missing session ID.' };
    const patch = {};
    if (fields.date) patch.date = fields.date;
    if (fields.type) patch.session_type = fields.type;
    if (fields.proposedMins !== undefined && fields.proposedMins !== '') {
      patch.proposed_mins = parseInt(fields.proposedMins) || 0;
    }
    if (fields.proposedRpe !== undefined && fields.proposedRpe !== '') {
      patch.proposed_rpe = parseInt(fields.proposedRpe) || 0;
    }
    if (patch.proposed_mins !== undefined || patch.proposed_rpe !== undefined) {
      patch.proposed_load = (patch.proposed_mins !== undefined ? patch.proposed_mins : parseInt(fields.proposedMins) || 0)
        * (patch.proposed_rpe !== undefined ? patch.proposed_rpe : parseInt(fields.proposedRpe) || 0);
    }
    if (fields.notes !== undefined) patch.notes = fields.notes;

    const { error } = await supabase.from('schedule_sessions').update(patch).eq('id', sessionId);
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const fetchSchedule = async (athleteName, email) => {
  try {
    const [sessRes, logRes] = await Promise.all([
      supabase.from('schedule_sessions')
        .select('id, date, session_type, proposed_mins, proposed_rpe, proposed_load, location, notes, attached_program_id, programs(name), athletes(name, email)')
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
        r.row_id || '',
        r.programs ? (r.programs.name || '') : '',
        r.log_id || '',
        r.log_date || '',
        r.log_type || ''
      ]);
    };

    // Proposals — merged with linked completion log if one exists.
    // The proposal row itself is never mutated; the merge is display-only.
    // log_id (col 15) exposes the linked session_logs id for the athlete's
    // discreet edit; r[12] stays the proposal id for the coach tooling.
    proposals.forEach(p => {
      const linked = logs.find(l => l.session_id === p.id) || null;
      emit({
        ...p,
        row_id: p.id,
        log_id: linked ? linked.id : '',
        log_date: linked ? linked.date : '',
        log_type: linked ? linked.session_type : '',
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
        log_id: l.id,
        log_date: l.date || '',
        log_type: l.session_type || '',
        proposed_mins: null,
        proposed_rpe: null,
        proposed_load: null
      }));

    return { data: [SCHED_SHEET_HEADER, ...rows] };
  } catch { return { data: [] }; }
};

// Programs a coach may attach to a proposed session: the public library
// plus their own private library. RLS already limits the visible set;
// we additionally filter to public OR owned so a coach never attaches
// someone else's private program (e.g. one assigned to them as an athlete).
export const fetchAttachablePrograms = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('programs')
      .select('id, name, category, privacy, owner_user_id')
      .order('name', { ascending: true });
    if (error) return { programs: [], error: error.message };

    const seen = new Set();
    const list = [];
    (data || []).forEach(p => {
      const name = String(p.name || '').trim();
      if (!name || seen.has(name)) return;
      if (p.privacy !== 'public' && p.owner_user_id !== (user ? user.id : null)) return;
      seen.add(name);
      list.push({ id: p.id, name, category: p.category || '', privacy: p.privacy || 'public' });
    });
    return { programs: list, error: null };
  } catch (err) { return { programs: [], error: err.message }; }
};

// Maps medical_entries rows back into the legacy sheet row shape
// (positional arrays, header first) so existing pages keep working.
const MED_SHEET_HEADER = ['Date Logged','Email','Athlete','Body Part','Pain Level','Mechanism','Training Status','Notes','Is Resolved','Date Resolved','Injury Grade'];

export const fetchMedicalLogs = async () => {
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
  } catch { return { data: [] }; }
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
  } catch { return { status: "Error", data: [] }; }
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
  } catch { return { status: "Error", maxes: {} }; }
};

// Manually save a 1RM value for an athlete/exercise (coach or athlete entry).
// Inserts a new dated row — the newest row per exercise wins in getLatestMaxes,
// so history is preserved. RLS already permits coach/athlete writes.
export const saveAthleteMax = async (athleteName, exerciseName, oneRmKg, date) => {
  try {
    const athleteId = await resolveAthleteRow(athleteName);
    if (!athleteId) return { status: 'Error', message: 'Athlete not found' };
    const val = parseFloat(oneRmKg);
    if (!Number.isFinite(val) || val <= 0) return { status: 'Error', message: 'Please enter a valid 1RM value.' };
    const { data: exRow, error: exErr } = await supabase
      .from('exercises').select('id').ilike('exercise_name', exerciseName).limit(1);
    if (exErr) return { status: 'Error', message: exErr.message };
    if (!exRow || exRow.length === 0) return { status: 'Error', message: 'Exercise not found.' };
    const { error } = await supabase.from('athlete_maxes').insert({
      athlete_id: athleteId,
      exercise_id: exRow[0].id,
      date: date || new Date().toISOString().split('T')[0],
      one_rm_kg: Math.round(val * 10) / 10
    });
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
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
  } catch { return { status: "NotFound" }; }
};

// Fixed to accept both object syntax and standard arguments to prevent crashes
export const createAthlete = async () => ({ status: 'Success' });

export const getAthleteByEmail = async (email) => {
  try {
    if (!email) return { status: 'NotFound' };
    const lowerEmail = String(email).toLowerCase().trim();

    // Query public.athletes directly using auth.uid() OR matching email
    const { data: { user } } = await supabase.auth.getUser();

    let athQuery = supabase
      .from('athletes')
      .select('id, name, role, email, user_id, coach_user_id, athlete_team_memberships(active_pods), assignments(status, expires_at, programs(name))');

    if (user && user.id) {
      athQuery = athQuery.or(`user_id.eq.${user.id},email.ilike.${lowerEmail}`);
    } else {
      athQuery = athQuery.ilike('email', lowerEmail);
    }

    const { data: athRow, error: athErr } = await athQuery.limit(1);

    if (!athErr && athRow && athRow.length > 0) {
      const a = athRow[0];
      const role = a.role || 'athlete';

      let coachEmail = '';
      if (a.coach_user_id) {
        const { data: coachRow } = await supabase
          .from('athletes')
          .select('email')
          .eq('user_id', a.coach_user_id)
          .limit(1);
        if (coachRow && coachRow.length > 0) coachEmail = coachRow[0].email || '';
      }

      // Real pods from athlete_team_memberships. v1.5.0: no default —
      // purchased pods are unioned separately via fetchMyPods().
      let pods = '';
      if (a.athlete_team_memberships && a.athlete_team_memberships.length > 0) {
        const p = a.athlete_team_memberships[0].active_pods;
        if (p && p.length > 0) pods = p.join(', ');
      }

      // Real program assignment from assignments relation
      let programAssignment = '';
      if (a.assignments && a.assignments.length > 0) {
        programAssignment = a.assignments
          .filter(asg => asg.status === 'active' && asg.programs
            && (!asg.expires_at || new Date(asg.expires_at).getTime() > Date.now()))
          .map(asg => asg.programs.name)
          .join(', ');
      }

      return {
        status: 'Success',
        name: a.name,
        athleteName: a.name,
        role,
        coachEmail,
        headers: ['Name', 'Role', 'PrimaryClub', 'CoachName', 'C4', 'C5', 'C6', 'C7', 'C8', 'Email', 'C10', 'Active Pods', 'Program Assignment'],
        rowData: [a.name, role, '', coachEmail, '', '', '', '', '', a.email, '', pods, programAssignment]
      };
    }

    return { status: 'NotFound' };
  } catch (err) {
    return { status: 'Error', message: err.message };
  }
};

export const saveSession = async (payload) => {
  try {
    const { data: byName } = await supabase.from('athletes').select('id').ilike('name', payload.athlete).limit(1);
    if (!byName || byName.length === 0) return { status: 'Error', message: 'Athlete not found' };
    const athleteId = byName[0].id;

    const { error: sErr } = await supabase.from('session_logs').insert({
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

      // === 1RM AUTO-CAPTURE (Epley, direction A) ===
      // Only sets prescribed at 100% intensity may write a 1RM:
      // est1RM = weight x (1 + 0.0333 x reps). Sub-max sets (80/90/95%)
      // never touch the max. Saved only when it beats the athlete's
      // current latest 1RM for that exercise (protects coach-entered maxes).
      try {
        const capSets = payload.sets.filter(s => {
          const pct = parseFloat(String(s.intensity || '').replace('%', ''));
          return pct === 100 && parseFloat(s.weight) > 0;
        });
        for (const s of capSets) {
          const exRow = allExercises.find(e => e.exercise_name.toLowerCase() === (s.exercise || '').toLowerCase());
          if (!exRow) continue;
          const repsNum = parseFloat(String(s.reps)) || 0;
          if (repsNum <= 0) continue;
          const est1RM = parseFloat(s.weight) * (1 + 0.0333 * repsNum);
          const { data: curMax } = await supabase
            .from('athlete_maxes')
            .select('one_rm_kg')
            .eq('athlete_id', athleteId)
            .eq('exercise_id', exRow.id)
            .is('deleted_at', null)
            .order('date', { ascending: false })
            .limit(1);
          const curVal = curMax && curMax.length > 0 ? Number(curMax[0].one_rm_kg) || 0 : 0;
          if (est1RM <= curVal) continue;
          await supabase.from('athlete_maxes').insert({
            athlete_id: athleteId,
            exercise_id: exRow.id,
            date: payload.date || new Date().toISOString().split('T')[0],
            one_rm_kg: Math.round(est1RM * 10) / 10
          });
        }
      } catch (maxErr) { console.warn('1RM auto-capture skipped:', maxErr); }
    }

    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export async function fetchExerciseLibrary() {
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
      try { adv = typeof r[13] === 'string' ? JSON.parse(r[13]) : (r[13] || {}); } catch { /* ignore */ }

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

export const assignProgramBulk = async (athleteRows, programAssignment) => {
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
  } catch { return []; }
};

export const updateProgram = async (oldName, programRows) => {
  try {
    const { error: delErr } = await supabase.from('programs').delete().eq('name', oldName);
    if (delErr) return { status: 'Error', message: delErr.message };
    return await saveFullProgram(programRows);
  } catch { return { status: 'Error', message: 'Failed to update program' }; }
};

// ==========================================
// LOGBOOK EDIT & AUDIT PIPES (Step B+C)
// ==========================================
export const updateLogbookEntry = async ({ athlete, sessionDate, exercise, setNumber, field, newValue }) => {
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

export const fetchAuditLog = async () => {
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
// SHOP PIPES (v1.5.0) — Paddle catalog + entitlements
// ==========================================
export const fetchShopProducts = async (includeInactive = false) => {
  try {
    let q = supabase
      .from('shop_products')
      .select('id, slug, name, blurb, product_type, fulfilment, paddle_price_id, linked_program_id, price_display, price_usd, grants_pods, grants_coach_role, is_active, sort_order')
      .order('sort_order', { ascending: true });
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) return { products: [], error: error.message };
    return { products: data || [], error: null };
  } catch (err) { return { products: [], error: err.message }; }
};

// The signed-in athlete's entitlement rows (RLS: own rows only).
export const fetchMyEntitlements = async () => {
  try {
    const { data, error } = await supabase
      .from('user_entitlements')
      .select('id, product_id, status, purchased_at, canceled_at, shop_products(name, slug, product_type, grants_pods, grants_coach_role)')
      .in('status', ['active', 'lifetime', 'past_due']);
    if (error) return { entitlements: [], error: error.message };
    return { entitlements: data || [], error: null };
  } catch (err) { return { entitlements: [], error: err.message }; }
};

// Pod names unlocked purely by purchase (RPC, see functions.sql v1.5.0).
export const fetchEntitledPods = async () => {
  try {
    const { data, error } = await supabase.rpc('viewer_entitled_pods');
    if (error) return { pods: [], error: error.message };
    return { pods: (data || []).map(p => String(p).toLowerCase().trim()).filter(Boolean), error: null };
  } catch (err) { return { pods: [], error: err.message }; }
};

// FINAL pods for the signed-in athlete:
//   granted   (admin-set athlete_team_memberships.active_pods)
//   ∪ purchased (user_entitlements via viewer_entitled_pods)
// No defaults anywhere — no access means no pod cards in the whole app.
export const fetchMyPods = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { pods: [], error: 'Not signed in' };

    const [athRes, entRes] = await Promise.all([
      supabase.from('athletes')
        .select('id, athlete_team_memberships(active_pods)')
        .eq('user_id', user.id)
        .limit(1),
      fetchEntitledPods()
    ]);

    if (athRes.error) return { pods: [], error: athRes.error.message };

    const granted = ((athRes.data?.[0]?.athlete_team_memberships) || [])
      .flatMap(m => m.active_pods || []);
    const purchased = entRes.pods || [];

    const pods = Array.from(new Set(
      [...granted, ...purchased].map(p => String(p).toLowerCase().trim()).filter(Boolean)
    ));
    return { pods, error: null };
  } catch (err) { return { pods: [], error: err.message }; }
};

// ---------- ADMIN PIPES (/manage-shop) — RLS: single shop admin ----------
// Shop governance is locked to ONE account (crusty@hotmail.com) via the
// is_shop_admin() DB function — see shop_admin_v1.5.1.sql. Club admins
// (coach promotions) no longer imply shop powers.
export const isShopAdmin = async () => {
  try {
    const { data, error } = await supabase.rpc('is_shop_admin');
    if (error) return { isAdmin: false, error: error.message };
    return { isAdmin: data === true, error: null };
  } catch (err) { return { isAdmin: false, error: err.message }; }
};

export const adminListShopProducts = async () => fetchShopProducts(true);

export const adminUpsertShopProduct = async (product) => {
  try {
    const { data, error } = await supabase
      .from('shop_products')
      .upsert(product, { onConflict: 'slug' })
      .select()
      .single();
    if (error) return { product: null, error: error.message };
    return { product: data, error: null };
  } catch (err) { return { product: null, error: err.message }; }
};

export const adminDeleteShopProduct = async (productId) => {
  try {
    const { error } = await supabase.from('shop_products').delete().eq('id', productId);
    return { error: error ? error.message : null };
  } catch (err) { return { error: err.message }; }
};

export const adminListAthletes = async () => {
  try {
    const { data, error } = await supabase
      .from('athletes')
      .select('id, name, email, role, primary_club_id')
      .order('name', { ascending: true });
    if (error) return { athletes: [], error: error.message };
    return { athletes: data || [], error: null };
  } catch (err) { return { athletes: [], error: err.message }; }
};

export const adminListEntitlements = async () => {
  try {
    const { data, error } = await supabase
      .from('user_entitlements')
      .select('id, athlete_id, product_id, status, purchased_at, canceled_at, athletes(name, email), shop_products(name, slug, product_type)')
      .order('purchased_at', { ascending: false });
    if (error) return { entitlements: [], error: error.message };
    return { entitlements: data || [], error: null };
  } catch (err) { return { entitlements: [], error: err.message }; }
};

// Admin-granted entitlement (comp pods, manual Team/Club fulfilment).
// Always 'lifetime' — admin grants are permanent until revoked.
export const adminGrantEntitlement = async (athleteId, productId) => {
  try {
    const { data, error } = await supabase
      .from('user_entitlements')
      .upsert(
        { athlete_id: athleteId, product_id: productId, status: 'lifetime' },
        { onConflict: 'athlete_id,product_id' }
      )
      .select()
      .single();
    if (error) return { entitlement: null, error: error.message };
    return { entitlement: data, error: null };
  } catch (err) { return { entitlement: null, error: err.message }; }
};

export const adminRevokeEntitlement = async (entitlementId) => {
  try {
    const { error } = await supabase.from('user_entitlements').delete().eq('id', entitlementId);
    return { error: error ? error.message : null };
  } catch (err) { return { error: err.message }; }
};

// ==========================================
// TREATMENT POD (v1.7.0) — club therapists,
// availability slots and bookings.
// Therapists = athletes with role 'therapist' + a club_therapists
// profile row. Bookings link to injuries via medical_entries.injury_id.
// ==========================================

// Signed-in user's athletes row (id / role / primary club anchor).
export const fetchCurrentAthlete = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { athlete: null, error: 'Not signed in' };
    const { data, error } = await supabase
      .from('athletes')
      .select('id, name, role, primary_club_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return { athlete: null, error: error.message };
    return { athlete: data || null, error: null };
  } catch (err) { return { athlete: null, error: err.message }; }
};

// My therapist profile (club_therapists row), if any.
export const fetchMyTherapistProfile = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { profile: null, error: 'Not signed in' };
    const { data: mine } = await supabase.from('athletes').select('id').eq('user_id', user.id).maybeSingle();
    if (!mine) return { profile: null, error: null };
    const { data, error } = await supabase
      .from('club_therapists')
      .select('id, specialty, default_duration_mins, bio, is_active')
      .eq('athlete_id', mine.id)
      .maybeSingle();
    if (error) return { profile: null, error: error.message };
    return { profile: data || null, error: null };
  } catch (err) { return { profile: null, error: err.message }; }
};

// Create/update my own therapist profile (self-setup after role promotion).
export const upsertMyTherapistProfile = async ({ specialty, defaultDurationMins, bio }) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { status: 'Error', message: 'Not signed in' };
    const { data: mine } = await supabase.from('athletes').select('id').eq('user_id', user.id).maybeSingle();
    if (!mine) return { status: 'Error', message: 'Athlete record not found — ask your club admin.' };
    const payload = {
      athlete_id: mine.id,
      specialty: specialty || 'Physiotherapist',
      default_duration_mins: parseInt(defaultDurationMins) || 45,
      bio: bio || '',
      is_active: true
    };
    const { error } = await supabase.from('club_therapists').upsert(payload, { onConflict: 'athlete_id' });
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// Active therapists at a club (for the booking picker + staff lists).
export const fetchClubTherapists = async (clubId, includeInactive = false) => {
  try {
    if (!clubId) return { data: [], error: 'No club selected.' };
    let q = supabase
      .from('club_therapists')
      .select('id, specialty, default_duration_mins, bio, is_active, athletes(id, name, email, primary_club_id)')
      .eq('athletes.primary_club_id', clubId);
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) return { data: [], error: error.message };
    const rows = (data || []).sort((a, b) => String(a.athletes?.name || '').localeCompare(String(b.athletes?.name || '')));
    return { data: rows, error: null };
  } catch (err) { return { data: [], error: err.message }; }
};

// CLUB ADMIN: add a therapist by email (they must have signed up first).
// Also promotes their role to 'therapist' when the caller has the rights;
// role promotion failure is non-fatal (the profile is what unlocks
// availability management — see treatment_pod_v1.7.0.sql).
export const adminAddTherapist = async ({ email, specialty, defaultDurationMins }) => {
  try {
    if (!email) return { status: 'Error', message: 'Email is required.' };
    const { data: ath, error: athErr } = await supabase
      .from('athletes')
      .select('id, name, primary_club_id, role')
      .ilike('email', String(email).toLowerCase().trim())
      .maybeSingle();
    if (athErr) return { status: 'Error', message: athErr.message };
    if (!ath) return { status: 'Error', message: 'No signed-up member with that email. Ask them to sign up first.' };
    if (!ath.primary_club_id) return { status: 'Error', message: 'That member has no primary club set — set it in the admin panel first.' };

    const { error: insErr } = await supabase.from('club_therapists').upsert({
      athlete_id: ath.id,
      specialty: specialty || 'Physiotherapist',
      default_duration_mins: parseInt(defaultDurationMins) || 45,
      is_active: true
    }, { onConflict: 'athlete_id' });
    if (insErr) return { status: 'Error', message: insErr.message };

    if (ath.role !== 'therapist') {
      const { error: roleErr } = await supabase.from('athletes').update({ role: 'therapist' }).eq('id', ath.id);
      if (roleErr) console.warn('Role promotion skipped:', roleErr.message);
    }
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// CLUB ADMIN: deactivate/reactivate a therapist (keeps history).
export const adminSetTherapistActive = async (therapistId, isActive) => {
  try {
    const { error } = await supabase.from('club_therapists').update({ is_active: !!isActive }).eq('id', therapistId);
    return { error: error ? error.message : null };
  } catch (err) { return { error: err.message }; }
};

// Availability slots. therapistId filters to one therapist; clubId shows
// the whole club (staff view). fromDate defaults to today.
export const fetchTherapistSlots = async ({ therapistId, clubId, fromDate, toDate } = {}) => {
  try {
    const from = fromDate || new Date().toISOString().split('T')[0];
    let q = supabase
      .from('therapist_slots')
      .select('id, date, start_time, duration_mins, status, club_id, club_therapists(specialty, athletes(name))')
      .gte('date', from)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });
    if (therapistId) q = q.eq('therapist_id', therapistId);
    if (clubId) q = q.eq('club_id', clubId);
    if (toDate) q = q.lte('date', toDate);
    const { data, error } = await q;
    if (error) return { data: [], error: error.message };
    return { data: data || [], error: null };
  } catch (err) { return { data: [], error: err.message }; }
};

// Therapist (or club admin) publishes/updates an availability slot.
// The DURATION is set here — this is the "treatment session length".
export const saveTherapistSlot = async ({ id, therapistId, clubId, date, startTime, durationMins }) => {
  try {
    if (!date || !startTime) return { status: 'Error', message: 'Date and start time are required.' };
    const dur = parseInt(durationMins);
    if (!dur || dur <= 0) return { status: 'Error', message: 'Duration must be greater than zero minutes.' };
    const payload = {
      therapist_id: therapistId,
      club_id: clubId,
      date,
      start_time: startTime,
      duration_mins: dur
    };
    const q = id
      ? supabase.from('therapist_slots').update(payload).eq('id', id)
      : supabase.from('therapist_slots').insert(payload);
    const { error } = await q;
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const deleteTherapistSlot = async (slotId) => {
  try {
    const { error } = await supabase.from('therapist_slots').delete().eq('id', slotId);
    return { error: error ? error.message : null };
  } catch (err) { return { error: err.message }; }
};

// Athlete books an open slot (atomic RPC — see treatment_pod_v1.7.0.sql).
export const bookTreatmentSlot = async ({ slotId, treatmentType, injuryId, notes }) => {
  try {
    const { data, error } = await supabase.rpc('book_treatment_slot', {
      p_slot_id: slotId,
      p_treatment_type: treatmentType || 'Physiotherapy',
      p_injury_id: injuryId || null,
      p_notes: notes || null
    });
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success', bookingId: data };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const cancelTreatmentBooking = async (bookingId) => {
  try {
    const { error } = await supabase.rpc('cancel_treatment_booking', { p_booking_id: bookingId });
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

export const completeTreatmentBooking = async (bookingId) => {
  try {
    const { error } = await supabase.rpc('complete_treatment_booking', { p_booking_id: bookingId });
    if (error) return { status: 'Error', message: error.message };
    return { status: 'Success' };
  } catch (err) { return { status: 'Error', message: err.message }; }
};

// Booking read shape — slot (date/time/duration/therapist) + injury link.
const TREATMENT_BOOKING_SELECT = 'id, treatment_type, notes, status, created_at, injury_id, medical_entries(body_part), therapist_slots(date, start_time, duration_mins, status, club_therapists(specialty, athletes(name)))';

const shapeBooking = (b) => ({
  id: b.id,
  treatmentType: b.treatment_type,
  notes: b.notes || '',
  status: b.status,
  injuryBodyPart: b.medical_entries ? (b.medical_entries.body_part || null) : null,
  date: b.therapist_slots ? b.therapist_slots.date : null,
  startTime: b.therapist_slots ? String(b.therapist_slots.start_time).slice(0, 5) : null,
  durationMins: b.therapist_slots ? b.therapist_slots.duration_mins : null,
  therapistName: (b.therapist_slots && b.therapist_slots.club_therapists && b.therapist_slots.club_therapists.athletes)
    ? b.therapist_slots.club_therapists.athletes.name : '',
  therapistSpecialty: (b.therapist_slots && b.therapist_slots.club_therapists)
    ? b.therapist_slots.club_therapists.specialty : ''
});

const sortBookingsByDateTime = (rows) => rows.sort((a, b) =>
  String(a.date || '').localeCompare(String(b.date || '')) ||
  String(a.startTime || '').localeCompare(String(b.startTime || '')));

// Athlete: my bookings.
export const fetchMyTreatmentBookings = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], error: 'Not signed in' };
    const { data: mine } = await supabase.from('athletes').select('id').eq('user_id', user.id).maybeSingle();
    if (!mine) return { data: [], error: null };
    const { data, error } = await supabase
      .from('treatment_bookings')
      .select(TREATMENT_BOOKING_SELECT)
      .eq('athlete_id', mine.id)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: sortBookingsByDateTime((data || []).map(shapeBooking)), error: null };
  } catch (err) { return { data: [], error: err.message }; }
};

// Therapist: bookings for my slots.
export const fetchTherapistBookings = async () => {
  try {
    const profRes = await fetchMyTherapistProfile();
    if (!profRes.profile) return { data: [], error: null };
    const { data, error } = await supabase
      .from('treatment_bookings')
      .select(TREATMENT_BOOKING_SELECT + ', athletes(name)')
      .eq('therapist_slots.therapist_id', profRes.profile.id)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    const rows = (data || []).map(b => ({ ...shapeBooking(b), athleteName: b.athletes ? b.athletes.name : '' }));
    return { data: sortBookingsByDateTime(rows), error: null };
  } catch (err) { return { data: [], error: err.message }; }
};

// Coach / club admin: every booking in the club.
export const fetchClubTreatmentBookings = async (clubId) => {
  try {
    if (!clubId) return { data: [], error: 'No club selected.' };
    const { data, error } = await supabase
      .from('treatment_bookings')
      .select(TREATMENT_BOOKING_SELECT + ', athletes(name)')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    const rows = (data || []).map(b => ({ ...shapeBooking(b), athleteName: b.athletes ? b.athletes.name : '' }));
    return { data: sortBookingsByDateTime(rows), error: null };
  } catch (err) { return { data: [], error: err.message }; }
};

// Open (unresolved) injuries for the booking → injury link.
export const fetchMyOpenInjuries = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], error: 'Not signed in' };
    const { data: mine } = await supabase.from('athletes').select('id').eq('user_id', user.id).maybeSingle();
    if (!mine) return { data: [], error: null };
    const { data, error } = await supabase
      .from('medical_entries')
      .select('id, date_logged, body_part, pain_level, injury_grade, training_status')
      .eq('athlete_id', mine.id)
      .eq('is_resolved', false)
      .is('deleted_at', null)
      .order('date_logged', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: data || [], error: null };
  } catch (err) { return { data: [], error: err.message }; }
};

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
  parseProgramsFromRaw,
  fetchShopProducts, fetchMyEntitlements, fetchEntitledPods, fetchMyPods,
  isShopAdmin, adminListShopProducts, adminUpsertShopProduct, 
  adminDeleteShopProduct, adminListAthletes, adminListEntitlements, 
  adminGrantEntitlement, adminRevokeEntitlement,
  fetchCurrentAthlete, fetchMyTherapistProfile, upsertMyTherapistProfile,
  fetchClubTherapists, adminAddTherapist, adminSetTherapistActive,
  fetchTherapistSlots, saveTherapistSlot, deleteTherapistSlot,
  bookTreatmentSlot, cancelTreatmentBooking, completeTreatmentBooking,
  fetchMyTreatmentBookings, fetchTherapistBookings, fetchClubTreatmentBookings,
  fetchMyOpenInjuries
};
export default api;
