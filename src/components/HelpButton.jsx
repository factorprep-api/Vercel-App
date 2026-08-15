import { useState } from 'react';
import { HelpCircle, Loader2 } from 'lucide-react';
import './help-button.css';

// We hardcode the exact URL here so it completely bypasses api.js and its caching!
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzIBfOpFxgmTYWlFDuKPVSx30tXJRlyWhhvZVBqkAO_nKeF1GfGTFVvTolLr-CBpoHl8A/exec";

export default function HelpButton({ pageName = 'Default', position = 'bottom-right' }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      // 1. Fetch directly from Google with a Date.now() timestamp to FORCE it to ignore the cache
      const url = `${GOOGLE_SCRIPT_URL}?action=getHelpVideos&t=${Date.now()}`;
      const response = await fetch(url);
      const res = await response.json();
      const videos = res.helpVideos || [];
      
      let foundUrl = '';
      
      // 2. Safety Net: Forgive the "Program View" vs "Program Viewer" typo in the sheet!
      const searchName1 = String(pageName).trim().toLowerCase();
      const searchName2 = searchName1 === 'program view' ? 'program viewer' : searchName1;
      
      // 3. Find the exact matching page name in Column A
      const match = videos.find(row => {
        if (!row || !row[0]) return false;
        const sheetName = String(row[0]).trim().toLowerCase();
        return sheetName === searchName1 || sheetName === searchName2;
      });
      
      // 4. Grab the Bunny link from Column B
      if (match) foundUrl = String(match[1]).trim();

      // 5. Open the video
      if (foundUrl && foundUrl.startsWith('http')) {
        window.open(foundUrl, '_blank');
      } else {
        alert(`Help video for "${pageName}" is coming soon!`);
      }
    } catch (err) {
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
