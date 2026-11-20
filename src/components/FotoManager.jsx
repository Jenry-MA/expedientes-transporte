import { useRef, useState } from 'react';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { TIPOS } from '../lib/catalogo';
import { abrirArchivo, borrarArchivo, subirArchivo } from '../lib/api';
import { comprimirImagen } from '../lib/compress';
import FotoR2 from './FotoR2';

const nuevoId = () => crypto.randomUUID().replace(/-/g, '');

export default function FotoManager({ tipo, id, fotos = [] }) {
  const cfg = TIPOS[tipo];
  const [etiqueta, setEtiqueta] = useState(cfg.etiquetas[0]);
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');
  const input = useRef(null);
  const ref = doc(db, tipo, id);
  const listaId = `etiquetas-${tipo}`;

  async function subir(files) {
    setError('');
    const lista = [...files];
    try {
      for (let i = 0; i < lista.length; i++) {
        setProgreso(`Subiendo ${i + 1} de ${lista.length}…`);
        const blob = await comprimirImagen(lista[i]);
        const key = `${tipo}/${id}/${nuevoId()}.jpg`;
        await subirArchivo(key, blob, 'image/jpeg');
        await updateDoc(ref, {
          fotos: arrayUnion({ key, etiqueta: etiqueta.trim() || 'Sin etiqueta', subidaEn: new Date().toISOString() }),
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setProgreso('');
      if (input.current) input.current.value = '';
    }
  }

  async function borrar(foto) {
    if (!confirm(`¿Borrar la foto «${foto.etiqueta}»? No se puede deshacer.`)) return;
    setError('');
    try {
      // Primero se quita la referencia; si R2 falla solo queda un archivo huérfano privado.
      await updateDoc(ref, { fotos: arrayRemove(foto) });
      await borrarArchivo(foto.key).catch((e) => console.warn('No se borró en R2:', e));
    } catch (e) {
      setError(e.message);
    }
  }

  async function renombrar(foto, nueva) {
    nueva = nueva.trim();
    if (!nueva || nueva === foto.etiqueta) return;
    try {
      await updateDoc(ref, { fotos: fotos.map((f) => (f.key === foto.key ? { ...f, etiqueta: nueva } : f)) });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="tarjeta">
      <h3>Fotos y documentos</h3>
      <div className="subida">
        <label>
          Etiqueta
          <input list={listaId} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} />
          <datalist id={listaId}>
            {cfg.etiquetas.map((e) => <option key={e} value={e} />)}
          </datalist>
        </label>
        <label className={`boton ${progreso ? 'deshabilitado' : ''}`}>
          {progreso || '+ Agregar fotos'}
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={!!progreso}
            onChange={(e) => e.target.files.length && subir(e.target.files)}
          />
        </label>
      </div>
      {error && <p className="aviso error">{error}</p>}
      {fotos.length === 0 ? (
        <p className="tenue">Sin fotos todavía.</p>
      ) : (
        <div className="galeria">
          {fotos.map((f) => (
            <figure key={f.key}>
              <FotoR2 k={f.key} alt={f.etiqueta} onClick={() => abrirArchivo(f.key).catch((e) => setError(e.message))} />
              <figcaption>
                <input list={listaId} defaultValue={f.etiqueta} onBlur={(e) => renombrar(f, e.target.value)} />
                <button className="peligro chico" title="Borrar foto" onClick={() => borrar(f)}>✕</button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
