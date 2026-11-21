import { problemasDe } from '../lib/catalogo';

/**
 * Avisos de documentos de un piloto / cabezal / TC: faltantes, sin fecha, por vencer o vencidos.
 * Rojo = vencido; ámbar = falta algo o vence en 30 días o menos.
 * `alDia`: texto a mostrar cuando no hay ningún aviso (opcional).
 */
export default function Avisos({ tipo, entidad, alDia, chico = false }) {
  const lista = problemasDe(tipo, entidad);
  if (!lista.length) return alDia ? <span className={`aviso-doc ok ${chico ? 'chico' : ''}`}>{alDia}</span> : null;
  return (
    <span className={`avisos-doc ${chico ? 'chico' : ''}`}>
      {lista.map((p) => (
        <span key={p.texto} className={`aviso-doc ${p.nivel}`}>{p.nivel === 'error' ? '⛔' : '⚠'} {p.texto}</span>
      ))}
    </span>
  );
}
