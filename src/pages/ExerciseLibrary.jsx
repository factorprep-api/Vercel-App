import { useState, useEffect, useMemo } from 'react';
import { Play, Search, X } from 'lucide-react';
import AppShell from '../components/AppShell';
import { fetchExerciseLibrary } from '../api.js';
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

  useEffect(() => {
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

  const groupedLibrary = useMemo(() => buildGrouped(fullLibrary), [fullLibrary]);

  const currentDataset = useMemo(() => {
    if (debouncedQuery.length >= 2) {
      const tokens = debouncedQuery.toLowerCase().split(/\s+/);
      const filtered = fullLibrary.filter(ex => {
        const n = ex.name.toLowerCase();
        const m = ex.muscle.toLowerCase();
        return tokens.every(t => n.includes(t) || m.includes(t));
      });
      return buildGrouped(filtered);
    }
    return groupedLibrary;
  }, [debouncedQuery, fullLibrary, groupedLibrary]);

  const pageGroups = useMemo(() => getPageSlice(currentDataset, currentPage), [currentDataset, currentPage]);
  const totalItems = currentDataset.reduce((s, g) => s + g.items.length, 0);
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  const handleSearch = (e) => { setSearchQuery(e.target.value); setCurrentPage(1); };
  const handlePageChange = (page) => { setCurrentPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openModal = (rawUrl) => setModalVideo({ url: rawUrl, ytId: getYouTubeId(rawUrl) });
  const closeModal = () => setModalVideo(null);

  return (
    <AppShell>
      <div className="exlib-container">
        <div className="exlib-body">
          <div className="exlib-header">
            <h2>Exercise Library</h2>
            <span className={`exlib-status ${loading ? 'loading' : error ? 'error' : 'ready'}`}>
              {loading ? 'LOADING...' : error ? 'ERROR' : `${fullLibrary.length} VIDEOS`}
            </span>
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
                  return (
                    <div key={`${group.cat}-${idx}`} className="exlib-video-card" onClick={() => openModal(ex.rawUrl)} title={ex.name}>
                      <div className="exlib-thumbnail">
                        {ytId ? (
                          <img className="exlib-vid-thumb" src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} loading="lazy" alt={ex.name} />
                        ) : (
                          <video className="exlib-vid-thumb-video" src={`${normalizeVideoUrl(ex.rawUrl)}#t=0.001`} preload="metadata" muted playsInline />
                        )}
                        <Play className="exlib-play-icon" size={32} fill="currentColor" stroke="none" />
                      </div>
                      <div className="exlib-card-info"><p className="exlib-v-title">{ex.name}</p></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="exlib-pagination">
              <button className="exlib-page-btn" disabled={currentPage === 1} onClick={() => handlePageChange(currentPage - 1)}>← Prev</button>
              <PageButtons currentPage={currentPage} totalPages={totalPages} onChange={handlePageChange} />
              <button className="exlib-page-btn" disabled={currentPage === totalPages} onClick={() => handlePageChange(currentPage + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>

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
    </AppShell>
  );
}
