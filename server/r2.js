import { AwsClient } from 'aws4fetch';
import { HttpError } from './http.js';

const FOTO_RE = /^(?:pilotos|cabezales|tcs)\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.jpg$/;
const PDF_RE = /^expedientes\/[A-Za-z0-9_-]{1,64}\/(?:unidad-\d{1,4}|operacion)\.pdf$/;

/** Solo se aceptan las rutas del plan; nada de "..", barras extra ni otras carpetas. */
export function validarKey(key, { soloFotos = false } = {}) {
  if (typeof key !== 'string') throw new HttpError(400, 'Falta la ruta del archivo');
  const ok = FOTO_RE.test(key) || (!soloFotos && PDF_RE.test(key));
  if (!ok) throw new HttpError(400, `Ruta no permitida: ${key}`);
  return key;
}

function cliente(env) {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID || !env.R2_BUCKET) {
    throw new Error('Faltan variables de R2 en el Worker');
  }
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
}

function urlObjeto(env, key) {
  return new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`);
}

/** Link firmado (SigV4 en la query) para PUT o GET directo contra R2. */
export async function firmar(env, key, method, segundos) {
  const url = urlObjeto(env, key);
  url.searchParams.set('X-Amz-Expires', String(segundos));
  const firmado = await cliente(env).sign(new Request(url, { method }), { aws: { signQuery: true } });
  return firmado.url;
}

export async function borrar(env, key) {
  const res = await cliente(env).fetch(urlObjeto(env, key), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`R2 respondió ${res.status} al borrar ${key}`);
}
