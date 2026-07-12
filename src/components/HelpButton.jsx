import { HelpCircle, Loader2 } from 'lucide-react';
import { useHelpVideos } from '../context/HelpVideosContext';
import './help-button.css';

export default function HelpButton({ pageName = 'Default', position = 'bottom-right' }) {
  const { helpVideos, loading } = useHelpVideos();
  const videoUrl = helpVideos[pageName] || 'https://youtube.com/';

  const handleClick = () => {
    window.open(videoUrl, '_blank');
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
