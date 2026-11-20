export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function leerJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Cuerpo JSON inválido');
  }
}
