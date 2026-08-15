import { useState } from 'react';
import { HelpCircle, Loader2 } from 'lucide-react';
import { fetchHelpVideos } from '../api';
import './help-button.css';

export default function HelpButton({ pageName = 'Default', position = 'bottom-right' }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetchHelpVideos();
      const videos = res.helpVideos || [];
      
      let foundUrl = '';
      
      const match = videos.find(row => 
        row && row[0] && String(row[0]).trim().toLowerCase() === String(pageName).trim().toLowerCase()
      );
      
      if (match) foundUrl = String(match[1]).trim();

      if (foundUrl && foundUrl.startsWith('http')) {
        window.open(foundUrl, '_blank');
      } else {
        // DIAGNOSTIC ALERT: Tells us exactly what Google sent back
        let debugMsg = `Looking for: "${pageName}"\n\n`;
        if (videos.length === 0) {
          debugMsg += `ERROR: Google sent back 0 rows. \n(Check if the sheet is named exactly 'Help_Videos' and the script is deployed as a New Version).`;
        } else {
          debugMsg += `Google sent ${videos.length} rows.\nFirst row found: "${videos[0][0]}"\n\nPlease check for typos in the sheet!`;
        }
        alert(debugMsg);
      }
    } catch (err) {
      alert(`API Error: Cannot reach Google Script. Check api.js URL.`);
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
