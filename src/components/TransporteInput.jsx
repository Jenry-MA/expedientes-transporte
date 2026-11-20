import { useId, useState } from 'react';
import { normalizar } from '../lib/catalogo';
import { useColeccion } from '../lib/db';
import { agregarTransporte, idTransporte, limpiarNombre } from '../lib/transportes';

/**
 * Campo de transportista con autocompletado del catálogo de transportes.
 * Si lo escrito no existe, ofrece agregarlo ahí mismo sin ir al catálogo.
 */
export default function TransporteInput({ id, value, onChange, required }) {
  const { items } = useColeccion('transportes');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState('');
  const listaId = useId();

  const texto = limpiarNombre(value);
  const q = normalizar(texto);
  const opciones = (items || [])
    .filter((t) => !q || normalizar(t.nombre).includes(q))
    .sort((a, b) => {
      // Primero los que empiezan con lo escrito
      const pa = normalizar(a.nombre).startsWith(q) ? 0 : 1;
      const pb = normalizar(b.nombre).startsWith(q) ? 0 : 1;
      return pa - pb || a.nombre.localeCompare(b.nombre);
    })
    .slice(0, 8);
  const existe = !!texto && (items || []).some((t) => t.id === idTransporte(texto));
  const puedeAgregar = !!texto && !existe && items !== null;
  const total = opciones.length + (puedeAgregar ? 1 : 0);

  function elegir(nombre) {
    onChange(nombre);
    setAbierto(false);
    setError('');
  }

  async function agregar() {
    setAgregando(true);
    setError('');
    try {
      elegir(await agregarTransporte(texto));
    } catch (e) {
      setError(e.message);
    } finally {
      setAgregando(false);
    }
  }

  function teclas(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) return setAbierto(true);
      if (total) setActivo((a) => (a + (e.key === 'ArrowDown' ? 1 : total - 1)) % total);
    } else if (e.key === 'Enter' && abierto && total) {
      e.preventDefault();
      if (activo < opciones.length) elegir(opciones[activo].nombre);
      else agregar();
    } else if (e.key === 'Escape') {
      setAbierto(false);
    }
  }

  return (
    <div className="combo">
      <input
        id={id}
        role="combobox"
        aria-expanded={abierto && total > 0}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={abierto && total ? `${listaId}-${activo}` : undefined}
        autoComplete="off"
        placeholder="Escribe para buscar"
        value={value}
        required={required}
        onChange={(e) => { onChange(e.target.value); setAbierto(true); setActivo(0); setError(''); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onKeyDown={teclas}
      />
      {abierto && total > 0 && (
        <ul className="combo-lista" role="listbox" id={listaId}>
          {opciones.map((t, i) => (
            <li
              key={t.id}
              id={`${listaId}-${i}`}
              role="option"
              aria-selected={i === activo}
              className={i === activo ? 'activo' : ''}
              onMouseDown={(e) => { e.preventDefault(); elegir(t.nombre); }}
              onMouseEnter={() => setActivo(i)}
            >
              {t.nombre}
            </li>
          ))}
          {puedeAgregar && (
            <li
              id={`${listaId}-${opciones.length}`}
              role="option"
              aria-selected={activo === opciones.length}
              className={`combo-nuevo ${activo === opciones.length ? 'activo' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); agregar(); }}
              onMouseEnter={() => setActivo(opciones.length)}
            >
              {agregando ? 'Agregando…' : <>Agregar «{texto}» como transporte nuevo</>}
            </li>
          )}
        </ul>
      )}
      {error && <span className="aviso-campo error">{error}</span>}
      {!error && !abierto && texto && items !== null && !existe && (
        <span className="aviso-campo">No está en el catálogo de transportes</span>
      )}
    </div>
  );
}
