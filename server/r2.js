import { AwsClient } from 'aws4fetch';
import { HttpError } from './http.js';

// Documentos del catálogo: imagen (.jpg) o PDF subido por el usuario.
const DOC_RE = /^(?:pilotos|cabezales|tcs)\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.(?:jpg|pdf)$/;
// Expedientes generados por la app.
const EXP_RE = /^expedientes\/[A-Za-z0-9_-]{1,64}\/(?:unidad-\d{1,4}|operacion)\.pdf$/;

/** Solo se aceptan las rutas del plan; nada de "..", barras extra ni otras carpetas. */
export function validarKey(key, { soloCatalogo = false } = {}) {
  if (typeof key !== 'string') throw new HttpError(400, 'Falta la ruta del archivo');
  const ok = DOC_RE.test(key) || (!soloCatalogo && EXP_RE.test(key));
  if (!ok) throw new HttpError(400, `Ruta no permitida: ${key}`);
  return key;
}

function cliente(env) {
  const faltan = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ACCOUNT_ID', 'R2_BUCKET'].filter((v) => !env[v]);
  if (faltan.length) throw new HttpError(500, `Faltan variables en el Worker: ${faltan.join(', ')}`);
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
  // Con el binding del bucket se borra directo, sin firmar la petición.
  if (env.BUCKET) {
    await env.BUCKET.delete(key);
    return;
  }
  const res = await cliente(env).fetch(urlObjeto(env, key), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new HttpError(502, `R2 respondió ${res.status} al borrar ${key}`);
}
