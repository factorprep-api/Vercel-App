import { useState } from 'react';
import { HelpCircle, Loader2 } from 'lucide-react';
import { fetchHelpVideos } from '../api';
import './help-button.css';

export default function HelpButton({ pageName = 'Default', position = 'bottom-right', variant = 'floating' }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e) => {
    // v1.10.2: card variant sits inside clickable hub cards — never let the
    // click bubble up and navigate the user away from the help video.
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    setLoading(true);
    try {
      const videos = await fetchHelpVideos();

      let foundUrl = '';

      // Safety Net: Forgive the "Program View" vs "Program Viewer" typo
      const searchName1 = String(pageName).trim().toLowerCase();
      const searchName2 = searchName1 === 'program view' ? 'program viewer' : searchName1;

      const match = videos.find(row => {
        if (!row || !row.page_name) return false;
        const sheetName = String(row.page_name).trim().toLowerCase();
        return sheetName === searchName1 || sheetName === searchName2;
      });

      if (match) foundUrl = String(match.video_url || '').trim();

      if (foundUrl && foundUrl.startsWith('http')) {
        window.open(foundUrl, '_blank');
      } else {
        alert(`Help video for "${pageName}" is coming soon!`);
      }
    } catch {
      alert(`Network Error: Could not load the video.`);
    }
    setLoading(false);
  };

  const isCard = variant === 'card';
  const btnClass = isCard ? 'help-btn card' : `help-btn ${position}`;

  if (loading) {
    return (
      <button className={btnClass} disabled style={{ cursor: 'wait', opacity: 0.4 }}>
        <Loader2 size={isCard ? 15 : 18} className="spin" />
      </button>
    );
  }

  return (
    <button className={btnClass} onClick={handleClick} title="Watch help video">
      <HelpCircle size={isCard ? 15 : 18} />
    </button>
  );
}