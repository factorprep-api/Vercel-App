import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Utensils, CheckCircle, Trash2, Flame, Beef, Wheat, Droplet, Loader2, Star, Salad, Activity, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { fetchFoodDatabase, fetchFoodFavorites, addFoodFavorite, removeFoodFavorite, saveNutritionLog, fetchNutritionLogs, updateNutritionItems, fetchMealArchetypes, fetchMealFavorites, addMealFavorite, removeMealFavorite, fetchAthleteBodyData, fetchTodayTraining } from '../api';
import { ymd } from '../utils/cycleMath';

// Exercise-library search pattern: full database loaded once (cached), then
// instant client-side multi-word filtering, grouped by category, paginated.
const ITEMS_PER_PAGE = 50;
// v4: v3 payloads were fetched in a single capped request (PostgREST Max
// Rows = 1,000), so they contain only the first 1,000 alphabetical rows.
// v4 is fetched paginated and complete; any v1–v3 cache is purged.
const FOOD_DB_CACHE_KEY = 'fp_food_database_v4';
const LEGACY_CACHE_KEYS = ['fp_food_database_v1', 'fp_food_database_v2', 'fp_food_database_v3'];

function buildGrouped(data) {
  const map = {};
  data.forEach(f => {
    const cat = (f.category || 'Uncategorised').toUpperCase();
    if (!map[cat]) map[cat] = [];
    map[cat].push(f);
  });
  return Object.keys(map).sort().map(cat => ({
    cat,
    items: map[cat].sort((a, b) => a.description.localeCompare(b.description)),
  }));
}

function getPageSlice(grouped, page) {
  const start = (page - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const flat = [];
  grouped.forEach(g => g.items.forEach(item => flat.push({ cat: g.cat, item })));
  const slice = flat.slice(start, end);
  const map = {};
  slice.forEach(({ cat, item }) => {
    if (!map[cat]) map[cat] = [];
    map[cat].push(item);
  });
  return Object.keys(map).sort().map(cat => ({ cat, items: map[cat] }));
}

function PageButtons({ currentPage, totalPages, onChange }) {
  const buttons = [];
  const startP = Math.max(1, currentPage - 2);
  const endP = Math.min(totalPages, currentPage + 2);
  if (startP > 1) {
    buttons.push(<button key="first" className="an-page-btn" onClick={() => onChange(1)}>1</button>);
    if (startP > 2) buttons.push(<span key="dots1" className="an-page-dots">...</span>);
  }
  for (let i = startP; i <= endP; i++) {
    buttons.push(
      <button key={i} className={`an-page-btn ${i === currentPage ? 'active' : ''}`} onClick={() => onChange(i)}>
        {i}
      </button>
    );
  }
  if (endP < totalPages) {
    if (endP < totalPages - 1) buttons.push(<span key="dots2" className="an-page-dots">...</span>);
    buttons.push(<button key="last" className="an-page-btn" onClick={() => onChange(totalPages)}>{totalPages}</button>);
  }
  return <>{buttons}</>;
}

// Portion presets offered when the database portion doesn't fit (grams)
const GRAM_PRESETS = [50, 100, 150, 200, 250];

// ---- Brand neutrality (product decision) ----
// AUSNUT portion labels append retailer/manufacturer names ("1 pouch Coles",
// "1 KFC Bowl", "1 scoop Musashi Shred and Burn"). The app does not promote
// brands anywhere food is displayed; if a brand ever appears here it will be
// a deliberately designed paid placement, never free incidental exposure.
// Strip from the first brand token to the end of the label — the useful part
// ("1 pouch", "1 biscuit", "1 scoop") survives. Descriptions keep brand names:
// they are the food's identity and an athlete searching "Milo" needs the hit.
const BRAND_LABEL_RE = new RegExp(
  '\\s*\\b(?:' + [
    'Coles(?:\\s*Brand)?', 'Home Brand', 'Black & Gold', 'Woolworths', 'Woolies', 'Aldi', 'IGA',
    'Sanitarium', 'Weet-?Bix', 'Uncle Tobys?', 'Kelloggs?', 'Nutri-?Grain', 'Nestle', 'Milo',
    'Sustagen', 'Ensure', 'Up & Go', 'Musashi', 'Mainland', 'Bulla', 'Devondale', 'Bega',
    'Tip Top', 'Helga(?:s)?', 'Buttercup', 'Yoplait', 'Vaalia', 'Chobani', 'Tamar Valley',
    'Pauls', 'Abbotts Village', 'McDonald', "McDonald's", 'MCDonald', 'KFC', 'Hungry Jack', 'Subway',
    'Domino(?:s)?', 'Pizza Hut'
  ].join('|') + ')\\b.*$',
  'i'
);
const stripBrandLabel = (label) => {
  if (!label) return label;
  const stripped = label.replace(BRAND_LABEL_RE, '').replace(/[\s,;:-]+$/, '').trim();
  // Label was brand-only ("Coles 70") — never echo the brand back.
  return stripped || 'per serve';
};

// ---- Popular picks (empty-search suggestions) ----
// Curated, never score-ranked: global ranking surfaces fortified powders
// (Herbalife 96) because per-kJ scoring rewards fortification. The four
// meals come from the archetype table by per-kJ density; the six staples
// resolve by description prefix against the live database — never
// hard-coded UUIDs, which the ETL regenerates on re-import — so they
// survive data refreshes. Reject lists keep variants honest (breadcrumb
// coatings, mixed dishes, brand pouches, sweet potato when potato).
const POPULAR_STAPLES = [
  { key: 'banana', patterns: ['banana, raw'], reject: ['pepper', 'prawn', 'passion'] },
  { key: 'eggs', patterns: ['egg, whole, boiled', 'egg, whole, poached', 'egg, whole, raw'], reject: ['preserved', 'omelet', 'omelette', 'scrambled', 'fried'] },
  { key: 'chicken', patterns: ['chicken breast, ', 'chicken, breast, '], reject: ['coated', 'breadcrumb', 'crumbed', 'fried', 'marinade', 'fast food', 'restaurant', 'canned', 'skin eaten', 'sauce'] },
  { key: 'rice', patterns: ['rice, white, cooked', 'rice, white, steamed'], reject: ['fried', 'with ', 'fat added', 'oil', 'margarine', 'puerto', 'lentil', 'bean', 'sushi', 'flavoured', 'flavored', 'coconut'] },
  { key: 'yoghurt', patterns: ['yoghurt, natural', 'yogurt, plain'], reject: ['flav', 'fruit', 'granola', 'muesli', 'with ', 'sheep', 'goat'] },
  { key: 'potato', patterns: ['potato, baked', 'potato, boiled'], reject: ['margarine', 'oil', 'fat added', 'made with', 'with ', 'baby', 'school', 'sweet'] },
];

// Highest per-kJ survivor per staple group. AUSNUT portion labels carry
// supermarket noise ("1 pouch Coles") — stripped so the portion line reads
// clean and the row falls back to 'per 100 g'.
const resolveStaples = (foods) => {
  const picks = [];
  POPULAR_STAPLES.forEach(st => {
    const match = foods
      .filter(f => st.patterns.some(p => (f.description || '').toLowerCase().startsWith(p)))
      .filter(f => !st.reject.some(r => (f.description || '').toLowerCase().includes(r)))
      .filter(f => f.densityPerKj != null)
      .sort((a, b) => (b.densityPerKj || 0) - (a.densityPerKj || 0))[0];
    if (match) {
      picks.push({
        ...match,
        portionLabel: stripBrandLabel(match.portionLabel || '') || null
      });
    }
  });
  return picks;
};

// Quality tier fallback (§5.2): quality_tier_modifiers is the source of truth
// (loaded with the meal archetypes); these mirrors keep the food quality
// selector and its multiplier working if that reference fetch ever fails.
const FOOD_TIERS_FALLBACK = [
  { tier: 'processed', scoreMultiplier: 0.60, badge: 'Processed' },
  { tier: 'supermarket', scoreMultiplier: 0.80, badge: 'Supermarket' },
  { tier: 'fresh', scoreMultiplier: 1.00, badge: 'Fresh' },
  { tier: 'local', scoreMultiplier: 1.10, badge: 'Local' },
  { tier: 'homegrown', scoreMultiplier: 1.15, badge: 'Homegrown' }
];

// Score badge colors — headline is the per-kJ measure (what the calories
// buy), because athletes compare meals and foods by the fuel they give.
// Per-100 g stays in the tooltip: it ranks processing density (a takeaway
// meal outscores porridge per 100 g but loses per kJ), so it misleads as a
// headline. 'axes' is how many of the 17 axes that food reports, so a 15/17
// food is not presented as if it were compared like-for-like with a 17/17
// one. Falls back to the per-100 g score when a row (older log items) has
// no per-kJ measure.
//
// Calibration (v1.9.8, recalibrated 2026-10-27): percentile-based, four
// equal bands. The score distribution is fixed at ETL time — percentile
// ranks over the whole active population — so the quartile cutoffs are
// stable until the dataset changes. Measured from the shipped FNDDS+AUSNUT
// datasets (node scripts/simulate_scores.mjs --compare, "quartile cutoffs"):
//   per-100g: q1=41.9  q2=54.6  q3=63.4   (n=9336)
//   per-kJ:   q1=42.5  q2=52.6  q3=61.1   (n=9293)
// The headline is per-kJ (with a per-100g fallback only for older log
// items), so the cutoffs are the per-kJ quartiles: green ≥ 61, yellow ≥ 53,
// amber ≥ 42. Band shares at these cutoffs:
//   per-kJ:   green 25.3%  yellow 23.7%  amber 26.8%  red 24.1%
//   per-100g: green 31.6%  yellow 23.0%  amber 20.3%  red 25.1%
// Re-derive via scripts/simulate_scores.mjs if the scoring population
// changes (import, activation, axis set).
const qualityBand = (headline) => {
  if (headline == null) return { bg: '#e2e8f0', fg: '#64748b' };
  if (headline >= 61) return { bg: '#dcfce7', fg: '#15803d' }; // top quartile
  if (headline >= 53) return { bg: '#fef9c3', fg: '#854d0e' }; // 2nd quartile
  if (headline >= 42) return { bg: '#ffedd5', fg: '#c2410c' }; // 3rd quartile
  return { bg: '#fee2e2', fg: '#b91c1c' };                     // bottom quartile
};

const scoreBadge = (score, axes, kjScore) => {
  const parts = [];
  if (kjScore != null) parts.push(`Per 100 kJ: ${Math.round(kjScore)}`);
  if (score != null) parts.push(`Per 100 g: ${Math.round(score)}${axes != null ? ` (${axes}/17 axes)` : ''}`);
  const title = parts.length ? parts.join(' · ') : 'Not scored';
  const headline = kjScore != null ? kjScore : score;
  if (headline == null) return { bg: '#e2e8f0', fg: '#64748b', label: '—', title };
  return { ...qualityBand(headline), label: `${Math.round(headline)}`, title };
};

// ---- Energy balance (v1.9.7): BMR + training vs logged intake ----
// Estimation, not measurement (plan §1). Two deliberately coarse pieces:
//
// 1. BMR — Mifflin-St Jeor, the standard predictive equation, from the
//    athlete's profile (sex / birth year / height / latest body weight).
//    If ANY of those is missing the card does not render a number — no
//    midpoint estimates (product decision, v1.9.5 migration note).
// 2. Training expenditure — RPE→MET coarse bands (open decision §9.3:
//    "coarse bands acceptable for v1"). kJ/min = MET × 3.5 × kg / 200
//    (the ACSM kilocalorie formula), × minutes, × 4.184 kcal→kJ.
//    RPE 1–2 → 4.0 METs, 3–5 → 7.0, 6–7 → 9.5, 8–10 → 12.5.
//
// Rest-of-day activity = BMR × 1.2 (the standard sedentary multiplier).
// Every number shown is labelled an estimate; the card never judges —
// it answers "am I roughly fuelling the day I actually trained?"
const RPE_MET_BANDS = [
  { max: 2, mets: 4.0, label: 'light' },
  { max: 5, mets: 7.0, label: 'moderate' },
  { max: 7, mets: 9.5, label: 'vigorous' },
  { max: 10, mets: 12.5, label: 'very hard' }
];
const KCAL_TO_KJ = 4.184;

const mifflinStJeorKj = (bodyData) => {
  if (!bodyData?.sex || bodyData?.birthYear == null || bodyData?.heightCm == null || bodyData?.weightKg == null) return null;
  const age = new Date().getFullYear() - bodyData.birthYear;
  const kcal = 10 * bodyData.weightKg + 6.25 * bodyData.heightCm - 5 * age
    + (bodyData.sex === 'male' ? 5 : -161);
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  return kcal * KCAL_TO_KJ;
};

const sessionEnergyKj = (session, weightKg) => {
  const band = RPE_MET_BANDS.find(b => session.actualRpe >= 1 && session.actualRpe <= b.max)
    || RPE_MET_BANDS[RPE_MET_BANDS.length - 1];
  const kcalPerMin = band.mets * 3.5 * weightKg / 200;
  return { kj: kcalPerMin * session.actualMins * KCAL_TO_KJ, band: band.label };
};

const energyBalance = (bodyData, sessions, loggedKj) => {
  const bmr = mifflinStJeorKj(bodyData);
  if (bmr == null) return null;
  const trainingKj = sessions.reduce((acc, s) => {
    if (!s.actualMins || s.actualMins <= 0) return acc;
    return acc + sessionEnergyKj(s, bodyData.weightKg).kj;
  }, 0);
  const totalNeeds = bmr * 1.2 + trainingKj;
  return {
    bmr,
    trainingKj,
    trainingSessions: sessions.filter(s => s.actualMins > 0),
    totalNeeds,
    loggedKj: loggedKj || 0,
    balance: (loggedKj || 0) - totalNeeds
  };
};

// ---- Recommended macronutrient targets (v1.9.10) ----
// Sports nutrition consensus (ACSM/AND/DC 2016 joint position statement;
// ISSN position stand on protein, 2017), kept honest to the app's own
// energy model: the three targets must add up to the same estimated needs
// the Energy balance card shows — one consistent story, not three numbers.
//
//   Protein — 1.6 g/kg, the midpoint of the consensus 1.4–2.0 g/kg range.
//
//   Carbs — scaled by today's hardest training session (consensus 3–10
//     g/kg by load): rest/light 4, moderate 6, vigorous 8, very hard 10.
//     Deliberately NOT 5 on rest days: at the app's rest-day energy
//     (BMR × 1.2), 1.6 g/kg protein + 5 g/kg carbs already consume ~95%
//     of the energy, leaving fat at ~5% — below the healthy ~20% floor.
//     The consensus carb floor on light days exists precisely to leave
//     room for fat; 4 g/kg lands fat at ~20% of needs.
//     CAVEAT (v1.9.10 fix): the consensus g/kg bands assume energy
//     sufficiency. For a heavy athlete whose estimated needs are lower
//     than protein + band carbs (e.g. 90 kg on a very-hard day at
//     13,400 kJ), the band overshoots the day's energy. Carbs are
//     therefore capped by what remains after protein and the fat floor,
//     so the three targets always sum to the estimated needs.
//
//   Fat — the remainder of estimated needs (consensus frames fat as
//     20–35% of energy), floored at 20% so the three targets never imply
//     an unhealthy minimum on heavy-carb days.
const TARGET_PROTEIN_G_PER_KG = 1.6;
const TARGET_CARB_G_PER_KG = [
  { maxRpe: 2, gPerKg: 4, label: 'rest / light day' },
  { maxRpe: 5, gPerKg: 6, label: 'moderate training day' },
  { maxRpe: 7, gPerKg: 8, label: 'vigorous training day' },
  { maxRpe: 10, gPerKg: 10, label: 'very hard training day' }
];
// Atwater factors (SI-rounded): protein 17 kJ/g, carb 17 kJ/g, fat 37 kJ/g.
const KJ_PER_G = { protein: 17, carb: 17, fat: 37 };
const FAT_MIN_SHARE = 0.20; // consensus floor: fat ≥ 20% of estimated needs



export default function AthleteNutrition() {
  const { userEmail, athleteName } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [fullFoods, setFullFoods] = useState([]);    // full food database (cached)
  const [loadingDb, setLoadingDb] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [selected, setSelected] = useState(null);   // food chosen for portion step
  const [grams, setGrams] = useState('');
  const [portionLabel, setPortionLabel] = useState('');
  // Food quality selector (§5.2): chosen per food, defaulting to Supermarket
  // (×0.80) — where nearly everybody gets their food. The multiplier is
  // applied to the scores at log time and snapshot with the item (§5.3).
  const [foodTier, setFoodTier] = useState('supermarket');

  // Energy balance (v1.9.7): body profile + latest weight + today's training.
  const [bodyData, setBodyData] = useState(null);
  const [todaySessions, setTodaySessions] = useState([]);

  // Meal archetypes (v1.9): the three-tap meal path — meal → tier + portion → add.
  const [meals, setMeals] = useState([]);           // the ten archetypes
  const [mealTiers, setMealTiers] = useState([]);   // quality tier multipliers
  const [mealPortions, setMealPortions] = useState([]); // portion multipliers
  const [meal, setMeal] = useState(null);           // archetype chosen for step 2
  const [mealTier, setMealTier] = useState('supermarket'); // default tier (§5.2): supermarket, where nearly everybody gets their food
  const [mealPortion, setMealPortion] = useState('normal');
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [mealsError, setMealsError] = useState(null);
  // v1.9.4 Quick meals personalisation: starred meal ids (newest first, from
  // meal_favorites), 30-day usage counts to rank unstarred generics, and the
  // "More meals" collapse toggle.
  const [mealFavs, setMealFavs] = useState([]);
  const [mealUsage, setMealUsage] = useState(new Map());
  const [showMoreMeals, setShowMoreMeals] = useState(false);

  const [logId, setLogId] = useState(null);          // today's log row
  const [items, setItems] = useState([]);            // today's items
  const [favourites, setFavourites] = useState([]);  // starred foods (v1.8.1)
  const [recents, setRecents] = useState([]);        // recently logged foods
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [justLogged, setJustLogged] = useState(false);
  const [pageError, setPageError] = useState(null);

  const favIds = useMemo(() => new Set(favourites.map(f => f.id)), [favourites]);

  // Load today's log row + favourites + recently logged foods (30 days).
  // Recents are derived client-side from existing logs — no extra table.
  const loadNutritionData = async () => {
    const [logRes, favRes, mealFavRes, bodyRes, trainRes] = await Promise.all([
      fetchNutritionLogs(30),
      fetchFoodFavorites().catch(() => ({ foods: [] })),
      fetchMealFavorites().catch(() => ({ ids: [] })),
      fetchAthleteBodyData(athleteName).catch(() => null),
      fetchTodayTraining(athleteName).catch(() => ({ sessions: [] }))
    ]);
    if (logRes.error) { setPageError(logRes.error); return; }
    const today = ymd(new Date());
    const row = (logRes.logs || []).find(l => l.date === today && !l.sessionLogId);
    setLogId(row ? row.id : null);
    setItems(row ? row.items : []);
    setFavourites(favRes.foods || []);
    setMealFavs(mealFavRes.ids || []);
    setBodyData(bodyRes && bodyRes.status === 'Success' ? bodyRes : null);
    setTodaySessions(trainRes.sessions || []);

    // Meal usage: how often each archetype appears in the 30-day window —
    // ranks the unstarred generic meals in Quick meals by actual use.
    const usage = new Map();
    (logRes.logs || []).forEach(l => {
      (l.items || []).forEach(it => {
        if (!it.archetype_id) return;
        usage.set(it.archetype_id, (usage.get(it.archetype_id) || 0) + 1);
      });
    });
    setMealUsage(usage);

    // Recents: first sighting scanning newest-log-first = most recent use.
    // Normalised to the food shape the rest of the page expects.
    const seen = new Map();
    (logRes.logs || []).forEach(l => {
      (l.items || []).forEach(it => {
        if (!it.food_id || seen.has(it.food_id)) return;
        // Carry the same fields as a database food so a chip can be logged
        // without re-fetching. fat100 matters: without it, food logged from a
        // Recent chip contributed 0 g fat to the day's totals.
        // Scores were tier-adjusted at log time (§5.2 snapshot), so a re-log
        // must reconstruct the raw database score by dividing out the stored
        // multiplier — otherwise the tier would be applied twice. The tier
        // the item was logged with becomes the selector's default; legacy
        // items pre-dating the selector carry raw scores and default to
        // Supermarket.
        const mult = it.scoreMultiplier != null ? Number(it.scoreMultiplier) : null;
        const raw = (v) => (v == null ? null : (mult && mult !== 1 ? Number((v / mult).toFixed(2)) : Number(v)));
        seen.set(it.food_id, {
          id: it.food_id,
          description: it.name,
          source: 'Recent',
          portionLabel: it.portionLabel || '',
          portionGrams: it.portionGrams != null ? Number(it.portionGrams) : null,
          kj100: it.kj100 != null ? Number(it.kj100) : null,
          protein100: it.protein100 != null ? Number(it.protein100) : null,
          carbs100: it.carbs100 != null ? Number(it.carbs100) : null,
          fat100: it.fat100 != null ? Number(it.fat100) : null,
          fibre100: it.fibre100 != null ? Number(it.fibre100) : null,
          percentileScore: raw(it.percentileScore),
          scoreAxes: it.scoreAxes != null ? Number(it.scoreAxes) : null,
          densityPerKj: raw(it.densityPerKj),
          scoreAxesKj: it.scoreAxesKj != null ? Number(it.scoreAxesKj) : null,
          qualityTier: it.qualityTier || null
        });
      });
    });
    setRecents([...seen.values()].slice(0, 8));
  };

  useEffect(() => { loadNutritionData(); }, [userEmail]);

  // Archetypes are small reference data (ten rows + two scalar tables), so no
  // localStorage cache — refetch on mount keeps tier/portion tuning live.
  useEffect(() => {
    if (!userEmail) return;
    let isMounted = true;
    (async () => {
      const res = await fetchMealArchetypes();
      if (!isMounted) return;
      if (res.error) setMealsError(res.error);
      else {
        setMeals(res.archetypes);
        setMealTiers(res.tiers);
        setMealPortions(res.portions);
        setMealsError(null);
      }
      setLoadingMeals(false);
    })();
    return () => { isMounted = false; };
  }, [userEmail]);

  // Star / unstar a food. Optimistic update, reverted if the DB write fails.
  const toggleFav = async (food) => {
    const isFav = favIds.has(food.id);
    setFavourites(isFav ? favourites.filter(f => f.id !== food.id) : [...favourites, food]);
    const res = isFav ? await removeFoodFavorite(food.id) : await addFoodFavorite(food.id);
    if (res.status !== 'Success') {
      setFavourites(isFav ? [...favourites, food] : favourites.filter(f => f.id !== food.id));
      setPageError(res.message || 'Could not update favourite.');
    }
  };

  // Star / unstar a meal archetype for Quick meals. Optimistic like toggleFav;
  // a new star goes to the top of the starred block (fetchMealFavorites
  // returns newest-first, so the optimistic array mirrors that order).
  const toggleMealFav = async (m) => {
    const isFav = mealFavs.includes(m.id);
    setMealFavs(isFav ? mealFavs.filter(id => id !== m.id) : [m.id, ...mealFavs]);
    const res = isFav ? await removeMealFavorite(m.id) : await addMealFavorite(m.id);
    if (res.status !== 'Success') {
      setMealFavs(isFav ? [m.id, ...mealFavs] : mealFavs.filter(id => id !== m.id));
      setPageError(res.message || 'Could not update favourite.');
    }
  };

  // 300ms debounce — same timing as the exercise library
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Full food database: cached-first, then a background refetch keeps the
  // cache self-healing after ETL re-imports. Same load pattern as the
  // exercise library.
  useEffect(() => {
    if (!userEmail) return;
    let isMounted = true;
    (async () => {
      // Drop caches written before the percentile_score/score_axes rename —
      // they would render as undefined badges.
      LEGACY_CACHE_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });
      const cached = localStorage.getItem(FOOD_DB_CACHE_KEY);
      if (cached && isMounted) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFullFoods(parsed);
            setLoadingDb(false);
          }
        } catch {}
      }
      const res = await fetchFoodDatabase();
      if (!isMounted) return;
      if (res.error) {
        if (!cached) setDbError(res.error);
        setLoadingDb(false);
        return;
      }
      setFullFoods(res.foods);
      try { localStorage.setItem(FOOD_DB_CACHE_KEY, JSON.stringify(res.foods)); } catch {}
      setLoadingDb(false);
    })();
    return () => { isMounted = false; };
  }, [userEmail]);

  // Client-side multi-word token filter (AND across tokens, name OR category)
  const filteredDataset = useMemo(() => {
    let base = fullFoods;
    if (debouncedQuery.trim().length >= 2) {
      const tokens = debouncedQuery.toLowerCase().split(/\s+/);
      base = fullFoods.filter(f => {
        const n = (f.description || '').toLowerCase();
        const c = (f.category || '').toLowerCase();
        return tokens.every(t => n.includes(t) || c.includes(t));
      });
    }
    return buildGrouped(base);
  }, [fullFoods, debouncedQuery]);

  const pageGroups = useMemo(() => getPageSlice(filteredDataset, currentPage), [filteredDataset, currentPage]);
  const totalItems = filteredDataset.reduce((s, g) => s + g.items.length, 0);
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const handleSearch = (e) => { setSearchQuery(e.target.value); setCurrentPage(1); };
  const handlePageChange = (page) => { setCurrentPage(page); };

  // ---- Quick meals ordering (v1.9.4) ----
  // Starred meals first in star order (newest star at top), then the generic
  // archetypes ranked by 30-day usage — so meals you actually eat surface
  // while ones you never log sink behind the "More meals" collapse.
  const mealFavSet = useMemo(() => new Set(mealFavs), [mealFavs]);
  const starredMeals = useMemo(
    () => mealFavs.map(id => meals.find(m => m.id === id)).filter(Boolean),
    [meals, mealFavs]
  );
  const genericMeals = useMemo(
    () => meals
      .filter(m => !mealFavSet.has(m.id))
      .sort((a, b) => (mealUsage.get(b.id) || 0) - (mealUsage.get(a.id) || 0)),
    [meals, mealFavSet, mealUsage]
  );
  const visibleGenericMeals = showMoreMeals ? genericMeals : genericMeals.slice(0, 3);

  // ---- Popular picks (empty search) ----
  // Shown only while the search is untouched: a "browse everything" dump of
  // 9,365 foods opens on Duck fat and 17/17-red badges, which reads as broken.
  // Four highest nutrient-per-kJ meals + six curated staples; anything already
  // starred or logged today is excluded so the panel never repeats you.
  const isPicking = debouncedQuery.trim().length < 2;
  const popularMeals = useMemo(() => {
    if (!isPicking) return [];
    const exclude = new Set(mealFavs);
    return [...meals]
      .filter(m => !exclude.has(m.id))
      .sort((a, b) => (b.densityPerKj ?? -1) - (a.densityPerKj ?? -1) || String(a.name).localeCompare(String(b.name)))
      .slice(0, 4);
  }, [isPicking, meals, mealFavs]);
  const popularStaples = useMemo(() => {
    if (!isPicking || loadingDb || dbError) return [];
    const exclude = new Set([...favIds, ...items.filter(it => it.food_id).map(it => it.food_id)]);
    return resolveStaples(fullFoods).filter(f => !exclude.has(f.id));
  }, [isPicking, loadingDb, dbError, fullFoods, favIds, items]);

  // Unified search (v1.9.4): matching meals render first (max 3), foods
  // underneath — one box answers "what did I eat" whichever pool it lives in.
  const mealMatches = useMemo(() => {
    if (debouncedQuery.trim().length < 2) return [];
    const tokens = debouncedQuery.toLowerCase().split(/\s+/);
    return meals.filter(m => {
      const hay = (m.name + ' ' + (m.mealSlots || []).join(' ')).toLowerCase();
      return tokens.every(t => hay.includes(t));
    }).slice(0, 3);
  }, [meals, debouncedQuery]);

  // Row renderers shared by the Quick meals card and the search results —
  // same layout everywhere a meal or food appears, so starring is consistent.
  const renderMealRow = (m) => {
    const starred = mealFavSet.has(m.id);
    const b = scoreBadge(m.percentileScore, null, m.densityPerKj);
    return (
      <div key={m.id} className="an-result" onClick={() => tapMeal(m)}>
        <div style={{ minWidth: 0 }}>
          <div className="an-result-name">{m.name}</div>
          <div className="an-result-sub">
            {m.mealSlots?.length > 0 ? `${m.mealSlots.map(s => s.replace(/_/g, ' ')).join(', ')} · ` : ''}
            Normal serve{m.energyKj != null ? ` · ${Math.round(m.energyKj).toLocaleString()} kJ` : ''}{m.proteinG != null ? ` · ${m.proteinG} g protein` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            className="an-fav-btn"
            onClick={(e) => { e.stopPropagation(); toggleMealFav(m); }}
            title={starred ? 'Remove from Quick meals' : 'Pin to Quick meals'}
          >
            <Star size={16} color={starred ? '#f59e0b' : '#cbd5e1'} fill={starred ? '#f59e0b' : 'none'} />
          </button>
          <span className="an-badge" style={{ background: b.bg, color: b.fg }} title={b.title}>Score {b.label}</span>
        </div>
      </div>
    );
  };

  const renderFoodRow = (f) => (
    <div key={f.id} className="an-result" onClick={() => tapFood(f)}>
      <div style={{ minWidth: 0 }}>
        <div className="an-result-name">{f.description}</div>
        <div className="an-result-sub">
          {f.source} · {stripBrandLabel(f.portionLabel) || 'per 100 g'}{f.kj100 != null ? ` · ${Math.round(f.kj100)} kJ/100g` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button
          className="an-fav-btn"
          onClick={(e) => { e.stopPropagation(); toggleFav(f); }}
          title={favIds.has(f.id) ? 'Remove from Quick meals' : 'Pin to Quick meals'}
        >
          <Star size={16} color={favIds.has(f.id) ? '#f59e0b' : '#cbd5e1'} fill={favIds.has(f.id) ? '#f59e0b' : 'none'} />
        </button>
        <span className="an-badge" style={{ background: scoreBadge(f.percentileScore, f.scoreAxes, f.densityPerKj).bg, color: scoreBadge(f.percentileScore, f.scoreAxes, f.densityPerKj).fg }} title={scoreBadge(f.percentileScore, f.scoreAxes, f.densityPerKj).title}>Score {scoreBadge(f.percentileScore, f.scoreAxes, f.densityPerKj).label}</span>
      </div>
    </div>
  );

  const tapFood = (food) => {
    setSelected(food);
    setSearchQuery('');
    setDebouncedQuery('');
    // Quality selector defaults to Supermarket (§5.2 decision), except for a
    // recently logged food, which re-selects the tier it was logged with —
    // with the raw score reconstructed, the same tier reproduces the same
    // stored values (adjustment applied exactly once).
    setFoodTier(food.qualityTier || 'supermarket');
    if (food.portionGrams != null) {
      setGrams(String(Math.round(food.portionGrams)));
      // Store the brand-neutral label — it persists into today's log items.
      setPortionLabel(food.portionLabel ? (stripBrandLabel(food.portionLabel) || `${Math.round(food.portionGrams)} g`) : `${Math.round(food.portionGrams)} g`);
    } else {
      setGrams('');
      setPortionLabel('');
    }
  };

  const tapPreset = (g) => {
    setGrams(String(g));
    setPortionLabel(`${g} g`);
  };

  const preview = (key) => {
    const g = parseFloat(grams);
    if (!selected || !g || g <= 0) return null;
    const v = selected[key];
    if (v == null) return null;
    return Math.round(v * g / 100);
  };

  const tapAdd = async () => {
    const g = parseFloat(grams);
    if (!selected) return;
    if (!g || g <= 0) return;
    setSaving(true);
    // Quality tier (§5.2/§5.3): resolve the multiplier at log time and
    // snapshot it with the item, so later tuning of quality_tier_modifiers
    // never rewrites logged history. Only the two scores are multiplied —
    // macros stay truthful (energy/protein are what they are).
    const tier = mealTiers.find(t => t.tier === foodTier)
      || FOOD_TIERS_FALLBACK.find(t => t.tier === foodTier);
    const tierMult = tier ? tier.scoreMultiplier : 1;
    const item = {
      food_id: selected.id,
      grams: g,
      name: selected.description,
      portionLabel: `${portionLabel || `${g} g`} · ${tier ? tier.badge : cap(foodTier)}`,
      kj100: selected.kj100,
      protein100: selected.protein100,
      carbs100: selected.carbs100,
      fat100: selected.fat100,
      fibre100: selected.fibre100,
      percentileScore: selected.percentileScore != null ? Number((selected.percentileScore * tierMult).toFixed(1)) : null,
      scoreAxes: selected.scoreAxes,
      densityPerKj: selected.densityPerKj != null ? Number((selected.densityPerKj * tierMult).toFixed(1)) : null,
      scoreAxesKj: selected.scoreAxesKj,
      qualityTier: foodTier,
      scoreMultiplier: tierMult
    };
    const res = await saveNutritionLog({ items: [item], athlete: athleteName, email: userEmail });
    setSaving(false);
    if (res.status === 'Success') {
      setItems(Array.isArray(res.items) ? res.items : [...items, item]);
      setSelected(null);
      setGrams('');
      setPortionLabel('');
      setJustLogged(true);
      setTimeout(() => setJustLogged(false), 1800);
    } else {
      setPageError(res.message || 'Could not save.');
    }
  };

  const removeItem = async (idx) => {
    if (!logId) return;
    setRemoving(true);
    const next = items.filter((_, i) => i !== idx);
    const res = await updateNutritionItems(logId, next);
    setRemoving(false);
    if (res.status === 'Success') setItems(next);
    else setPageError(res.message || 'Could not remove item.');
  };

  // ---- Meal path: same save pipeline as a food, different payload ----
  // Clearing the query mirrors tapFood, so the tier/portion step replaces the
  // result list instead of the results staying underneath it.
  const tapMeal = (m) => {
    setMeal(m);
    setSearchQuery('');
    setDebouncedQuery('');
    setMealTier('supermarket'); // default tier (§5.2): supermarket, where nearly everybody gets their food
    setMealPortion('normal'); // normal = the base_grams serve
  };

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const tapAddMeal = async () => {
    if (!meal) return;
    setSaving(true);
    const tier = mealTiers.find(t => t.tier === mealTier);
    const portion = mealPortions.find(p => p.portionSize === mealPortion);
    const tierMult = tier ? tier.scoreMultiplier : 1;
    const portionMult = portion ? portion.multiplier : 1;
    const grams = meal.baseGrams != null ? Math.round(meal.baseGrams * portionMult) : null;
    // Store per-100 g OF THE SERVE so the existing totals math
    // (per-100g × grams / 100) resolves back to the per-serve view numbers.
    const per100 = (v) => (v != null && meal.baseGrams > 0)
      ? Number((v / meal.baseGrams * 100).toFixed(2))
      : null;
    // Tier counteracts density inflation by processing (§5.2): resolve the
    // score at log time and snapshot the multiplier, so later tuning of
    // quality_tier_modifiers never rewrites logged history (§5.3).
    const item = {
      food_id: null,
      archetype_id: meal.id,
      grams,
      name: meal.name,
      portionLabel: `${cap(mealPortion)} serve · ${tier ? tier.badge : cap(mealTier)}`,
      kj100: per100(meal.energyKj),
      protein100: per100(meal.proteinG),
      carbs100: per100(meal.carbsG),
      fat100: per100(meal.fatG),
      fibre100: per100(meal.fibreG),
      percentileScore: meal.percentileScore != null ? Number((meal.percentileScore * tierMult).toFixed(1)) : null,
      scoreAxes: null,
      densityPerKj: meal.densityPerKj != null ? Number((meal.densityPerKj * tierMult).toFixed(1)) : null,
      scoreAxesKj: null,
      qualityTier: mealTier,
      portionSize: mealPortion,
      scoreMultiplier: tierMult,
      portionMultiplier: portionMult
    };
    const res = await saveNutritionLog({ items: [item], athlete: athleteName, email: userEmail });
    setSaving(false);
    if (res.status === 'Success') {
      setItems(Array.isArray(res.items) ? res.items : [...items, item]);
      setMeal(null);
      setJustLogged(true);
      setTimeout(() => setJustLogged(false), 1800);
    } else {
      setPageError(res.message || 'Could not save.');
    }
  };

  // Daily totals (client-side, per plan §3 — no server rollups)
  const totals = items.reduce((acc, it) => {
    const g = Number(it.grams) || 0;
    acc.kj += (Number(it.kj100) || 0) * g / 100;
    acc.protein += (Number(it.protein100) || 0) * g / 100;
    acc.carbs += (Number(it.carbs100) || 0) * g / 100;
    acc.fat += (Number(it.fat100) || 0) * g / 100;
    acc.fibre += (Number(it.fibre100) || 0) * g / 100;
    return acc;
  }, { kj: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });

  // Day-quality indicator (v1.9.9): energy-weighted mean of the tier-adjusted
  // scores stored on today's items (per-kJ headline, per-100 g fallback —
  // same priority as the badges). Quality tiers are applied at log time
  // (§5.2), so this answers "how good was the nutrition actually eaten?" —
  // nutrient-dense food logged as Processed cannot read green. Items without
  // a score are skipped; items without kJ weight by grams.
  const dayQuality = useMemo(() => {
    let wsum = 0, ssum = 0;
    items.forEach(it => {
      const s = it.densityPerKj != null ? Number(it.densityPerKj)
        : (it.percentileScore != null ? Number(it.percentileScore) : null);
      if (s == null) return;
      const kj = (Number(it.kj100) || 0) * (Number(it.grams) || 0) / 100;
      const w = kj > 0 ? kj : (Number(it.grams) || 0);
      if (w <= 0) return;
      wsum += w;
      ssum += s * w;
    });
    return wsum > 0 ? ssum / wsum : null;
  }, [items]);
  const dayBand = qualityBand(dayQuality);

  const fmt = (v) => v > 0 ? (v < 10 ? v.toFixed(1) : Math.round(v)) : '—';

  // Energy balance card input — recompute when the log changes (a new item
  // moves the intake side) without waiting for a full reload.
  const eb = useMemo(() => energyBalance(bodyData, todaySessions, totals.kj), [bodyData, todaySessions, totals.kj]);

  // Recommended macro targets (v1.9.10) — derived from the same estimated
  // needs as the Energy balance card. Renders nothing without the complete
  // body profile (same gate as eb — no invented numbers, per v1.9.5).
  const macroTargets = useMemo(() => {
    if (eb == null || bodyData?.weightKg == null) return null;
    const kg = bodyData.weightKg;
    const maxRpe = eb.trainingSessions.reduce((m, s) => Math.max(m, s.actualRpe || 0), 0);
    const carbBand = TARGET_CARB_G_PER_KG.find(b => maxRpe <= b.maxRpe)
      || TARGET_CARB_G_PER_KG[TARGET_CARB_G_PER_KG.length - 1];
    const protein = TARGET_PROTEIN_G_PER_KG * kg;
    // Band carbs, capped by energy: the consensus g/kg targets assume
    // energy sufficiency, so when protein + band carbs would push fat
    // below the healthy 20% floor, carbs take what remains instead.
    const fatFloorKj = eb.totalNeeds * FAT_MIN_SHARE;
    const carbCapKj = Math.max(eb.totalNeeds - fatFloorKj - protein * KJ_PER_G.protein, 0);
    const bandCarbsKj = carbBand.gPerKg * kg * KJ_PER_G.carb;
    const capped = bandCarbsKj > carbCapKj;
    const carbs = (capped ? carbCapKj : bandCarbsKj) / KJ_PER_G.carb;
    const fatKj = eb.totalNeeds - protein * KJ_PER_G.protein - carbs * KJ_PER_G.carb;
    const fat = Math.max(fatKj / KJ_PER_G.fat, fatFloorKj / KJ_PER_G.fat);
    return {
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      carbPerKg: carbBand.gPerKg,
      bandCarbs: Math.round(carbBand.gPerKg * kg),
      carbBand: carbBand.label,
      capped,
      fatShare: Math.round((fat * KJ_PER_G.fat) / eb.totalNeeds * 100)
    };
  }, [eb, bodyData]);
  const fmtKj = (v) => Math.round(v).toLocaleString();

  return (
    <div className="an-container">
      <style>{`
        .an-container { padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; padding-bottom: 100px; }
        .an-header { display: flex; align-items: center; margin-bottom: 24px; }
        .an-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
        .an-subtitle { color: #64748b; font-size: 14px; margin-top: 4px; }
        .an-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .an-totals { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .an-total-box { background: #f1f5f9; border-radius: 10px; padding: 12px 8px; text-align: center; }
        .an-total-value { font-size: 17px; font-weight: 800; color: #0f172a; }
        .an-total-label { font-size: 11px; color: #64748b; margin-top: 2px; display: flex; align-items: center; justify-content: center; gap: 3px; }
        .an-search { width: 100%; padding: 12px; font-size: 15px; border: 2px solid #e2e8f0; border-radius: 8px; outline: none; box-sizing: border-box; }
        .an-search:focus { border-color: #10b981; }
        .an-result { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; }
        .an-result:last-child { border-bottom: none; }
        .an-result:hover { background: #f8fafc; }
        .an-result-name { font-size: 14px; font-weight: 600; color: #0f172a; }
        .an-result-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
        .an-badge { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
        .an-chip { padding: 10px 14px; border-radius: 999px; border: 2px solid #e2e8f0; background: #fff; font-size: 14px; font-weight: 600; color: #334155; cursor: pointer; }
        .an-chip.selected { border-color: #10b981; background: #ecfdf5; color: #047857; }
        .an-add-btn { width: 100%; background-color: #10b981; color: white; border: none; padding: 14px; font-size: 15px; font-weight: 700; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .an-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .an-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
        .an-item:last-child { border-bottom: none; }
        .an-icon-btn { background: none; border: none; cursor: pointer; color: #ef4444; padding: 6px; }
        .an-empty { text-align: center; color: #94a3b8; font-size: 14px; padding: 16px 0; }
        .an-spin { animation: anspin 1s linear infinite; }
        @keyframes anspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .an-search-wrapper { position: relative; }
        .an-search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
        .an-search-wrapper .an-search { padding-left: 34px; }
        .an-cat-title { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #94a3b8; margin: 14px 0 2px; }
        .an-pagination { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 14px 0 2px; }
        .an-page-btn { border: 1px solid #e2e8f0; background: #fff; color: #334155; font-size: 13px; font-weight: 600; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
        .an-page-btn.active { background: #10b981; border-color: #10b981; color: #fff; }
        .an-page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .an-page-dots { color: #94a3b8; font-size: 13px; }
        .an-quick-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
        .an-fav-btn { background: none; border: none; cursor: pointer; padding: 4px; display: flex; }
      `}</style>

      <div className="an-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', display: 'flex', marginRight: '12px' }}>
          <ArrowLeft size={28} />
        </button>
        <div>
          <h1 className="an-title">Nutrition Log</h1>
          <p className="an-subtitle">Three taps: meal or food → portion → add</p>
        </div>
        <div style={{ marginLeft: 'auto' }}><HelpButton page="athlete-nutrition" /></div>
      </div>

      {pageError && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          {pageError}
        </div>
      )}

      {/* Daily totals */}
      <div className="an-card">
        <div className="an-totals">
          <div
            className="an-total-box"
            style={dayQuality != null ? { background: dayBand.bg } : undefined}
            title={dayQuality != null
              ? `Today's logged nutrition quality: ${Math.round(dayQuality)} — energy-weighted average of your logged scores with quality tiers applied. Green = top quartile of the food database with good quality tiers.`
              : "Log foods or meals to see today's nutrition quality."}
          >
            <div className="an-total-value" style={dayQuality != null ? { color: dayBand.fg } : undefined}>{totals.kj > 0 ? Math.round(totals.kj).toLocaleString() : '—'}</div>
            <div className="an-total-label"><Flame size={11} color="#f59e0b" /> kJ</div>
          </div>
          <div className="an-total-box" title={macroTargets != null
            ? `Recommended: ${TARGET_PROTEIN_G_PER_KG} g per kg body weight (${macroTargets.protein} g) — midpoint of the sports nutrition consensus 1.4–2.0 g/kg (ACSM/AND/DC 2016; ISSN 2017).`
            : 'Add your body profile (My Progress) to see a recommended target.'}>
            <div className="an-total-value">{fmt(totals.protein)}{macroTargets != null && <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: 13 }}> / {macroTargets.protein}</span>}</div>
            <div className="an-total-label"><Beef size={11} color="#ef4444" /> protein g</div>
          </div>
          <div className="an-total-box" title={macroTargets != null
            ? `Recommended: ${macroTargets.capped
              ? `${macroTargets.carbs} g — capped by today's estimated energy needs (the ${macroTargets.carbPerKg} g/kg ${macroTargets.carbBand} target would be ${macroTargets.bandCarbs} g, more energy than the day allows).`
              : `${macroTargets.carbs} g (${macroTargets.carbPerKg} g/kg for a ${macroTargets.carbBand}) — consensus range 3–10 g/kg, scaled by training load.`}`
            : 'Add your body profile (My Progress) to see a recommended target.'}>
            <div className="an-total-value">{fmt(totals.carbs)}{macroTargets != null && <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: 13 }}> / {macroTargets.carbs}</span>}</div>
            <div className="an-total-label"><Wheat size={11} color="#f59e0b" /> carbs g</div>
          </div>
          <div className="an-total-box" title={macroTargets != null
            ? `Recommended: what remains of today's estimated needs after protein and carbs — ${macroTargets.fat} g ≈ ${macroTargets.fatShare}% of needs (consensus: fat 20–35% of energy).`
            : 'Add your body profile (My Progress) to see a recommended target.'}>
            <div className="an-total-value">{fmt(totals.fat)}{macroTargets != null && <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: 13 }}> / {macroTargets.fat}</span>}</div>
            <div className="an-total-label"><Droplet size={11} color="#f59e0b" /> fat g</div>
          </div>
        </div>
      </div>

      {/* Energy balance (v1.9.7) — estimation, not measurement. Renders only
          when the body profile is complete (sex / birth year / height / latest
          weight); otherwise it prompts to set it up — no midpoint estimates. */}
      <div className="an-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: '#334155', marginBottom: 10 }}>
          <Activity size={16} color="#10b981" /> Energy balance
        </div>
        {eb == null ? (
          <>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              Add your body profile (sex, birth year, height) and a body weight in My Progress to see your estimated daily energy needs next to what you log here.
            </div>
            <button
              onClick={() => navigate('/progress')}
              style={{ width: '100%', background: '#f1f5f9', color: '#334155', border: 'none', padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              Set up in My Progress <ArrowRight size={15} />
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 13.5, color: '#334155' }}>
              <span title="Mifflin-St Jeor estimate from your body profile — what your body needs at complete rest.">BMR (rest, est.)</span>
              <span style={{ fontWeight: 700 }}>{fmtKj(eb.bmr)} kJ</span>
              {eb.trainingSessions.length > 0 && (
                <>
                  <span title="Estimated from today's logged sessions: minutes × intensity (RPE) using coarse MET bands — an approximation, not a measurement.">
                    Training ({eb.trainingSessions.length} session{eb.trainingSessions.length > 1 ? 's' : ''}, est.)
                  </span>
                  <span style={{ fontWeight: 700 }}>+{fmtKj(eb.trainingKj)} kJ</span>
                </>
              )}
              <span style={{ borderTop: '1px solid #f1f5f9', paddingTop: 4 }} title="BMR × 1.2 (light daytime activity) plus today's training estimate.">Estimated needs today</span>
              <span style={{ fontWeight: 700, borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>{fmtKj(eb.totalNeeds)} kJ</span>
              <span title="The energy total from everything you logged today.">Logged so far</span>
              <span style={{ fontWeight: 700 }}>{eb.loggedKj > 0 ? fmtKj(eb.loggedKj) + ' kJ' : '—'}</span>
            </div>
            {eb.trainingSessions.length > 0 && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                {eb.trainingSessions.map(s => {
                  const est = sessionEnergyKj(s, bodyData.weightKg);
                  return `${s.sessionType}: ${s.actualMins} min @ RPE ${s.actualRpe} (${est.band}) ≈ ${fmtKj(est.kj)} kJ`;
                }).join(' · ')}
              </div>
            )}
            <div style={{ marginTop: 12, background: '#f1f5f9', borderRadius: 10, padding: '12px 14px', fontSize: 13.5, fontWeight: 600, color: '#334155' }}>
              {eb.loggedKj === 0
                ? <>Nothing logged yet — estimated needs for today ≈ {fmtKj(eb.totalNeeds)} kJ.</>
                : eb.balance < -1500
                  ? <>≈ {fmtKj(-eb.balance)} kJ <span style={{ color: '#b45309' }}>short</span> of estimated needs — worth a snack or a bigger meal.</>
                  : eb.balance <= 1500
                    ? <>Roughly fuelled — within ~1,500 kJ of estimated needs. <span style={{ fontWeight: 400, color: '#64748b' }}>Estimates, not exact numbers.</span></>
                    : <>≈ {fmtKj(eb.balance)} kJ <span style={{ color: '#15803d' }}>above</span> estimated needs today.</>}
            </div>
          </>
        )}
      </div>

      {/* Today's log */}
      <div className="an-card">
        <div style={{ fontWeight: 700, fontSize: 15, color: '#334155', marginBottom: 6 }}>Today's Log</div>
        {items.length === 0 ? (
          <div className="an-empty">Nothing logged yet — add your first food below.</div>
        ) : (
          items.map((it, idx) => {
            const b = scoreBadge(it.percentileScore, it.scoreAxes, it.densityPerKj);
            const g = Number(it.grams) || 0;
            const kj = it.kj100 != null ? Math.round(it.kj100 * g / 100) : null;
            const p = it.protein100 != null ? Math.round(it.protein100 * g / 10) / 10 : null;
            return (
              <div key={idx} className="an-item">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{it.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {stripBrandLabel(it.portionLabel) || `${g} g`} · {kj != null ? `${kj} kJ` : '—'}{p != null ? ` · ${p} g protein` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="an-badge" style={{ background: b.bg, color: b.fg }}>{b.label}</span>
                  <button className="an-icon-btn" onClick={() => removeItem(idx)} disabled={removing} title="Remove item">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {/* Quick meals — tap 1: meal, tap 2: tier + portion, tap 3: add */}
      <div className="an-card">
        {!meal ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: '#334155', marginBottom: 12 }}>
              <Salad size={16} color="#10b981" /> Quick meals
            </div>
            {loadingMeals && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 4px', color: '#64748b', fontSize: 13 }}>
                <Loader2 size={14} className="an-spin" /> Loading meals…
              </div>
            )}
            {mealsError && <div style={{ color: '#b91c1c', fontSize: 13, padding: '10px 0' }}>Failed to load meals: {mealsError}</div>}
            {!loadingMeals && !mealsError && meals.length === 0 && (
              <div className="an-empty">No meals available yet.</div>
            )}
            {!loadingMeals && !mealsError && meals.length > 0 && (
              <>
                {/* Your list: starred meals + starred foods (personal, newest first) */}
                {starredMeals.length === 0 && favourites.length === 0 && (
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                    Star a meal or food to pin it here — your pins always come first.
                  </div>
                )}
                {starredMeals.map(renderMealRow)}
                {favourites.map(renderFoodRow)}
                {/* Generic archetypes: usage-ranked, collapsed behind More meals */}
                {visibleGenericMeals.map(renderMealRow)}
                {genericMeals.length > 3 && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
                    <button className="an-page-btn" onClick={() => setShowMoreMeals(s => !s)}>
                      {showMoreMeals ? 'Fewer meals' : `More meals (${genericMeals.length - 3})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: '#334155', marginBottom: 8 }}>
              <CheckCircle size={16} color="#10b981" /> {meal.name}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              Normal serve{meal.baseGrams != null ? ` · ${Math.round(meal.baseGrams)} g` : ''}{meal.energyKj != null ? ` · ${Math.round(meal.energyKj).toLocaleString()} kJ` : ''}{meal.proteinG != null ? ` · ${meal.proteinG} g protein` : ''}
              {meal.percentileScore != null ? ` · Score ${Math.round(meal.percentileScore)}` : ''}
              {meal.componentCount != null ? ` (${meal.scoredComponents}/${meal.componentCount} components scored)` : ''}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 8 }}>How was it prepared?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {mealTiers.map(t => (
                <button
                  key={t.tier}
                  className={`an-chip ${mealTier === t.tier ? 'selected' : ''}`}
                  onClick={() => setMealTier(t.tier)}
                  title={`Score multiplier ×${t.scoreMultiplier}`}
                >
                  {t.badge}
                </button>
              ))}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 8 }}>How much?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {mealPortions.map(p => (
                <button
                  key={p.portionSize}
                  className={`an-chip ${mealPortion === p.portionSize ? 'selected' : ''}`}
                  onClick={() => setMealPortion(p.portionSize)}
                  title={`Serve multiplier ×${p.multiplier}`}
                >
                  {cap(p.portionSize)}{meal.baseGrams != null ? ` · ${Math.round(meal.baseGrams * p.multiplier)} g` : ''}
                </button>
              ))}
            </div>
            {meal.energyKj != null && (() => {
              const pm = mealPortions.find(p => p.portionSize === mealPortion)?.multiplier ?? 1;
              return (
                <div style={{ fontSize: 13, color: '#334155', fontWeight: 600, marginBottom: 12 }}>
                  ≈ {Math.round(meal.energyKj * pm).toLocaleString()} kJ{meal.proteinG != null ? ` · ${(meal.proteinG * pm).toFixed(1)} g protein` : ''}
                </div>
              );
            })()}
            <button className="an-add-btn" onClick={tapAddMeal} disabled={saving}>
              {saving ? 'Adding…' : justLogged ? <><CheckCircle size={16} /> Added!</> : 'Add to Log'}
            </button>
            <button
              onClick={() => setMeal(null)}
              style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}
            >
              Pick a different meal
            </button>
          </>
        )}
      </div>


      {/* Add food — tap 1: search, tap 2: portion, tap 3: add */}
      <div className="an-card">
        {!selected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: '#334155', marginBottom: 12 }}>
              <Utensils size={16} color="#10b981" /> What did you eat?
            </div>
            {/* Recents only here — starred foods now live in Quick meals above */}
            {recents.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="an-quick-title">🕘 Recent</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {recents.map(f => (
                    <button key={f.id} className="an-chip" onClick={() => tapFood(f)} title={f.description}>
                      {f.description.length > 32 ? f.description.slice(0, 32) + '…' : f.description}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="an-search-wrapper">
              <Search className="an-search-icon" size={16} />
              <input
                className="an-search"
                placeholder="Search meals and foods…"
                value={searchQuery}
                onChange={handleSearch}
                autoComplete="off"
              />
            </div>
            {loadingDb && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 4px', color: '#64748b', fontSize: 13 }}>
                <Loader2 size={14} className="an-spin" /> Loading food database…
              </div>
            )}
            {dbError && <div style={{ color: '#b91c1c', fontSize: 13, padding: '10px 0' }}>Failed to load foods: {dbError}</div>}
            {/* Popular picks: 4 nutrient-per-kJ meals + 6 curated staples,
                shown only while the search is empty. Deliberately curated —
                global score ranking surfaces fortified powders. The paginated
                category list appears only once you type. */}
            {!loadingDb && !dbError && isPicking && (popularMeals.length > 0 || popularStaples.length > 0) && (
              <>
                <div style={{ fontSize: 12, color: '#94a3b8', margin: '10px 0 4px' }}>
                  Popular picks — search to find anything else
                </div>
                {popularMeals.map(renderMealRow)}
                {popularStaples.map(renderFoodRow)}
              </>
            )}
            {/* v1.9.4 unified search: matching meals first, foods underneath */}
            {!loadingDb && !dbError && mealMatches.length > 0 && (
              <>
                <div className="an-cat-title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Salad size={11} color="#10b981" /> Meals
                </div>
                {mealMatches.map(renderMealRow)}
              </>
            )}
            {!loadingDb && !dbError && !isPicking && pageGroups.length === 0 && mealMatches.length === 0 && (
              <div className="an-empty">No meals or foods matched “{searchQuery}”.</div>
            )}
            {!loadingDb && !dbError && !isPicking && pageGroups.map(group => (
              <div key={group.cat}>
                <h3 className="an-cat-title">{group.cat}</h3>
                {group.items.map(f => {
                  const b = scoreBadge(f.percentileScore, f.scoreAxes, f.densityPerKj);
                  return (
                    <div key={f.id} className="an-result" onClick={() => tapFood(f)}>
                      <div style={{ minWidth: 0 }}>
                        <div className="an-result-name">{f.description}</div>
                        <div className="an-result-sub">
                          {f.source} · {stripBrandLabel(f.portionLabel) || 'per 100 g'}{f.kj100 != null ? ` · ${Math.round(f.kj100)} kJ/100g` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button
                        className="an-fav-btn"
                        onClick={(e) => { e.stopPropagation(); toggleFav(f); }}
                        title={favIds.has(f.id) ? 'Remove from favourites' : 'Save to favourites'}
                      >
                        <Star size={16} color={favIds.has(f.id) ? '#f59e0b' : '#cbd5e1'} fill={favIds.has(f.id) ? '#f59e0b' : 'none'} />
                      </button>
                      <span className="an-badge" style={{ background: b.bg, color: b.fg }} title={b.title}>Score {b.label}{f.scoreAxes != null ? ` · ${f.scoreAxes}/17` : ''}</span>
                    </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {!loadingDb && !dbError && !isPicking && totalPages > 1 && (
              <div className="an-pagination">
                <button className="an-page-btn" disabled={currentPage === 1} onClick={() => handlePageChange(currentPage - 1)}>Prev</button>
                <PageButtons currentPage={currentPage} totalPages={totalPages} onChange={handlePageChange} />
                <button className="an-page-btn" disabled={currentPage === totalPages} onClick={() => handlePageChange(currentPage + 1)}>Next</button>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: '#334155', marginBottom: 8 }}>
              <CheckCircle size={16} color="#10b981" /> {selected.description}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              {selected.source} · Score {selected.percentileScore != null ? Math.round(selected.percentileScore) : '—'}{selected.scoreAxes != null ? ` (${selected.scoreAxes}/17 axes)` : ''}{selected.densityPerKj != null ? ` · ${Math.round(selected.densityPerKj)}/100 kJ` : ''}{selected.kj100 != null ? ` · ${Math.round(selected.kj100)} kJ per 100 g` : ''}
            </div>
            {selected.portionGrams != null && (
              <div style={{ marginBottom: 10 }}>
                <button
                  className={`an-chip ${parseFloat(grams) === Math.round(selected.portionGrams) && portionLabel === (stripBrandLabel(selected.portionLabel || '') || '') ? 'selected' : ''}`}
                  onClick={() => tapPreset(Math.round(selected.portionGrams))}
                >
                  {stripBrandLabel(selected.portionLabel) || 'Standard'} ({Math.round(selected.portionGrams)} g)
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {GRAM_PRESETS.map(g => (
                <button
                  key={g}
                  className={`an-chip ${parseFloat(grams) === g && portionLabel === `${g} g` ? 'selected' : ''}`}
                  onClick={() => tapPreset(g)}
                >
                  {g} g
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input
                className="an-search"
                style={{ maxWidth: 120 }}
                type="number"
                min="1"
                placeholder="Custom g"
                value={grams}
                onChange={e => { setGrams(e.target.value); setPortionLabel(''); }}
              />
              <span style={{ fontSize: 13, color: '#64748b' }}>grams</span>
              {parseFloat(grams) > 0 && (
                <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
                  ≈ {preview('kj') != null ? `${preview('kj')} kJ` : ''}{preview('protein') != null ? ` · ${preview('protein')} g protein` : ''}
                </span>
              )}
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 8 }}>How was it prepared?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {(mealTiers.length ? mealTiers : FOOD_TIERS_FALLBACK).map(t => (
                <button
                  key={t.tier}
                  className={`an-chip ${foodTier === t.tier ? 'selected' : ''}`}
                  onClick={() => setFoodTier(t.tier)}
                  title={`Score multiplier ×${t.scoreMultiplier}`}
                >
                  {t.badge}
                </button>
              ))}
            </div>
            <button className="an-add-btn" onClick={tapAdd} disabled={saving || !(parseFloat(grams) > 0)}>
              {saving ? 'Adding…' : justLogged ? <><CheckCircle size={16} /> Added!</> : 'Add to Log'}
            </button>
            <button
              onClick={() => { setSelected(null); setGrams(''); setPortionLabel(''); }}
              style={{ width: '100%', marginTop: 8, background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}
            >
              Pick a different food
            </button>
          </>
        )}
      </div>
    </div>
  );
}