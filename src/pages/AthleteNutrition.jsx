import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Utensils, CheckCircle, Trash2, Flame, Beef, Wheat, Leaf, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import { fetchFoodDatabase, saveNutritionLog, fetchNutritionLogs, updateNutritionItems } from '../api';
import { ymd } from '../utils/cycleMath';

// Exercise-library search pattern: full database loaded once (cached), then
// instant client-side multi-word filtering, grouped by category, paginated.
const ITEMS_PER_PAGE = 50;
const FOOD_DB_CACHE_KEY = 'fp_food_database_v1';

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

// Score badge colors: higher percentile rank = more nutrient-dense
const scoreBadge = (score) => {
  if (score == null) return { bg: '#e2e8f0', fg: '#64748b', label: '—' };
  if (score >= 70) return { bg: '#dcfce7', fg: '#15803d', label: `${Math.round(score)}` };
  if (score >= 40) return { bg: '#fef3c7', fg: '#b45309', label: `${Math.round(score)}` };
  return { bg: '#fee2e2', fg: '#b91c1c', label: `${Math.round(score)}` };
};

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

  const [logId, setLogId] = useState(null);          // today's log row
  const [items, setItems] = useState([]);            // today's items
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [justLogged, setJustLogged] = useState(false);
  const [pageError, setPageError] = useState(null);

  // Load today's (or the most recent) log row
  const loadToday = async () => {
    const res = await fetchNutritionLogs(7);
    if (res.error) { setPageError(res.error); return; }
    const today = ymd(new Date());
    const row = (res.logs || []).find(l => l.date === today && !l.sessionLogId);
    setLogId(row ? row.id : null);
    setItems(row ? row.items : []);
  };

  useEffect(() => { loadToday(); }, [userEmail]);

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

  const tapFood = (food) => {
    setSelected(food);
    setQuery('');
    setResults([]);
    if (food.portionGrams != null) {
      setGrams(String(Math.round(food.portionGrams)));
      setPortionLabel(food.portionLabel || `${Math.round(food.portionGrams)} g`);
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
    const item = {
      food_id: selected.id,
      grams: g,
      name: selected.description,
      portionLabel: portionLabel || `${g} g`,
      kj100: selected.kj100,
      protein100: selected.protein100,
      carbs100: selected.carbs100,
      fibre100: selected.fibre100,
      score: selected.score
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

  // Daily totals (client-side, per plan §3 — no server rollups)
  const totals = items.reduce((acc, it) => {
    const g = Number(it.grams) || 0;
    acc.kj += (Number(it.kj100) || 0) * g / 100;
    acc.protein += (Number(it.protein100) || 0) * g / 100;
    acc.carbs += (Number(it.carbs100) || 0) * g / 100;
    acc.fibre += (Number(it.fibre100) || 0) * g / 100;
    return acc;
  }, { kj: 0, protein: 0, carbs: 0, fibre: 0 });

  const fmt = (v) => v > 0 ? (v < 10 ? v.toFixed(1) : Math.round(v)) : '—';

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
      `}</style>

      <div className="an-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', display: 'flex', marginRight: '12px' }}>
          <ArrowLeft size={28} />
        </button>
        <div>
          <h1 className="an-title">Nutrition Log</h1>
          <p className="an-subtitle">Three taps: food → portion → add</p>
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
          <div className="an-total-box">
            <div className="an-total-value">{totals.kj > 0 ? Math.round(totals.kj).toLocaleString() : '—'}</div>
            <div className="an-total-label"><Flame size={11} color="#f59e0b" /> kJ</div>
          </div>
          <div className="an-total-box">
            <div className="an-total-value">{fmt(totals.protein)}</div>
            <div className="an-total-label"><Beef size={11} color="#ef4444" /> protein g</div>
          </div>
          <div className="an-total-box">
            <div className="an-total-value">{fmt(totals.carbs)}</div>
            <div className="an-total-label"><Wheat size={11} color="#f59e0b" /> carbs g</div>
          </div>
          <div className="an-total-box">
            <div className="an-total-value">{fmt(totals.fibre)}</div>
            <div className="an-total-label"><Leaf size={11} color="#10b981" /> fibre g</div>
          </div>
        </div>
      </div>

      {/* Add food — tap 1: search, tap 2: portion, tap 3: add */}
      <div className="an-card">
        {!selected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: '#334155', marginBottom: 12 }}>
              <Utensils size={16} color="#10b981" /> What did you eat?
            </div>
            <div className="an-search-wrapper">
              <Search className="an-search-icon" size={16} />
              <input
                className="an-search"
                placeholder="Search foods…"
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
            {!loadingDb && !dbError && pageGroups.length === 0 && (
              <div className="an-empty">No foods matched “{searchQuery}”.</div>
            )}
            {!loadingDb && !dbError && pageGroups.map(group => (
              <div key={group.cat}>
                <h3 className="an-cat-title">{group.cat}</h3>
                {group.items.map(f => {
                  const b = scoreBadge(f.score);
                  return (
                    <div key={f.id} className="an-result" onClick={() => tapFood(f)}>
                      <div style={{ minWidth: 0 }}>
                        <div className="an-result-name">{f.description}</div>
                        <div className="an-result-sub">
                          {f.source} · {f.portionLabel || 'per 100 g'}{f.kj100 != null ? ` · ${Math.round(f.kj100)} kJ/100g` : ''}
                        </div>
                      </div>
                      <span className="an-badge" style={{ background: b.bg, color: b.fg }} title="Nutrient density score (0–100)">Score {b.label}</span>
                    </div>
                  );
                })}
              </div>
            ))}
            {!loadingDb && !dbError && totalPages > 1 && (
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
              {selected.source} · Score {selected.score != null ? Math.round(selected.score) : '—'}{selected.kj100 != null ? ` · ${Math.round(selected.kj100)} kJ per 100 g` : ''}
            </div>
            {selected.portionGrams != null && (
              <div style={{ marginBottom: 10 }}>
                <button
                  className={`an-chip ${parseFloat(grams) === Math.round(selected.portionGrams) && portionLabel === (selected.portionLabel || '') ? 'selected' : ''}`}
                  onClick={() => tapPreset(Math.round(selected.portionGrams))}
                >
                  {selected.portionLabel || 'Standard'} ({Math.round(selected.portionGrams)} g)
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

      {/* Today's log */}
      <div className="an-card">
        <div style={{ fontWeight: 700, fontSize: 15, color: '#334155', marginBottom: 6 }}>Today's Log</div>
        {items.length === 0 ? (
          <div className="an-empty">Nothing logged yet — add your first food above.</div>
        ) : (
          items.map((it, idx) => {
            const b = scoreBadge(it.score);
            const g = Number(it.grams) || 0;
            const kj = it.kj100 != null ? Math.round(it.kj100 * g / 100) : null;
            const p = it.protein100 != null ? Math.round(it.protein100 * g / 10) / 10 : null;
            return (
              <div key={idx} className="an-item">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{it.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {it.portionLabel || `${g} g`} · {kj != null ? `${kj} kJ` : '—'}{p != null ? ` · ${p} g protein` : ''}
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
    </div>
  );
}