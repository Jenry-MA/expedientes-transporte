import { useState } from 'react';
import { TIPOS, filtrar } from '../lib/catalogo';
import EntidadForm from './EntidadForm';
import Documentos, { etiquetasDe } from './Documentos';

/**
 * Elegir un piloto / cabezal / TC del catálogo, o registrarlo en el momento.
 * `usadoEn(id)` devuelve los números de otras unidades del mismo barco que ya lo usan.
 */
export default function Selector({ tipo, items, valorId, onChange, usadoEn, abierto, onAbrir, onCerrar, sugerido = {} }) {
  const cfg = TIPOS[tipo];
  const [q, setQ] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [verDocs, setVerDocs] = useState(false);
  const actual = items?.find((i) => i.id === valorId);
  const avisoActual = valorId ? usadoEn(valorId) : [];

  if (!abierto) {
    const docs = actual?.fotos || [];
    const faltan = etiquetasDe(tipo).filter((e) => !docs.some((d) => d.etiqueta === e)).length;
    return (
      <div className={`pieza ${actual ? '' : 'vacia'}`}>
        <div className="pieza-tipo">{cfg.singular}</div>
        <div className="pieza-dato">
          {actual ? (
            <>
              {tipo === 'pilotos' ? <b>{cfg.resumen(actual)}</b> : <span><span className="matricula">{cfg.resumen(actual)}</span></span>}
              <span className="tenue">{cfg.detalle(actual)}</span>
            </>
          ) : valorId ? (
            <span className="aviso">Registro borrado del catálogo</span>
          ) : (
            <span className="tenue">Sin asignar</span>
          )}
          {avisoActual.length > 0 && <span className="aviso">⚠ También en unidad {avisoActual.join(', ')}</span>}
        </div>
        <div className="acciones">
          {actual && (
            <button type="button" className={`chico ${faltan ? '' : 'sec'}`} onClick={() => setVerDocs(!verDocs)}>
              {verDocs ? 'Ocultar documentos' : faltan ? `Documentos (faltan ${faltan})` : `Documentos (${docs.length}) ✓`}
            </button>
          )}
          <button type="button" className="sec chico" onClick={onAbrir}>{valorId ? 'Cambiar' : 'Elegir'}</button>
        </div>
        {actual && verDocs && (
          <div className="pieza-docs">
            <Documentos tipo={tipo} id={actual.id} docs={docs} compacto />
          </div>
        )}
      </div>
    );
  }

  const resultados = filtrar(items, q, tipo).slice(0, 8);
  const campoPrincipal = cfg.campos[0].name;

  return (
    <div className="pieza abierta">
      <div className="pieza-tipo">{cfg.singular}</div>
      {registrando ? (
        <EntidadForm
          tipo={tipo}
          compacto
          inicial={{ ...sugerido, [campoPrincipal]: q }}
          onGuardado={(id) => { setRegistrando(false); setQ(''); onChange(id); }}
          onCancelar={() => setRegistrando(false)}
        />
      ) : (
        <>
          <input
            type="search"
            autoFocus
            placeholder={tipo === 'pilotos' ? 'Nombre o licencia…' : 'Placa…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="resultados">
            {resultados.map((it) => {
              const usos = usadoEn(it.id);
              return (
                <li key={it.id}>
                  <button type="button" className={it.id === valorId ? 'elegido' : ''} onClick={() => { setQ(''); onChange(it.id); }}>
                    {tipo === 'pilotos' ? <b>{cfg.resumen(it)}</b> : <span className="matricula">{cfg.resumen(it)}</span>}
                    <span className="tenue">{cfg.detalle(it)}</span>
                    {usos.length > 0 && <span className="aviso">⚠ unidad {usos.join(', ')}</span>}
                  </button>
                </li>
              );
            })}
            {resultados.length === 0 && <li className="tenue">Sin resultados{q && ` para «${q}»`}.</li>}
          </ul>
          <div className="acciones">
            <button type="button" className="sec chico" onClick={() => setRegistrando(true)}>
              Registrar {cfg.singular.toLowerCase()} nuevo
            </button>
            <button type="button" className="link" onClick={onCerrar}>Cerrar</button>
          </div>
        </>
      )}
    </div>
  );
}
