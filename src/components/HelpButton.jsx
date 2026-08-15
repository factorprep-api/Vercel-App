import { useState } from 'react';
import { HelpCircle, Loader2 } from 'lucide-react';
import { fetchHelpVideos } from '../api';
import './help-button.css';

export default function HelpButton({ pageName = 'Default', position = 'bottom-right' }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      // 1. Fetch directly from Google Sheets the moment they click
      const res = await fetchHelpVideos();
      const videos = res.helpVideos || [];
      
      let foundUrl = '';
      
      // 2. Find the exact matching page name in Column A
      const match = videos.find(row => 
        String(row[0]).trim().toLowerCase() === String(pageName).trim().toLowerCase()
      );
      
      // 3. Grab the Bunny link from Column B
      if (match) foundUrl = String(match[1]).trim();

      // 4. Open the video
      if (foundUrl && foundUrl.startsWith('http')) {
        window.open(foundUrl, '_blank');
      } else {
        alert(`Help video for "${pageName}" is coming soon!`);
      }
    } catch (err) {
      alert(`Error loading video. Please try again.`);
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

