import { auth } from '../firebase';

async function llamar(ruta, body) {
  const user = auth.currentUser;
  if (!user) throw new Error('La sesión expiró, vuelve a entrar');
  const token = await user.getIdToken();
  const res = await fetch(`/api/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status} en /api/${ruta}`);
  return data;
}

const AVISO_CORS = () =>
  `El navegador no pudo conectarse con R2. Revisa la política CORS del bucket: debe permitir ${window.location.origin}`;

/** Extrae el <Code> del XML de error de R2 (por ejemplo SignatureDoesNotMatch). */
async function errorR2(res, accion) {
  const texto = await res.text().catch(() => '');
  const codigo = texto.match(/<Code>([^<]+)<\/Code>/)?.[1];
  const pista = {
    SignatureDoesNotMatch: 'las llaves R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY no coinciden',
    InvalidAccessKeyId: 'R2_ACCESS_KEY_ID no existe o el token fue borrado',
    AccessDenied: 'el token de R2 no tiene permiso sobre este bucket',
    NoSuchBucket: 'el bucket de R2_BUCKET no existe',
    NoSuchKey: 'el archivo no existe en R2',
  }[codigo];
  return new Error(`R2 rechazó ${accion} (${res.status}${codigo ? ` ${codigo}` : ''})${pista ? `: ${pista}` : ''}`);
}

/** Pide un link firmado y sube el archivo directo a R2. */
export async function subirArchivo(key, blob, contentType) {
  const { url } = await llamar('upload-url', { key });
  let res;
  try {
    res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
  } catch {
    throw new Error(AVISO_CORS());
  }
  if (!res.ok) throw await errorR2(res, 'la subida');
  cache.delete(key);
}

/** Descarga un archivo privado de R2 (para armar los PDF). */
export async function descargar(key) {
  const url = await urlDeVista(key);
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(AVISO_CORS());
  }
  if (!res.ok) throw await errorR2(res, 'la descarga');
  return res.blob();
}

/**
 * Prueba de punta a punta: Worker -> link firmado -> subir a R2 -> leer -> borrar.
 * `paso(nombre, estado, detalle)` informa el avance.
 */
export async function probarAlmacenamiento(paso) {
  const key = `pilotos/_prueba/${crypto.randomUUID().replace(/-/g, '')}.jpg`;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  canvas.getContext('2d').fillRect(0, 0, 8, 8);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.8));

  const pasos = [
    ['Subir un archivo de prueba a R2', () => subirArchivo(key, blob, 'image/jpeg')],
    ['Leerlo de vuelta desde R2', async () => {
      const b = await descargar(key);
      if (b.size !== blob.size) throw new Error(`Llegó un archivo distinto (${b.size} de ${blob.size} bytes)`);
    }],
    ['Borrarlo', () => borrarArchivo(key)],
  ];
  for (const [nombre, fn] of pasos) {
    paso(nombre, 'corriendo');
    try {
      await fn();
      paso(nombre, 'ok');
    } catch (e) {
      paso(nombre, 'error', e.message);
      return false;
    }
  }
  return true;
}

export async function borrarArchivo(key) {
  cache.delete(key);
  await llamar('delete', { key });
}

// Links de lectura: se cachean 50 min (duran 60) y se piden en lotes,
// así una pantalla con 30 miniaturas hace una sola petición.
const cache = new Map();
let pendientes = new Map();
let timer = null;

export function urlDeVista(key) {
  const c = cache.get(key);
  if (c && c.exp > Date.now()) return Promise.resolve(c.url);
  return new Promise((resolve, reject) => {
    if (!pendientes.has(key)) pendientes.set(key, []);
    pendientes.get(key).push({ resolve, reject });
    if (!timer) timer = setTimeout(vaciarLote, 20);
  });
}

async function vaciarLote() {
  const lote = pendientes;
  pendientes = new Map();
  timer = null;
  const keys = [...lote.keys()];
  for (let i = 0; i < keys.length; i += 100) {
    const parte = keys.slice(i, i + 100);
    try {
      const { urls } = await llamar('view-url', { keys: parte });
      const exp = Date.now() + 50 * 60 * 1000;
      for (const k of parte) {
        cache.set(k, { url: urls[k], exp });
        lote.get(k).forEach((p) => p.resolve(urls[k]));
      }
    } catch (e) {
      for (const k of parte) lote.get(k).forEach((p) => p.reject(e));
    }
  }
}

/** Abre un archivo de R2 en otra pestaña (la ventana se abre antes del await para evitar el bloqueador). */
export async function abrirArchivo(key) {
  const ventana = window.open('', '_blank');
  try {
    const url = await urlDeVista(key);
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
  } catch (e) {
    ventana?.close();
    throw e;
  }
}

/** Abre un Blob local (vista previa) en una pestaña ya abierta, o en una nueva. */
export function abrirBlob(blob, ventana) {
  const url = URL.createObjectURL(blob);
  if (ventana) ventana.location.href = url;
  else window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}
