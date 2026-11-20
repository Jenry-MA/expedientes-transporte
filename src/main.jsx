import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Cada despliegue cambia el nombre de los archivos que se cargan a pedido (por ejemplo el que arma el PDF).
// Si esta pestaña se abrió antes de una versión nueva, esos archivos viejos ya no existen:
// se recarga la página una vez para tomar la versión nueva, en vez de mostrar un error.
window.addEventListener('vite:preloadError', (e) => {
  let ultima = 0;
  try { ultima = Number(sessionStorage.getItem('recargaPorVersion') || 0); } catch { /* sin almacenamiento */ }
  if (Date.now() - ultima < 30_000) return; // ya se recargó hace poco: dejar que se muestre el error
  try { sessionStorage.setItem('recargaPorVersion', String(Date.now())); } catch { /* sin almacenamiento */ }
  e.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
