import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

// Inject ngrok bypass header on every fetch to the backend so ngrok
// doesn't intercept requests with its browser-warning HTML page (CORS fix).
const _origFetch = window.fetch;
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const isBackend = url.includes('ngrok')
    || (apiUrl && url.includes(apiUrl))
    || url.startsWith('/api/')
    || url.startsWith('/livekit/');
  if (isBackend) {
    init.headers = { 'ngrok-skip-browser-warning': 'true', ...(init.headers || {}) };
  }
  return _origFetch(input, init);
};

ReactDOM.createRoot(document.getElementById('root')).render(
  
    <App />
  
)