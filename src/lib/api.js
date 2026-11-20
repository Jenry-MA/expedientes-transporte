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

/** Pide un link firmado y sube el archivo directo a R2. */
export async function subirArchivo(key, blob, contentType) {
  const { url } = await llamar('upload-url', { key });
  const res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': contentType } });
  if (!res.ok) throw new Error(`No se pudo subir el archivo (${res.status})`);
  cache.delete(key);
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
