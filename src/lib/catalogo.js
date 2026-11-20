// Configuración de los tres catálogos: campos, etiquetas de foto y cómo se muestran.
export const TIPOS = {
  pilotos: {
    titulo: 'Pilotos',
    singular: 'Piloto',
    campos: [
      { name: 'nombre', label: 'Nombre completo', requerido: true },
      { name: 'licencia', label: 'No. de licencia' },
      { name: 'dpi', label: 'DPI' },
      { name: 'telefono', label: 'Teléfono', type: 'tel' },
      { name: 'transportista', label: 'Transportista', transporte: true },
    ],
    etiquetas: ['Licencia (frente)', 'Licencia (reverso)', 'Otro'],
    busqueda: ['nombre', 'licencia', 'dpi', 'telefono', 'transportista'],
    resumen: (p) => p.nombre,
    detalle: (p) => [p.licencia && `Lic. ${p.licencia}`, p.dpi && `DPI ${p.dpi}`, p.transportista].filter(Boolean).join(', '),
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
    etiquetas: ['Tarjeta de circulación', 'Calcomanía', 'Otro'],
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
    etiquetas: ['Tarjeta de circulación', 'Calcomanía', 'Otro'],
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

export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
