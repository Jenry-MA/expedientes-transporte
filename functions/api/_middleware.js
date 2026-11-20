import { verificarUsuario } from '../../server/auth.js';
import { json } from '../../server/http.js';

// Toda ruta /api/* exige un token válido de Firebase de alguien del equipo.
export async function onRequest(context) {
  try {
    context.data.user = await verificarUsuario(context.request, context.env);
    return await context.next();
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    return json({ error: status === 500 ? 'Error interno del servidor' : e.message }, status);
  }
}
