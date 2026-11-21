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
      { name: 'vence', label: 'Vencimiento de licencia', vencimiento: true },
    ],
    documentoVence: 'Licencia',
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
      { name: 'vence', label: 'Vencimiento de tarjeta de circulación', vencimiento: true },
      { name: 'notas', label: 'Notas', multilinea: true },
    ],
    documentoVence: 'Tarjeta',
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
      { name: 'vence', label: 'Vencimiento de tarjeta de circulación', vencimiento: true },
      { name: 'notas', label: 'Notas', multilinea: true },
    ],
    documentoVence: 'Tarjeta',
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

// ---------- Estado de documentos: faltantes y vencimiento ----------

export const DIAS_AVISO = 30; // se avisa desde un mes antes

/** Días desde hoy hasta la fecha ISO (negativo si ya pasó). */
export function diasPara(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - hoy) / 86400000);
}

/** Vencimiento del documento principal (licencia o tarjeta de circulación). */
export function estadoVencimiento(tipo, e) {
  const doc = TIPOS[tipo].documentoVence;
  if (e.venceNoAplica) return { estado: 'no-aplica' };
  if (!e.vence) return { estado: 'sin-fecha', nivel: 'aviso', texto: 'Falta fecha de vencimiento' };
  const dias = diasPara(e.vence);
  const fecha = fmtFecha(e.vence);
  if (dias < 0) return { estado: 'vencido', nivel: 'error', dias, texto: `${doc} vencida (${fecha})` };
  if (dias === 0) return { estado: 'vencido', nivel: 'error', dias, texto: `${doc} vence hoy` };
  if (dias <= DIAS_AVISO) {
    return { estado: 'por-vencer', nivel: 'aviso', dias, texto: `${doc} vence en ${dias} día${dias === 1 ? '' : 's'} (${fecha})` };
  }
  return { estado: 'vigente', dias, texto: `${doc} vence ${fecha}` };
}

/** Documentos de las casillas fijas que todavía no tienen archivo. */
export const documentosFaltantes = (tipo, e) =>
  TIPOS[tipo].etiquetas.filter((et) => et !== 'Otro' && !(e.fotos || []).some((d) => d.etiqueta === et));

/** Lista de avisos de un piloto / cabezal / TC: [{ nivel: 'error' | 'aviso', texto }]. Vacía si está al día. */
export function problemasDe(tipo, e) {
  if (!e) return [];
  const lista = [];
  const venc = estadoVencimiento(tipo, e);
  if (venc.nivel) lista.push({ nivel: venc.nivel, texto: venc.texto });
  const faltan = documentosFaltantes(tipo, e);
  if (faltan.length === 1) lista.push({ nivel: 'aviso', texto: `Falta ${faltan[0].toLowerCase()}` });
  else if (faltan.length > 1) lista.push({ nivel: 'aviso', texto: `Faltan: ${faltan.map((f) => f.toLowerCase()).join(', ')}` });
  return lista.sort((a, b) => (a.nivel === 'error' ? -1 : 0) - (b.nivel === 'error' ? -1 : 0));
}
