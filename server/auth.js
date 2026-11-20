import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from './http.js';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

// Cache por isolate: evita consultar Firestore en cada petición.
const equipoCache = new Map();
const CACHE_MS = 5 * 60 * 1000;

/** Verifica el ID token de Firebase y que el usuario esté en la colección `equipo`. */
export async function verificarUsuario(request, env) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer (.+)$/);
  if (!m) throw new HttpError(401, 'Falta el token de sesión');
  const token = m[1];
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new HttpError(500, 'Falta la variable FIREBASE_PROJECT_ID en el Worker');

  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    }));
  } catch {
    throw new HttpError(401, 'Sesión inválida o vencida');
  }

  const email = String(payload.email || '').toLowerCase();
  if (!payload.sub || !email) throw new HttpError(403, 'Usuario sin correo');
  if (!(await esDelEquipo(email, token, projectId))) {
    throw new HttpError(403, 'Tu usuario no está en la lista del equipo');
  }
  return { uid: payload.sub, email };
}

// Lee equipo/{email} por la API REST de Firestore con el token del propio usuario,
// así la lista del equipo vive en un solo lugar y las reglas de Firestore deciden.
async function esDelEquipo(email, token, projectId) {
  const c = equipoCache.get(email);
  if (c && c.exp > Date.now()) return c.ok;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/equipo/${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status >= 500) throw new HttpError(503, 'No se pudo verificar el equipo, intenta de nuevo');
  const ok = res.ok;
  // Solo se cachea el "sí": así un usuario recién aprobado puede usar la API de inmediato.
  if (ok) equipoCache.set(email, { ok, exp: Date.now() + CACHE_MS });
  return ok;
}
