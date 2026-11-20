// Íconos de línea, 22 px, del mundo del puerto. Heredan el color del texto.
const base = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
};

export const IconoBarco = () => (
  <svg {...base}><path d="M3 15h18l-2.2 4.2a1.5 1.5 0 0 1-1.3.8H6.5a1.5 1.5 0 0 1-1.3-.8z" /><path d="M6 15V9h12v6" /><path d="M9 9V5h6v4" /><path d="M12 5V3" /></svg>
);
export const IconoPiloto = () => (
  <svg {...base}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /><path d="M8.6 6.2h6.8" /></svg>
);
export const IconoCabezal = () => (
  <svg {...base}><path d="M3 17V8a1 1 0 0 1 1-1h8v10" /><path d="M12 10h4.5l3.5 4v3h-8" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></svg>
);
export const IconoTC = () => (
  <svg {...base}><rect x="2.5" y="6" width="19" height="9" rx="1" /><path d="M7 6v9M11.5 6v9M16 6v9" /><circle cx="6" cy="18" r="1.6" /><circle cx="18" cy="18" r="1.6" /></svg>
);
export const IconoUsuarios = () => (
  <svg {...base}><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16 14.6c2.4 0 4 1.3 4.5 3.9" /></svg>
);

/** Marca: contenedor visto de frente, con sus corrugados. */
export const Logo = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect x="3" y="7" width="26" height="18" rx="2" fill="#F2B705" />
    <path d="M8.5 10.5v11M13 10.5v11M17.5 10.5v11M22 10.5v11" stroke="#1F3440" strokeWidth="1.8" />
  </svg>
);
