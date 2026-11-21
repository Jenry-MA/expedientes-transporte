import { useState } from 'react';
import { NOMBRE_TEMA, TEMAS, aplicarTema, leerTema } from '../lib/tema';

const ICONO = { auto: '◐', light: '☀', dark: '☾' };

/** Cambia el tema en orden: Automático → Claro → Oscuro. */
export default function TemaBoton({ corto = false }) {
  const [tema, setTema] = useState(leerTema);
  const siguiente = TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length];
  return (
    <span className="tema">
      <button
        type="button"
        className="link"
        onClick={() => { aplicarTema(siguiente); setTema(siguiente); }}
        title={`Cambiar a tema ${NOMBRE_TEMA[siguiente].toLowerCase()}`}
        aria-label={`Tema: ${NOMBRE_TEMA[tema]}. Cambiar a ${NOMBRE_TEMA[siguiente]}`}
      >
        <span aria-hidden="true">{ICONO[tema]}</span> {corto ? '' : `Tema: ${NOMBRE_TEMA[tema]}`}
      </button>
    </span>
  );
}
