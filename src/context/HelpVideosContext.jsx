import { createContext, useContext, useEffect, useState } from 'react';
import { fetchHelpVideos } from '../api';

const HelpVideosContext = createContext({});

export function HelpVideosProvider({ children }) {
  const [helpVideos, setHelpVideos] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const videos = await fetchHelpVideos();
        setHelpVideos(videos);
      } catch (err) {
        // Silently fail — will use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <HelpVideosContext.Provider value={{ helpVideos, loading }}>
      {children}
    </HelpVideosContext.Provider>
  );
}

export function useHelpVideos() {
  return useContext(HelpVideosContext);
}
