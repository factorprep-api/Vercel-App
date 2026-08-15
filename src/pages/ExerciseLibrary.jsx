import { useState, useEffect, useMemo } from 'react';
import { Play, Search, X, Pencil, Trash2, Plus, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getYouTubeId, normalizeVideoUrl } from '../utils/helpers';
import { useAuth } from '../hooks/useAuth';
import { fetchExerciseLibrary, deleteExerciseFromLibrary, updateExerciseInLibrary, addExerciseToLibrary, getAthleteByEmail } from '../api.js';
import './exercise-library.css';
import HelpButton from '../components/HelpButton';

const ITEMS_PER_PAGE = 50;

function buildGrouped(data) {
  const map = {};
  data.forEach(ex => {
    const cat = (ex.muscle || 'Uncategorized').toUpperCase();
    if (!map[cat]) map[cat] = [];
    map[cat].push(ex);
  });
  return Object.keys(map).sort().map(cat => ({
    cat,
    items: map[cat].sort((a, b) => a.name.localeCompare(b.name)),
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
    buttons.push(<button key="first" className="exlib-page-btn" onClick={() => onChange(1)}>1</button>);
    if (startP > 2) buttons.push(<span key="dots1" className="exlib-page-dots">...</span>);
  }
  for (let i = startP; i <= endP; i++) {
    buttons.push(
      <button key={i} className={`exlib-page-btn ${i === currentPage ? 'active' : ''}`} onClick={() => onChange(i)}>
        {i}
      </button>
    );
  }
  if (endP < totalPages) {
    if (endP < totalPages - 1) buttons.push(<span key="dots2" className="exlib-page-dots">...</span>);
    buttons.push(<button key="last" className="exlib-page-btn" onClick={() => onChange(totalPages)}>{totalPages}</button>);
  }
  return <>{buttons}</>;
}

export default function ExerciseLibrary({ viewMode: propViewMode = 'athlete' }) {
  const [fullLibrary, setFullLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [modalVideo, setModalVideo] = useState(null);
  const [viewFilter, setViewFilter] = useState('all');
  const [toast, setToast] = useState(null);
  
  // Edit State
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editVideo, setEditVideo] = useState('');
  const [editMuscle, setEditMuscle] = useState('');
  const [editFormula, setEditFormula] = useState(''); // NEW: Replaces baseLift/multiplier
  
  const [deleting, setDeleting] = useState(null);
  const [adding, setAdding] = useState(false);
  const [assignedCoachEmail, setAssignedCoachEmail] = useState('');
  
  // FIX: Destructured athleteName so we can pass it to the Add modal
  const { role, userEmail, athleteName, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const queryParams = new URLSearchParams(window.location.search);
  const urlViewMode = queryParams.get('viewMode');
  const viewMode = urlViewMode || propViewMode;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (authLoading) return;
    let isMounted = true; 

    (async () => {
      const cached = localStorage.getItem('fp_exercise_library');
      if (cached && isMounted) {
        try {
          setFullLibrary(JSON.parse(cached));
          setLoading(false);
        } catch {}
      }
      
      const fetchTasks = [];

      if (userEmail) {
        fetchTasks.push(
          getAthleteByEmail(userEmail).then(athleteResult => {
            if (athleteResult && athleteResult.status === 'Success' && isMounted) {
              setAssignedCoachEmail(athleteResult.coachEmail || athleteResult.coach || '');
            }
          }).catch(() => {})
        );
      }

      fetchTasks.push(
        fetchExerciseLibrary().then(lib => {
          if (isMounted) {
            setFullLibrary(lib);
            localStorage.setItem('fp_exercise_library', JSON.stringify(lib));
            setLoading(false);
          }
        }).catch(() => {
          if (isMounted && !cached) setError(true);
          if (isMounted) setLoading(false);
        })
      );

      await Promise.all(fetchTasks);
    })();

    return () => { isMounted = false; };
  }, [userEmail, authLoading]);

  function isCoachOwned(exercise) {
    if (!exercise.ownerEmail || !userEmail) return false;
    return exercise.ownerEmail.toLowerCase() === userEmail.toLowerCase();
  }

  function renderCoachBadge(exercise) {
    if (!exercise.ownerEmail) return null;
    const isMine = userEmail && exercise.ownerEmail.toLowerCase() === userEmail.toLowerCase();
    const isMyCoach = assignedCoachEmail && exercise.ownerEmail.toLowerCase() === assignedCoachEmail.toLowerCase();
    
    if (isMine || isMyCoach) {
      return <span className="exlib-coach-badge">• Coach</span>;
    }
    return null;
  }

  function showToast(message, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }

  async function reloadLibrary() {
    try {
      const lib = await fetchExerciseLibrary();
      setFullLibrary(lib);
      localStorage.setItem('fp_exercise_library', JSON.stringify(lib));
    } catch {
      // ignore reload errors
    }
  }

  function openEditModal(exercise) {
    setEditing(exercise);
    setEditName(exercise.name);
    setEditVideo(exercise.rawUrl || '');
    setEditMuscle(exercise.muscle || '');
    setEditFormula(exercise.formula || ''); // FIX: Load the formula state
  }

  async function handleEditSave() {
    if (!editName.trim()) { showToast('Exercise name is required.', true); return; }
    try {
      const res = await updateExerciseInLibrary({
        name: editName.trim(),
        video: editVideo.trim(),
        muscle: editMuscle.trim(),
        formula: editFormula, // Send the new formula state
        originalName: editing.name
      });
      if (res.status === 'Success') {
        showToast('Exercise updated!');
        setEditing(null);
        await reloadLibrary();
      } else {
        showToast('Update failed', true);
      }
    } catch (err) {
      showToast('Network error', true);
    }
  }

  async function handleDelete(exercise) {
    if (!confirm(`Delete "${exercise.name}"? This cannot be undone.`)) return;
    setDeleting(exercise.name);
    try {
      const res = await deleteExerciseFromLibrary(exercise.name);
      if (res.status === 'Success') {
        showToast(`"${exercise.name}" deleted`);
        await reloadLibrary();
      } else {
        showToast('Delete failed', true);
      }
    } catch (err) {
      showToast('Network error', true);
    }
    setDeleting(null);
  }

  const existingCategories = useMemo(() => {
    const cats = new Set();
    fullLibrary.forEach(ex => { if (ex.muscle) cats.add(ex.muscle); });
    return [...cats].sort();
  }, [fullLibrary]);

  const filteredForView = useMemo(() => {
    const allowedLibrary = fullLibrary.filter(ex => {
      if (!ex.ownerEmail) return true; 
      if (!userEmail) return false;
      
      const isMine = ex.ownerEmail.toLowerCase() === userEmail.toLowerCase();
      const isMyCoach = assignedCoachEmail && ex.ownerEmail.toLowerCase() === assignedCoachEmail.toLowerCase();
      
      return isMine || isMyCoach;
    });

    if (viewFilter === 'my') {
      return allowedLibrary.filter(ex => isCoachOwned(ex));
    }
    return allowedLibrary;
  }, [fullLibrary, viewFilter, userEmail, assignedCoachEmail]);

  const groupedLibrary = useMemo(() => buildGrouped(filteredForView), [filteredForView]);

  const currentDataset = useMemo(() => {
    if (debouncedQuery.length >= 2) {
      const tokens = debouncedQuery.toLowerCase().split(/\s+/);
      const filtered = filteredForView.filter(ex => {
        const n = ex.name.toLowerCase();
        const m = (ex.muscle || '').toLowerCase();
        return tokens.every(t => n.includes(t) || m.includes(t));
      });
      return buildGrouped(filtered);
    }
    return groupedLibrary;
  }, [debouncedQuery, filteredForView, groupedLibrary]);

  const pageGroups = useMemo(() => getPageSlice(currentDataset, currentPage), [currentDataset, currentPage]);
  const totalItems = currentDataset.reduce((s, g) => s + g.items.length, 0);
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const handleSearch = (e) => { setSearchQuery(e.target.value); setCurrentPage(1); };
  const handlePageChange = (page) => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openModal = (rawUrl) => setModalVideo({ url: rawUrl, ytId: getYouTubeId(rawUrl) });
  const closeModal = () => setModalVideo(null);

  const viewFilters = [
    ...(role === 'coach' && viewMode === 'coach' ? [{ id: 'all', label: 'All Exercises' }, { id: 'my', label: 'My Exercises' }] : [])
  ];

  if (authLoading) {
    return (
      <div className="exlib-container">
        <div className="exlib-body">
          <p className="exlib-placeholder">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="exlib-container">
        <div className="exlib-body">
          <p className="exlib-placeholder">Loading exercises...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="exlib-container">
      <div className="exlib-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', padding: 0, display: 'flex', marginRight: '12px' }}>
              <ArrowLeft size={28} />
            </button>
            <h2 style={{ fontSize: '24px', color: '#0f172a', fontWeight: '700', margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              Exercise Library
            </h2>
          </div>

          
          {role === 'coach' && viewMode === 'coach' && (
            <button className="exlib-add-btn" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add Exercise
            </button>
          )}
        </div>

        <div className="exlib-view-filters">
          {viewFilters.map(filter => (
            <button
              key={filter.id}
              className={`exlib-view-filter ${viewFilter === filter.id ? 'active' : ''}`}
              onClick={() => { setViewFilter(filter.id); setCurrentPage(1); }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="exlib-search-wrapper">
          <Search className="exlib-search-icon" size={18} />
          <input
            type="text"
            className="exlib-search-box"
            value={searchQuery}
            onChange={handleSearch}
            placeholder="Search keywords..."
          />
        </div>

        {error && <p className="exlib-error-text">Failed to load data. Please refresh.</p>}
        {!loading && !error && pageGroups.length === 0 && <p className="exlib-placeholder">No exercises found.</p>}

        {!loading && !error && pageGroups.map(group => (
          <div key={group.cat}>
            <h3 className="exlib-category-title">{group.cat}</h3>
            <div className="exlib-video-row">
              {group.items.map((ex, idx) => {
                const ytId = getYouTubeId(ex.rawUrl);
                const owned = isCoachOwned(ex);
                const isImg =
                  ex.rawUrl.toLowerCase().includes('.png') ||
                  ex.rawUrl.toLowerCase().includes('.jpg');

                return (
                  <div key={`${group.cat}-${idx}`} className="exlib-video-card" onClick={() => openModal(ex.rawUrl)} title={ex.name}>
                    <div className="exlib-thumbnail" style={{ backgroundColor: isImg ? '#fff' : '' }}>
                      {ytId ? (
                        <img className="exlib-vid-thumb" src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} loading="lazy" alt={ex.name} />
                      ) : isImg ? (
                        <img className="exlib-vid-thumb" src={ex.rawUrl} loading="lazy" alt={ex.name} style={{ objectFit: 'contain' }} />
                      ) : (
                        <video className="exlib-vid-thumb-video" src={`${normalizeVideoUrl(ex.rawUrl)}#t=0.001`} preload="metadata" muted playsInline />
                      )}

                      {!isImg && <Play className="exlib-play-icon" size={32} fill="currentColor" stroke="none" />}

                      {owned && viewMode === 'coach' && (
                        <div className="exlib-owner-actions" onClick={e => e.stopPropagation()}>
                          <button className="exlib-edit-btn" onClick={() => openEditModal(ex)} title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button className="exlib-delete-btn" onClick={() => handleDelete(ex)} disabled={deleting === ex.name} title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="exlib-card-info">
                      <p className="exlib-v-title">
                        {ex.name} {renderCoachBadge(ex)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {totalPages > 1 && (
          <div className="exlib-pagination">
            <button className="exlib-page-btn" disabled={currentPage === 1} onClick={() => handlePageChange(currentPage - 1)}>Prev</button>
            <PageButtons currentPage={currentPage} totalPages={totalPages} onChange={handlePageChange} />
            <button className="exlib-page-btn" disabled={currentPage === totalPages} onClick={() => handlePageChange(currentPage + 1)}>Next</button>
          </div>
        )}
      </div>

      {adding && (
        <AddExerciseModal
          userEmail={userEmail}
          athleteName={athleteName}
          existingCategories={existingCategories}
          onClose={() => setAdding(false)}
          onSuccess={async () => {
            setAdding(false);
            showToast('Exercise added! It will appear with a • Coach badge.');
            await reloadLibrary();
          }}
        />
      )}

      {modalVideo && (() => {
        const isImage =
          modalVideo.url.toLowerCase().includes('.png') ||
          modalVideo.url.toLowerCase().includes('.jpg') ||
          modalVideo.url.toLowerCase().includes('.jpeg') ||
          modalVideo.url.toLowerCase().includes('.webp');

        return (
          <div className="exlib-modal-overlay" onClick={closeModal}>
            <div
               className={`exlib-modal-content ${isImage ? 'exlib-image-modal' : 'exlib-video-modal'}`}
              onClick={e => e.stopPropagation()}
            >
              <button className="exlib-close-btn" onClick={closeModal}>
                <X size={22} />
              </button>

              {isImage ? (
                <div className="exlib-image-viewer">
                  <img src={modalVideo.url} alt="Drill" />
                </div>
              ) : (
                <div className="exlib-player-container">
                  {modalVideo.ytId ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${modalVideo.ytId}?autoplay=1&rel=0`}
                      allowFullScreen
                      allow="autoplay; encrypted-media"
                      title="Exercise Video"
                    />
                  ) : (
                    <video
                      controls
                      autoPlay
                      playsInline
                      controlsList="nodownload"
                    >
                      <source src={normalizeVideoUrl(modalVideo.url)} type="video/mp4" />
                    </video>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {editing && (
        <div className="exlib-modal-overlay" onClick={() => setEditing(null)}>
          <div className="exlib-edit-modal" onClick={e => e.stopPropagation()}>
            <button className="exlib-close-btn" onClick={() => setEditing(null)}><X size={24} /></button>
            <h3 className="exlib-edit-title">Edit Exercise</h3>

            <div className="exlib-edit-field">
              <label className="exlib-edit-label">Exercise Name:</label>
              <input className="exlib-edit-input" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>

            <div className="exlib-edit-field">
              <label className="exlib-edit-label">Category / Muscle:</label>
              <input className="exlib-edit-input" value={editMuscle} onChange={e => setEditMuscle(e.target.value)} />
            </div>

            <div className="exlib-edit-field">
              <label className="exlib-edit-label">Video / Image URL:</label>
              <input className="exlib-edit-input" value={editVideo} onChange={e => setEditVideo(e.target.value)} />
            </div>

            {/* FIX: Replaced BaseLift/Multiplier with Yes/No Dropdown in Edit Mode too! */}
            <div className="exlib-edit-field">
              <label className="exlib-edit-label">Enable 1RM Calculation (Epley Formula):</label>
              <select className="exlib-edit-input" value={editFormula} onChange={e => setEditFormula(e.target.value)}>
                <option value="">No (Standard Exercise)</option>
                <option value="yes">Yes (Calculate 1RM targets)</option>
              </select>
            </div>

            <button className="exlib-edit-save-btn" onClick={handleEditSave}>Save Changes</button>
          </div>
        </div>
      )}

      <HelpButton pageName="Exercise Library" position="bottom-right" />

      {toast && (
        <div className={`exlib-toast ${toast.isError ? 'error' : ''}`}>
          {toast.isError ? <X size={16} /> : <Pencil size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

// FIX: Completely rebuilt the modal props and logic
function AddExerciseModal({ userEmail, athleteName, existingCategories, onClose, onSuccess }) {
  // Dynamically default to the Coach's name, just like the Drill Designer
  const coachCategoryName = athleteName ? `${athleteName} Exercises` : 'Coach Exercises';

  const [name, setName] = useState('');
  const [video, setVideo] = useState('');
  const [muscle, setMuscle] = useState(coachCategoryName);
  
  // FIX: Replaced baseLift and multiplier with a single formula state
  const [isFormula, setIsFormula] = useState(''); // "" or "yes"
  const [saving, setSaving] = useState(false);

  const categoryOptions = useMemo(() => {
    const baseCats = new Set([coachCategoryName, ...existingCategories]);
    return [...baseCats].sort();
  }, [existingCategories, coachCategoryName]);

  async function handleSave() {
    if (!name.trim()) { alert('Exercise name is required.'); return; }
    if (!userEmail) { alert('Not authenticated. Please sign in again.'); return; }
    setSaving(true);
    try {
      const res = await addExerciseToLibrary({
        name: name.trim(),
        video: video.trim(),
        muscle: muscle.trim() || coachCategoryName,
        formula: isFormula, // Pass "yes" or "" directly to api.js
        ownerEmail: userEmail
      });
      if (res.status === 'Success') {
        await onSuccess();
      } else {
        alert('Add failed: ' + (res.message || 'Unknown error'));
      }
    } catch (err) {
      alert('Network error. Please try again.');
    }
    setSaving(false);
  }

  return (
    <div className="exlib-modal-overlay" onClick={onClose}>
      <div className="exlib-add-modal" onClick={e => e.stopPropagation()}>
        <button className="exlib-close-btn" onClick={onClose}><X size={24} /></button>
        <h3 className="exlib-add-title">Add New Exercise</h3>
        
        <div className="exlib-add-field">
          <label className="exlib-add-label">Exercise Name (Required):</label>
          <input className="exlib-add-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Goblet Squat" />
        </div>
        
        <div className="exlib-add-field">
          <label className="exlib-add-label">Video URL:</label>
          <input className="exlib-add-input" value={video} onChange={e => setVideo(e.target.value)} placeholder="YouTube or MP4 link" />
        </div>
        
        <div className="exlib-add-field">
          <label className="exlib-add-label">Muscle / Category:</label>
          <input className="exlib-add-input" list="exlib-muscle-list" value={muscle} onChange={e => setMuscle(e.target.value)} placeholder="e.g. Chest" />
          <datalist id="exlib-muscle-list">
            {categoryOptions.map(cat => <option key={cat} value={cat} />)}
          </datalist>
          <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0 0' }}>Defaults to "{coachCategoryName}". Type or select existing categories.</p>
        </div>
        
        {/* FIX: New Dropdown replacing BaseLift/Multiplier */}
        <div className="exlib-add-field">
          <label className="exlib-add-label">Enable 1RM Calculation (Epley Formula):</label>
          <select className="exlib-add-input" value={isFormula} onChange={e => setIsFormula(e.target.value)}>
            <option value="">No (Standard Exercise)</option>
            <option value="yes">Yes (Calculate 1RM targets)</option>
          </select>
        </div>
        
        <button className="exlib-add-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Adding...' : 'Add Exercise'}
        </button>
      </div>
    </div>
  );
}

