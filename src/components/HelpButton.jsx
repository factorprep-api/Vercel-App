import { HelpCircle } from 'lucide-react';
import './help-button.css';

export default function HelpButton({ videoUrl = 'https://youtube.com/watch?v=YOUR_VIDEO_ID', position = 'bottom-right' }) {
  const handleClick = () => {
    window.open(videoUrl, '_blank');
  };

  return (
    <button className={`help-btn ${position}`} onClick={handleClick} title="Watch help video">
      <HelpCircle size={18} />
    </button>
  );
}
