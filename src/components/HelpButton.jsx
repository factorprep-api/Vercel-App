import { useState } from 'react';
import { HelpCircle, Loader2 } from 'lucide-react';
import { fetchHelpVideos } from '../api';
import './help-button.css';

export default function HelpButton({ pageName = 'Default', position = 'bottom-right' }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
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

  if (loading) {
    return (
      <button className={`help-btn ${position}`} disabled style={{ cursor: 'wait', opacity: 0.4 }}>
        <Loader2 size={18} className="spin" />
      </button>
    );
  }

  return (
    <button className={`help-btn ${position}`} onClick={handleClick} title="Watch help video">
      <HelpCircle size={18} />
    </button>
  );
}