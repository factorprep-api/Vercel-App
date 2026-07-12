import { useState, useEffect, useMemo } from 'react';
import { Play, Search, X, Pencil, Trash2, Plus } from 'lucide-react';
import { supabase } from '../supabase';
import { fetchExerciseLibrary, deleteExerciseFromLibrary, updateExerciseInLibrary, addExerciseToLibrary } from '../api.js';
import './exercise-library.css';

const ITEMS_PER_PAGE = 50;

function getYouTubeId(url) {
  const m = url.match(/(?:v=|v\/|vi=|vi\/|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function normalizeVideoUrl(rawUrl) {
  let url = rawUrl;
  if (!url.startsWith('http')) url = 'https://' + url;
  if (url.includes('b-cdn.net') && !url.toLowerCase().endsWith('.mp4')) url += '.mp4';
  return url;
}

function buildGrouped(data) {
  const map = {};
  data.forEach(ex => {
    const cat = ex.muscle.toUpperCase();
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

export default function ExerciseLibrary() {
  const [fullLibrary, setFullLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [modalVideo, setModalVideo] = useState(null);
  const [coachEmail, setCoachEmail] = useState('');
  const [viewFilter, setViewFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editVideo, setEditVideo] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadCoachEmail();
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    (async () => {
      try {
        const lib = await fetchExerciseLibrary();
        setFullLibrary(lib);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadCoachEmail() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { setCoachEmail(user.email); }
  }

  function isCoachOwned(exercise) {
    if (!exercise.ownerEmail || !coachEmail) return false;
    return exercise.ownerEmail.toLowerCase() === coachEmail.toLowerCase();
  }

  function renderCoachBadge(exercise) {
    if (!isCoachOwned(exercise)) return null;
    return <span className="exlib-coach-badge">• Coach</span>;
  }

  function showToast(message, isError = false) {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3000);
  }

  async function reloadLibrary() {
    try {
      const lib = await fetchExerciseLibrary();
      setFullLibrary(lib);
    } catch {
      // ignore reload errors
    }
  }

  function openEditModal(exercise) {
    setEditing(exercise);
    setEditName(exercise.name);
    setEditVideo(exercise.rawUrl || '');
  }

  async function handleEditSave() {
    if (!editName.trim()) { showToast('Exercise name is required.', true); return; }
    try {
      const res = await updateExerciseInLibrary({
        name: editName.trim(),
        video: editVideo.trim(),
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

  const filteredForView = useMemo(() => {
    if (viewFilter === 'my') {
      return fullLibrary.filter(ex => isCoachOwned(ex));
    }
    return fullLibrary;
  }, [fullLibrary, viewFilter, coachEmail]);

  const groupedLibrary = useMemo(() => buildGrouped(filteredForView), [filteredForView]);

  const currentDataset = useMemo(() => {
    if (debouncedQuery.length >= 2) {
      const tokens = debouncedQuery.toLowerCase().split(/\s+/);
      const filtered = filteredForView.filter(ex => {
        const n = ex.name.toLowerCase();
        const m = ex.muscle.toLowerCase();
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
    { id: 'all', label: 'All Exercises' },
    { id: 'my', label: 'My Exercises' }
  ];

  return (
    <div className="exlib-container">
      <div className="exlib-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '24px', color: '#008ed3', fontWeight: '700', margin: 0 }}>Exercise Library</h2>
          <button className="exlib-add-btn" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add Exercise
          </button>
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

        {loading && <p className="exlib-placeholder">Downloading Master Library...</p>}
        {error && <p className="exlib-error-text">Failed to load data. Please refresh.</p>}
        {!loading && !error && pageGroups.length === 0 && <p className="exlib-placeholder">No exercises found.</p>}

        {!loading && !error && pageGroups.map(group => (
          <div key={group.cat}>
            <h3 className="exlib-category-title">{group.cat}</h3>
            <div className="exlib-video-row">
              {group.items.map((ex, idx) => {
                const ytId = getYouTubeId(ex.rawUrl);
                const owned = isCoachOwned(ex);
                return (
                  <div key={`${group.cat}-${idx}`} className="exlib-video-card" onClick={() => openModal(ex.rawUrl)} title={ex.name}>
                    <div className="exlib-thumbnail">
                      {ytId ? (
                        <img className="exlib-vid-thumb" src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} loading="lazy" alt={ex.name} />
                      ) : (
                        <video className="exlib-vid-thumb-video" src={`${normalizeVideoUrl(ex.rawUrl)}#t=0.001`} preload="metadata" muted playsInline />
                      )}
                      <Play className="exlib-play-icon" size={32} fill="currentColor" stroke="none" />
                      {owned && (
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

      {/* Add Exercise Modal */}
      {adding && (
        <AddExerciseModal
          coachEmail={coachEmail}
          onClose={() => setAdding(false)}
          onSuccess={async () => {
            setAdding(false);
            await reloadLibrary();
          }}
        />
      )}

      {modalVideo && (
        <div className="exlib-modal-overlay" onClick={closeModal}>
          <div className="exlib-modal-content" onClick={e => e.stopPropagation()}>
            <button className="exlib-close-btn" onClick={closeModal}><X size={28} /></button>
            <div className="exlib-player-container">
              {modalVideo.ytId ? (
                <iframe src={`https://www.youtube.com/embed/${modalVideo.ytId}?autoplay=1&rel=0`} allowFullScreen title="Exercise Video" />
              ) : (
                <video controls autoPlay playsInline controlsList="nodownload"><source src={normalizeVideoUrl(modalVideo.url)} type="video/mp4" /></video>
              )}
            </div>
          </div>
        </div>
      )}

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
              <label className="exlib-edit-label">Video URL:</label>
              <input className="exlib-edit-input" value={editVideo} onChange={e => setEditVideo(e.target.value)} />
            </div>
            <button className="exlib-edit-save-btn" onClick={handleEditSave}>Save Changes</button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`exlib-toast ${toast.isError ? 'error' : ''}`}>
          {toast.isError ? <X size={16} /> : <Pencil size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function AddExerciseModal({ coachEmail, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [video, setVideo] = useState('');
  const [baseLift, setBaseLift] = useState('');
  const [multiplier, setMultiplier] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { alert('Exercise name is required.'); return; }
    setSaving(true);
    try {
      const res = await addExerciseToLibrary({
        name: name.trim(),
        video: video.trim(),
        baseLift: baseLift.trim(),
        multiplier: multiplier ? parseFloat(multiplier) : 1.0
      });
      if (res.status === 'Success') {
        alert('Exercise added! It will appear with a • Coach badge.');
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
          <label className="exlib-add-label">Base Lift (Optional):</label>
          <input className="exlib-add-input" value={baseLift} onChange={e => setBaseLift(e.target.value)} placeholder="e.g. Back Squat" />
        </div>
        <div className="exlib-add-field">
          <label className="exlib-add-label">Multiplier (Optional):</label>
          <input type="number" step="0.1" className="exlib-add-input" value={multiplier} onChange={e => setMultiplier(e.target.value)} placeholder="1.0" />
        </div>
        <button className="exlib-add-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Adding...' : 'Add Exercise'}
        </button>
      </div>
    </div>
  );
}
