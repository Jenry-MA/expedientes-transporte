// Worker: sirve la página (dist/) y la API /api/* para los archivos de R2.
import { verificarUsuario } from '../server/auth.js';
import { HttpError, json, leerJson } from '../server/http.js';
import { borrar, firmar, validarKey } from '../server/r2.js';

// POST { key } -> { url }  (link de subida válido 5 minutos)
async function uploadUrl(request, env) {
  const { key } = await leerJson(request);
  validarKey(key);
  return json({ url: await firmar(env, key, 'PUT', 300) });
}

// POST { keys: [...] } -> { urls: { key: url } }  (links de lectura válidos 1 hora)
async function viewUrl(request, env) {
  const body = await leerJson(request);
  const keys = Array.isArray(body.keys) ? body.keys : [body.key];
  if (keys.length === 0 || keys.length > 100) throw new HttpError(400, 'Entre 1 y 100 archivos por petición');
  keys.forEach((k) => validarKey(k));
  const urls = {};
  await Promise.all(keys.map(async (k) => { urls[k] = await firmar(env, k, 'GET', 3600); }));
  return json({ urls });
}

// POST { key } -> { ok: true }  (solo fotos; los PDF de expedientes no se borran desde la app)
async function borrarFoto(request, env, user) {
  const { key } = await leerJson(request);
  validarKey(key, { soloFotos: true });
  await borrar(env, key);
  console.log(`Foto borrada por ${user.email}: ${key}`);
  return json({ ok: true });
}

const RUTAS = {
  '/api/upload-url': uploadUrl,
  '/api/view-url': viewUrl,
  '/api/delete': borrarFoto,
};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      const handler = RUTAS[pathname];
      if (!handler) throw new HttpError(404, 'Ruta no encontrada');
      if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido');
      // Toda ruta /api/* exige un token válido de Firebase de alguien del equipo.
      const user = await verificarUsuario(request, env);
      return await handler(request, env, user);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      return json({ error: status === 500 ? 'Error interno del servidor' : e.message }, status);
    }
  },
};
