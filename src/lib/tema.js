// Tema de la app: 'auto' sigue al sistema; 'light' y 'dark' lo fuerzan (atributo data-theme en <html>).
// Se recuerda solo en este navegador.

const CLAVE = 'tema';
export const TEMAS = ['auto', 'light', 'dark'];
export const NOMBRE_TEMA = { auto: 'Automático', light: 'Claro', dark: 'Oscuro' };

export function leerTema() {
  try {
    const t = localStorage.getItem(CLAVE);
    return TEMAS.includes(t) ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function aplicarTema(tema) {
  const html = document.documentElement;
  if (tema === 'auto') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', tema);
  try { localStorage.setItem(CLAVE, tema); } catch { /* sin almacenamiento: vale solo por esta visita */ }
}
