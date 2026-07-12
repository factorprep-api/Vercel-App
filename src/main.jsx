import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelpVideosProvider } from './context/HelpVideosContext.jsx'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelpVideosProvider>
      <App />
    </HelpVideosProvider>
  </StrictMode>,
)
