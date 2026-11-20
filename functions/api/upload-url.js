import { json, leerJson } from '../../server/http.js';
import { firmar, validarKey } from '../../server/r2.js';

// POST { key } -> { url }  (link de subida válido 5 minutos)
export async function onRequestPost({ request, env }) {
  const { key } = await leerJson(request);
  validarKey(key);
  return json({ url: await firmar(env, key, 'PUT', 300) });
}
