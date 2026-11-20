import { HttpError, json, leerJson } from '../../server/http.js';
import { firmar, validarKey } from '../../server/r2.js';

// POST { keys: [...] } -> { urls: { key: url } }  (links de lectura válidos 1 hora)
export async function onRequestPost({ request, env }) {
  const body = await leerJson(request);
  const keys = Array.isArray(body.keys) ? body.keys : [body.key];
  if (keys.length === 0 || keys.length > 100) throw new HttpError(400, 'Entre 1 y 100 archivos por petición');
  keys.forEach((k) => validarKey(k));
  const urls = {};
  await Promise.all(keys.map(async (k) => { urls[k] = await firmar(env, k, 'GET', 3600); }));
  return json({ urls });
}
