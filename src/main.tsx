import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './context/ThemeContext';
import App from './App.tsx';
import './index.css';
import { binanceService } from './services/binanceService';
import { newsService } from './services/newsService';

// Initialize WebSocket connection
binanceService.connect();
newsService.connect();

createRoot(document.getElementById('root')!).render(
  <HelmetProvider>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </HelmetProvider>
);