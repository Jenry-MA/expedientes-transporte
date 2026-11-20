import { json, leerJson } from '../../server/http.js';
import { borrar, validarKey } from '../../server/r2.js';

// POST { key } -> { ok: true }  (solo fotos; los PDF de expedientes no se borran desde la app)
export async function onRequestPost({ request, env, data }) {
  const { key } = await leerJson(request);
  validarKey(key, { soloFotos: true });
  await borrar(env, key);
  console.log(`Foto borrada por ${data.user.email}: ${key}`);
  return json({ ok: true });
}
