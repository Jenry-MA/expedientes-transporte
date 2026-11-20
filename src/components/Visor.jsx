import { useEffect, useState } from 'react';
import { urlDeVista } from '../lib/api';

const esPdf = (d) => d.tipo === 'pdf' || /\.pdf$/.test(d.key);
// En celulares (sobre todo Android) el navegador no muestra PDF dentro de la página.
const tactil = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

/**
 * Visor de documentos en la misma página: foto (clic para acercar) o PDF.
 * Con varias, se pasa de una a otra con las flechas del teclado o los botones.
 */
export default function Visor({ docs, inicio = 0, onCerrar }) {
  const [i, setI] = useState(inicio);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState('');
  const [cerca, setCerca] = useState(false);
  const d = docs[i];
  const varios = docs.length > 1;
  const mover = (paso) => { setI((x) => (x + paso + docs.length) % docs.length); setCerca(false); };

  useEffect(() => {
    let vivo = true;
    setUrl(null);
    setError('');
    urlDeVista(d.key).then((u) => vivo && setUrl(u)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [d.key]);

  useEffect(() => {
    const teclas = (e) => {
      if (e.key === 'Escape') onCerrar();
      else if (varios && e.key === 'ArrowRight') mover(1);
      else if (varios && e.key === 'ArrowLeft') mover(-1);
    };
    window.addEventListener('keydown', teclas);
    // Sin scroll de la página de atrás mientras el visor está abierto.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', teclas); document.body.style.overflow = antes; };
  });

  const pdf = esPdf(d);

  return (
    <div className="visor" role="dialog" aria-modal="true" aria-label={`Documento: ${d.etiqueta}`} onClick={onCerrar}>
      <div className="visor-barra" onClick={(e) => e.stopPropagation()}>
        <div className="visor-titulo">
          <b>{d.etiqueta}</b>
          {varios && <span>{i + 1} de {docs.length}</span>}
        </div>
        <div className="acciones">
          {url && (
            <a className="boton sec chico" href={url} target="_blank" rel="noreferrer">
              {pdf ? 'Abrir en otra pestaña' : 'Ver original'}
            </a>
          )}
          <button type="button" className="chico" onClick={onCerrar} autoFocus>Cerrar</button>
        </div>
      </div>

      <div className="visor-cuerpo">
        {error ? (
          <p className="aviso error" onClick={(e) => e.stopPropagation()}>{error}</p>
        ) : !url ? (
          <p className="visor-cargando">Cargando…</p>
        ) : pdf && tactil() ? (
          <div className="visor-pdf-movil" onClick={(e) => e.stopPropagation()}>
            <b>PDF{d.paginas ? `, ${d.paginas} pág.` : ''}</b>
            <p>En el celular el PDF se abre con el visor del teléfono.</p>
            <a className="boton" href={url} target="_blank" rel="noreferrer">Abrir PDF</a>
          </div>
        ) : pdf ? (
          <iframe className="visor-pdf" src={url} title={d.etiqueta} onClick={(e) => e.stopPropagation()} />
        ) : (
          <div className={`visor-foto ${cerca ? 'cerca' : ''}`} onClick={(e) => e.stopPropagation()}>
            <img
              src={url}
              alt={d.etiqueta}
              onClick={() => setCerca(!cerca)}
              title={cerca ? 'Clic para ver completa' : 'Clic para acercar'}
            />
          </div>
        )}
      </div>

      {varios && (
        <>
          <button type="button" className="visor-flecha izq" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); mover(-1); }}>‹</button>
          <button type="button" className="visor-flecha der" aria-label="Siguiente" onClick={(e) => { e.stopPropagation(); mover(1); }}>›</button>
        </>
      )}
    </div>
  );
}
