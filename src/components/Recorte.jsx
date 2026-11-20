import { useEffect, useRef, useState } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { comprimirImagen } from '../lib/compress';

const COMPLETO = { unit: '%', x: 0, y: 0, width: 100, height: 100 };

const aBlob = (canvas, calidad = 0.92) =>
  new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo procesar la imagen'))), 'image/jpeg', calidad));

/** Lee la imagen con su orientación real (EXIF) y la deja en máx. 2400 px para trabajar rápido. */
async function prepararImagen(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`No se pudo leer «${file.name}». Usa una foto JPG o PNG, o un PDF.`);
  }
  const escala = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return aBlob(canvas);
}

function cargar(src) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error('No se pudo cargar la imagen'));
    img.src = src;
  });
}

async function girar(blob, grados) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await cargar(url);
    const canvas = document.createElement('canvas');
    const lateral = grados % 180 !== 0;
    canvas.width = lateral ? img.naturalHeight : img.naturalWidth;
    canvas.height = lateral ? img.naturalWidth : img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((grados * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    return aBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function recortar(img, crop) {
  const x = Math.round((crop.x / 100) * img.naturalWidth);
  const y = Math.round((crop.y / 100) * img.naturalHeight);
  const w = Math.max(1, Math.round((crop.width / 100) * img.naturalWidth));
  const h = Math.max(1, Math.round((crop.height / 100) * img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
  return aBlob(canvas);
}

/**
 * Pantalla de recorte que aparece al elegir una imagen.
 * Se puede girar, recortar o usar completa. Entrega el JPEG ya comprimido (1600 px, 0.8).
 */
export default function Recorte({ file, etiqueta, restantes = 0, onListo, onCancelar }) {
  const [blob, setBlob] = useState(null);
  const [src, setSrc] = useState(null);
  const [crop, setCrop] = useState(COMPLETO);
  const [estado, setEstado] = useState({ trabajando: true, error: '' });
  const imgRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    prepararImagen(file)
      .then((b) => vivo && (setBlob(b), setEstado({ trabajando: false, error: '' })))
      .catch((e) => vivo && setEstado({ trabajando: false, error: e.message }));
    return () => { vivo = false; };
  }, [file]);

  useEffect(() => {
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  async function accion(fn) {
    setEstado({ trabajando: true, error: '' });
    try {
      await fn();
    } catch (e) {
      setEstado({ trabajando: false, error: e.message });
    }
  }

  const rotar = (g) => accion(async () => {
    setBlob(await girar(blob, g));
    setCrop(COMPLETO);
    setEstado({ trabajando: false, error: '' });
  });

  const recortado = crop.width < 99.5 || crop.height < 99.5;

  const guardar = (usarCompleta) => accion(async () => {
    const base = !usarCompleta && recortado && crop.width > 0 && crop.height > 0
      ? await recortar(imgRef.current, crop)
      : blob;
    onListo(await comprimirImagen(base));
  });

  return (
    <div className="modal-fondo">
      <div className="modal">
        <div className="modal-cabeza">
          <div>
            <h3>Recortar imagen</h3>
            <p className="tenue">
              {etiqueta} · {file.name}
              {restantes > 0 && ` · faltan ${restantes} más`}
            </p>
          </div>
          <div className="acciones">
            <button type="button" className="sec chico" disabled={!blob || estado.trabajando} onClick={() => rotar(-90)} title="Girar a la izquierda">⟲ Girar</button>
            <button type="button" className="sec chico" disabled={!blob || estado.trabajando} onClick={() => rotar(90)} title="Girar a la derecha">⟳ Girar</button>
          </div>
        </div>

        <div className="modal-cuerpo">
          {src ? (
            <ReactCrop crop={crop} onChange={(_, pct) => setCrop(pct)} keepSelection ruleOfThirds>
              <img ref={imgRef} src={src} alt="" className="recorte-img" />
            </ReactCrop>
          ) : (
            <p className="tenue">{estado.error ? '' : 'Preparando imagen…'}</p>
          )}
        </div>

        <p className="tenue">Arrastra las esquinas para dejar solo el documento. Si no hace falta, usa la imagen completa.</p>
        {estado.error && <p className="aviso error">{estado.error}</p>}
        <div className="acciones">
          <button type="button" disabled={!blob || estado.trabajando} onClick={() => guardar(false)}>
            {estado.trabajando && blob ? 'Guardando…' : recortado ? 'Guardar recorte' : 'Guardar'}
          </button>
          {recortado && (
            <button type="button" className="sec" disabled={!blob || estado.trabajando} onClick={() => guardar(true)}>
              Usar imagen completa
            </button>
          )}
          <button type="button" className="sec" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
