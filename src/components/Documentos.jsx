import { useEffect, useRef, useState } from 'react';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { TIPOS } from '../lib/catalogo';
import { borrarArchivo, subirArchivo } from '../lib/api';
import FotoR2 from './FotoR2';
import Recorte from './Recorte';
import Visor from './Visor';

const nuevoId = () => crypto.randomUUID().replace(/-/g, '');
const MAX_PDF = 15 * 1024 * 1024;
const esPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const esImagen = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
export const esDocPdf = (d) => d.tipo === 'pdf' || /\.pdf$/.test(d.key);

/** Etiquetas fijas del tipo (las casillas), sin «Otro». */
export const etiquetasDe = (tipo) => TIPOS[tipo].etiquetas.filter((e) => e !== 'Otro');

/** Cuenta páginas y rechaza PDF con contraseña (no se podrían unir al expediente). */
async function revisarPdf(file) {
  if (file.size > MAX_PDF) throw new Error(`«${file.name}» pesa más de 15 MB`);
  const { PDFDocument } = await import('pdf-lib');
  try {
    const pdf = await PDFDocument.load(await file.arrayBuffer());
    return pdf.getPageCount();
  } catch (e) {
    if (/encrypt/i.test(e.message)) throw new Error(`«${file.name}» tiene contraseña o protección; guárdalo sin protección e intenta de nuevo`);
    throw new Error(`«${file.name}» no es un PDF válido`);
  }
}

function BotonArchivo({ texto, onElegir, deshabilitado, principal }) {
  const input = useRef(null);
  return (
    <label className={`boton ${principal ? '' : 'sec'} chico ${deshabilitado ? 'deshabilitado' : ''}`}>
      {texto}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        hidden
        disabled={deshabilitado}
        onChange={(e) => {
          const files = [...e.target.files];
          e.target.value = '';
          if (files.length) onElegir(files);
        }}
      />
    </label>
  );
}

const traeArchivos = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

/** Archivos del portapapeles: un archivo copiado en el explorador o una captura de pantalla. */
function archivosPegados(e) {
  const datos = e.clipboardData;
  if (!datos) return [];
  if (datos.files?.length) return [...datos.files];
  return [...(datos.items || [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
}

/**
 * Casilla que también recibe archivos arrastrados desde la computadora
 * o pegados con Ctrl+V (se hace clic en la casilla y se pega).
 */
function Zona({ className, deshabilitado, onArchivos, children }) {
  const [encima, setEncima] = useState(false);
  const sobre = (e) => {
    if (!traeArchivos(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = deshabilitado ? 'none' : 'copy';
    if (!encima) setEncima(true);
  };
  return (
    <div
      className={`${className} ${encima ? 'encima' : ''}`}
      tabIndex={0}
      onPaste={(e) => {
        const files = archivosPegados(e);
        if (!files.length) return; // texto normal: se pega donde corresponda
        e.preventDefault();
        if (!deshabilitado) onArchivos(files);
      }}
      onDragEnter={sobre}
      onDragOver={sobre}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setEncima(false); }}
      onDrop={(e) => {
        if (!traeArchivos(e)) return;
        e.preventDefault();
        setEncima(false);
        const files = [...e.dataTransfer.files];
        if (!deshabilitado && files.length) onArchivos(files);
      }}
    >
      {children}
      {encima && <div className="zona-aviso" aria-hidden="true">Suelta aquí</div>}
    </div>
  );
}

function Archivo({ d, etiquetas, onBorrar, onEtiqueta, onVer }) {
  const ver = () => onVer(d);
  const opciones = etiquetas.includes(d.etiqueta) ? etiquetas : [d.etiqueta, ...etiquetas];
  return (
    <figure className="archivo">
      {esDocPdf(d) ? (
        <button type="button" className="pdf-mini" onClick={ver} title="Abrir PDF">
          <b>PDF</b>
          <span>{d.paginas ? `${d.paginas} pág.` : ''}</span>
        </button>
      ) : (
        <FotoR2 k={d.key} alt={d.etiqueta} onClick={ver} />
      )}
      <figcaption>
        <select value={d.etiqueta} onChange={(e) => onEtiqueta(d, e.target.value)} title="Mover a otra etiqueta">
          {opciones.map((e) => <option key={e} value={e}>{e}</option>)}
          <option value="__otra">Otra…</option>
        </select>
        <button type="button" className="peligro chico" title="Borrar" onClick={() => onBorrar(d)}>✕</button>
      </figcaption>
    </figure>
  );
}

/**
 * Documentos de un piloto / cabezal / TC: una casilla por etiqueta (Licencia, Tarjeta, Calcomanía…),
 * cada una acepta imagen (con recorte) o PDF. Todo se guarda en R2 y se usa en el expediente.
 */
export default function Documentos({ tipo, id, docs = [], compacto = false, onCambiar, onOcupado }) {
  const etiquetas = etiquetasDe(tipo);
  const [cola, setCola] = useState([]); // imágenes esperando recorte: {n, file, etiqueta}
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');
  const [etiquetaOtro, setEtiquetaOtro] = useState('');
  const [viendo, setViendo] = useState(null); // key del documento abierto en el visor
  const contador = useRef(0);
  const trabajando = !!progreso || cola.length > 0;
  useEffect(() => {
    const evitar = (e) => { if (traeArchivos(e)) e.preventDefault(); };
    window.addEventListener('dragover', evitar);
    window.addEventListener('drop', evitar);
    return () => { window.removeEventListener('dragover', evitar); window.removeEventListener('drop', evitar); };
  }, []);
  useEffect(() => { onOcupado?.(trabajando); }, [trabajando, onOcupado]);
  // Con `onCambiar` (registro aún sin guardar) la lista vive en el formulario;
  // sin él se guarda directo en Firestore. Los archivos van a R2 en ambos casos.
  const ref = onCambiar ? null : doc(db, tipo, id);
  const agregar = async (entrada) => {
    const d = { ...entrada, subidaEn: new Date().toISOString() };
    if (onCambiar) onCambiar((lista) => [...lista, d]);
    else await updateDoc(ref, { fotos: arrayUnion(d) });
  };
  const quitar = async (d) => {
    if (onCambiar) onCambiar((lista) => lista.filter((x) => x.key !== d.key));
    else await updateDoc(ref, { fotos: arrayRemove(d) });
  };
  const reemplazar = async (nueva) => {
    if (onCambiar) onCambiar(() => nueva);
    else await updateDoc(ref, { fotos: nueva });
  };

  async function elegir(files, etiqueta) {
    setError('');
    const imagenes = [];
    for (const f of files) {
      if (esPdf(f)) {
        try {
          setProgreso(`Subiendo ${f.name}…`);
          const paginas = await revisarPdf(f);
          const key = `${tipo}/${id}/${nuevoId()}.pdf`;
          await subirArchivo(key, f, 'application/pdf');
          await agregar({ key, etiqueta, tipo: 'pdf', paginas, nombre: f.name.slice(0, 120) });
        } catch (e) {
          setError(e.message);
        } finally {
          setProgreso('');
        }
      } else if (esImagen(f)) {
        imagenes.push({ n: ++contador.current, file: f, etiqueta });
      } else {
        setError(`«${f.name}» no es imagen ni PDF`);
      }
    }
    if (imagenes.length) setCola((c) => [...c, ...imagenes]);
  }

  async function guardarImagen(item, blob) {
    setCola((c) => c.filter((x) => x.n !== item.n));
    setProgreso(`Subiendo ${item.file.name}…`);
    try {
      const key = `${tipo}/${id}/${nuevoId()}.jpg`;
      await subirArchivo(key, blob, 'image/jpeg');
      await agregar({ key, etiqueta: item.etiqueta, tipo: 'imagen' });
    } catch (e) {
      setError(e.message);
    } finally {
      setProgreso('');
    }
  }

  async function borrar(d) {
    if (!confirm(`¿Borrar «${d.etiqueta}»? No se puede deshacer.`)) return;
    setError('');
    try {
      // Primero se quita la referencia; si R2 falla solo queda un archivo huérfano privado.
      await quitar(d);
      await borrarArchivo(d.key).catch((e) => console.warn('No se borró en R2:', e));
    } catch (e) {
      setError(e.message);
    }
  }

  async function cambiarEtiqueta(d, nueva) {
    if (nueva === '__otra') nueva = (prompt('Nombre de la etiqueta', d.etiqueta) || '').trim();
    if (!nueva || nueva === d.etiqueta) return;
    try {
      await reemplazar(docs.map((x) => (x.key === d.key ? { ...x, etiqueta: nueva } : x)));
    } catch (e) {
      setError(e.message);
    }
  }

  const otros = docs.filter((d) => !etiquetas.includes(d.etiqueta));
  const faltan = etiquetas.filter((e) => !docs.some((d) => d.etiqueta === e)).length;
  const ocupado = !!progreso;
  const actual = cola[0];
  const props = { etiquetas, onBorrar: borrar, onEtiqueta: cambiarEtiqueta, onVer: (d) => setViendo(d.key) };
  // Orden del visor: el mismo de las casillas.
  const enOrden = [...etiquetas.flatMap((e) => docs.filter((d) => d.etiqueta === e)), ...otros];
  const posVisor = enOrden.findIndex((d) => d.key === viendo);

  return (
    <section className={compacto ? 'documentos compacto' : onCambiar ? 'documentos' : 'tarjeta documentos'}>
      {!compacto && (
        <div className="encabezado">
          <div>
            <h3>Documentos</h3>
            <p className="tenue">Sube una foto o un PDF en cada casilla. Las fotos se pueden recortar antes de guardar.</p>
          </div>
          {faltan ? <span className="insignia falta">Faltan {faltan} de {etiquetas.length}</span> : <span className="insignia ok">Completo</span>}
        </div>
      )}
      {progreso && <p className="aviso">{progreso}</p>}
      {error && <p className="aviso error">{error}</p>}

      <div className="casillas">
        {etiquetas.map((e) => {
          const archivos = docs.filter((d) => d.etiqueta === e);
          return (
            <Zona key={e} className={`casilla ${archivos.length ? 'llena' : ''}`} deshabilitado={ocupado} onArchivos={(files) => elegir(files, e)}>
              <div className="casilla-titulo">
                <b>{e}</b>
                {!archivos.length && <span className="insignia falta">Falta</span>}
              </div>
              {archivos.length > 0 && (
                <div className="casilla-archivos">
                  {archivos.map((d) => <Archivo key={d.key} d={d} {...props} />)}
                </div>
              )}
              <BotonArchivo
                principal={!archivos.length}
                texto={archivos.length ? 'Agregar otro' : 'Subir foto o PDF'}
                deshabilitado={ocupado}
                onElegir={(files) => elegir(files, e)}
              />
              <span className="arrastra">{archivos.length ? 'También puedes arrastrar o pegar (Ctrl+V)' : 'o arrástralo aquí, o haz clic en la casilla y pega con Ctrl+V'}</span>
            </Zona>
          );
        })}

        <Zona
          className="casilla otros"
          deshabilitado={ocupado}
          onArchivos={(files) => { elegir(files, etiquetaOtro.trim() || 'Otro'); setEtiquetaOtro(''); }}
        >
          <div className="casilla-titulo"><b>Otros documentos</b></div>
          {otros.length > 0 && (
            <div className="casilla-archivos">
              {otros.map((d) => <Archivo key={d.key} d={d} {...props} />)}
            </div>
          )}
          <input
            placeholder="Nombre (ej. Póliza, Permiso)"
            value={etiquetaOtro}
            onChange={(e) => setEtiquetaOtro(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
          <BotonArchivo
            texto="Subir foto o PDF"
            deshabilitado={ocupado}
            onElegir={(files) => {
              elegir(files, etiquetaOtro.trim() || 'Otro');
              setEtiquetaOtro('');
            }}
          />
        </Zona>
      </div>

      {posVisor >= 0 && <Visor docs={enOrden} inicio={posVisor} onCerrar={() => setViendo(null)} />}

      {actual && (
        <Recorte
          key={actual.n}
          file={actual.file}
          etiqueta={actual.etiqueta}
          restantes={cola.length - 1}
          onListo={(blob) => guardarImagen(actual, blob)}
          onCancelar={() => setCola((c) => c.filter((x) => x.n !== actual.n))}
        />
      )}
    </section>
  );
}
