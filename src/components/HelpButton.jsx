import { HelpCircle, Loader2 } from 'lucide-react';
import { useHelpVideos } from '../context/HelpVideosContext';
import './help-button.css';

export default function HelpButton({ pageName = 'Default', position = 'bottom-right' }) {
  const { helpVideos, loading } = useHelpVideos();

  const handleClick = () => {
    let foundUrl = '';

    // Safely check if helpVideos is a raw Google Sheets array or a formatted object
    if (Array.isArray(helpVideos)) {
      // It's an array (raw spreadsheet data)
      const match = helpVideos.find(row => 
        String(row[0]).trim().toLowerCase() === String(pageName).trim().toLowerCase()
      );
      if (match) foundUrl = String(match[1]).trim();
      
    } else if (typeof helpVideos === 'object' && helpVideos !== null) {
      // It's a dictionary object
      const key = Object.keys(helpVideos).find(k => 
        String(k).trim().toLowerCase() === String(pageName).trim().toLowerCase()
      );
      if (key) foundUrl = String(helpVideos[key]).trim();
    }

    // Open the video, or show a fallback alert
    if (foundUrl && foundUrl.startsWith('http')) {
      window.open(foundUrl, '_blank');
    } else {
      alert(`Help video for "${pageName}" is coming soon!`);
    }
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

