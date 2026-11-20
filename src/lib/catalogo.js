// Configuración de los tres catálogos: campos, etiquetas de foto y cómo se muestran.
export const TIPOS = {
  pilotos: {
    titulo: 'Pilotos',
    singular: 'Piloto',
    campos: [
      { name: 'nombre', label: 'Nombre completo', requerido: true },
      { name: 'licencia', label: 'No. de licencia' },
      { name: 'telefono', label: 'Teléfono', type: 'tel' },
      { name: 'transportista', label: 'Transportista', transporte: true },
    ],
    etiquetas: ['Licencia (frente)', 'Licencia (reverso)', 'Otro'],
    busqueda: ['nombre', 'licencia', 'telefono', 'transportista'],
    resumen: (p) => p.nombre,
    detalle: (p) => [p.licencia && `Lic. ${p.licencia}`, p.telefono && `Tel. ${fmtTelefono(p.telefono)}`, p.transportista].filter(Boolean).join(', '),
  },
  cabezales: {
    titulo: 'Cabezales',
    singular: 'Cabezal',
    unico: 'placa',
    campos: [
      { name: 'placa', label: 'Placa', requerido: true },
      { name: 'transportista', label: 'Transportista', transporte: true },
      { name: 'notas', label: 'Notas', multilinea: true },
    ],
    etiquetas: ['Tarjeta de circulación', 'Otro'],
    busqueda: ['placa', 'transportista', 'notas'],
    resumen: (c) => c.placa,
    detalle: (c) => c.transportista || '',
  },
  tcs: {
    titulo: 'TC',
    singular: 'TC',
    unico: 'placa',
    campos: [
      { name: 'placa', label: 'Placa', requerido: true },
      { name: 'transportista', label: 'Transportista', transporte: true },
      { name: 'notas', label: 'Notas', multilinea: true },
    ],
    etiquetas: ['Tarjeta de circulación', 'Otro'],
    busqueda: ['placa', 'transportista', 'notas'],
    resumen: (t) => t.placa,
    detalle: (t) => t.transportista || '',
  },
};

export const CAMPO_ASIG = { pilotos: 'pilotoId', cabezales: 'cabezalId', tcs: 'tcId' };

export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Quita espacios, puntos y guiones: "C-123 ABC" == "c123abc". */
export const compactar = (s) => normalizar(s).replace(/[\s.-]/g, '');

export function filtrar(items, q, tipo) {
  if (!items) return [];
  const cfg = TIPOS[tipo];
  const ordenados = [...items].sort((a, b) => normalizar(cfg.resumen(a)).localeCompare(normalizar(cfg.resumen(b))));
  const n = normalizar(q);
  if (!n) return ordenados;
  const c = compactar(q);
  return ordenados.filter((it) =>
    cfg.busqueda.some((campo) => normalizar(it[campo]).includes(n) || (c && compactar(it[campo]).includes(c))),
  );
}

export function fmtFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d ? `${d}/${m}/${y}` : iso;
}

/** "V. 045", "v045", "V 45" -> "045" / "45": se guarda sin el prefijo. */
/** Teléfono de Guatemala de 8 dígitos como "5767 4479"; cualquier otro formato se deja como vino. */
export function fmtTelefono(t) {
  const s = String(t ?? '').trim();
  const d = s.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)} ${d.slice(4)}` : s;
}
/** Para el enlace tel: (tocar y llamar desde el celular). */
export const telHref = (t) => `tel:${String(t ?? '').replace(/[^\d+]/g, '')}`;

export const limpiarViaje = (v) => String(v ?? '').trim().replace(/^v(?:\.\s*|\s+|(?=\d))/i, '').trim();
export const fmtViaje = (v) => (limpiarViaje(v) ? `V. ${limpiarViaje(v)}` : '');

export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
