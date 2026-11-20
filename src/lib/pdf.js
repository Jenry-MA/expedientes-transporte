import { jsPDF } from 'jspdf';
import { urlDeVista } from './api';
import { fmtFecha } from './catalogo';

const EMPRESA = import.meta.env.VITE_EMPRESA_NOMBRE || '';
const M = 15; // margen (mm)
const ANCHO = 210;
const ALTO = 297;
const UTIL = ANCHO - 2 * M;
const LIMITE_Y = ALTO - M - 6; // deja espacio al pie de página

async function cargarImagen(key) {
  try {
    const url = await urlDeVista(key);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const dims = { w: bmp.width, h: bmp.height };
    bmp.close?.();
    const data = new Uint8Array(await blob.arrayBuffer());
    return { data, ...dims };
  } catch (e) {
    console.warn('No se pudo cargar la imagen', key, e);
    return null;
  }
}

function encabezado(doc, op, subtitulo) {
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Expediente de transporte', M, M + 5);
  if (EMPRESA) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(EMPRESA, ANCHO - M, M + 5, { align: 'right' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Barco: ${op.barco}    Fecha: ${fmtFecha(op.fecha)}`, M, M + 11);
  if (subtitulo) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(subtitulo, ANCHO - M, M + 11, { align: 'right' });
  }
  doc.setDrawColor(120);
  doc.setLineWidth(0.3);
  doc.line(M, M + 14, ANCHO - M, M + 14);
  return M + 20;
}

function bloqueDatos(doc, x, y, w, titulo, filas) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(titulo, x, y);
  y += 5;
  doc.setFontSize(9);
  for (const [k, v] of filas) {
    doc.setFont('helvetica', 'bold');
    const etiqueta = k ? `${k}: ` : '';
    const anchoEtiqueta = doc.getTextWidth(etiqueta);
    doc.text(etiqueta, x, y);
    doc.setFont('helvetica', 'normal');
    const lineas = doc.splitTextToSize(String(v || '—'), w - anchoEtiqueta);
    doc.text(lineas, x + anchoEtiqueta, y);
    y += lineas.length * 4.2;
  }
  return y;
}

const datosPiloto = (p) => p
  ? [['Nombre', p.nombre], ['Licencia', p.licencia], ['DPI', p.dpi], ['Teléfono', p.telefono], ['Transportista', p.transportista]]
  : [['', 'Sin asignar']];
const datosVehiculo = (v) => v
  ? [['Placa', v.placa], ['Transportista', v.transportista], ...(v.notas ? [['Notas', v.notas]] : [])]
  : [['', 'Sin asignar']];

async function paginasUnidad(doc, op, a, { piloto, cabezal, tc }) {
  const titulo = `Unidad ${a.numero}`;
  let y = encabezado(doc, op, titulo);
  const colW = (UTIL - 10) / 3;
  const finales = [
    bloqueDatos(doc, M, y, colW, 'Piloto', datosPiloto(piloto)),
    bloqueDatos(doc, M + colW + 5, y, colW, 'Cabezal', datosVehiculo(cabezal)),
    bloqueDatos(doc, M + 2 * (colW + 5), y, colW, 'TC', datosVehiculo(tc)),
  ];
  y = Math.max(...finales) + 3;
  doc.setDrawColor(200);
  doc.line(M, y, ANCHO - M, y);
  y += 7;

  const fotos = [
    ...(piloto?.fotos || []).map((f) => ({ ...f, grupo: 'Piloto' })),
    ...(cabezal?.fotos || []).map((f) => ({ ...f, grupo: 'Cabezal' })),
    ...(tc?.fotos || []).map((f) => ({ ...f, grupo: 'TC' })),
  ];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Documentos y fotos', M, y);
  y += 4;
  if (!fotos.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Sin fotos registradas.', M, y + 4);
    return;
  }

  const imgs = await Promise.all(fotos.map((f) => cargarImagen(f.key)));
  const sep = 6;
  const celdaW = (UTIL - sep) / 2;
  const celdaH = 72;
  const rotuloH = 5;
  let col = 0;

  fotos.forEach((f, i) => {
    if (col === 0 && y + rotuloH + celdaH > LIMITE_Y) {
      doc.addPage();
      y = encabezado(doc, op, `${titulo} (cont.)`);
    }
    const x = M + col * (celdaW + sep);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text(doc.splitTextToSize(`${f.grupo} — ${f.etiqueta}`, celdaW)[0], x, y + 3.5);

    const img = imgs[i];
    const top = y + rotuloH;
    if (img) {
      const esc = Math.min(celdaW / img.w, celdaH / img.h);
      const w = img.w * esc;
      const h = img.h * esc;
      doc.addImage(img.data, 'JPEG', x + (celdaW - w) / 2, top + (celdaH - h) / 2, w, h, undefined, 'FAST');
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150);
      doc.text('No se pudo cargar la imagen', x + celdaW / 2, top + celdaH / 2, { align: 'center' });
      doc.setTextColor(0);
    }
    doc.setDrawColor(200);
    doc.rect(x, top, celdaW, celdaH);

    col += 1;
    if (col === 2) {
      col = 0;
      y += rotuloH + celdaH + 6;
    }
  });
}

function resumen(doc, op, asignaciones, resolver) {
  let y = encabezado(doc, op, 'Resumen');
  if (op.notas) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const l = doc.splitTextToSize(`Notas: ${op.notas}`, UTIL);
    doc.text(l, M, y);
    y += l.length * 4.2 + 3;
  }
  const cols = [
    { t: '#', w: 10, v: (a) => String(a.numero) },
    { t: 'Piloto', w: 50, v: (a, p) => p.piloto?.nombre },
    { t: 'Licencia', w: 28, v: (a, p) => p.piloto?.licencia },
    { t: 'Cabezal', w: 26, v: (a, p) => p.cabezal?.placa },
    { t: 'TC', w: 26, v: (a, p) => p.tc?.placa },
    { t: 'Transportista', w: 40, v: (a, p) => p.piloto?.transportista || p.cabezal?.transportista },
  ];
  const filaH = 7;

  const cabecera = () => {
    doc.setFillColor(230, 235, 242);
    doc.rect(M, y, UTIL, filaH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    let x = M;
    for (const c of cols) {
      doc.text(c.t, x + 1.5, y + 4.8);
      x += c.w;
    }
    y += filaH;
  };

  cabecera();
  doc.setFont('helvetica', 'normal');
  for (const a of asignaciones) {
    if (y + filaH > LIMITE_Y) {
      doc.addPage();
      y = encabezado(doc, op, 'Resumen (cont.)');
      cabecera();
      doc.setFont('helvetica', 'normal');
    }
    const p = resolver(a);
    let x = M;
    for (const c of cols) {
      const texto = doc.splitTextToSize(String(c.v(a, p) || '—'), c.w - 3)[0];
      doc.text(texto, x + 1.5, y + 4.8);
      x += c.w;
    }
    doc.setDrawColor(220);
    doc.line(M, y + filaH, ANCHO - M, y + filaH);
    y += filaH;
  }
  doc.setFont('helvetica', 'bold');
  doc.text(`Total de unidades: ${asignaciones.length}`, M, y + 7);
}

function pies(doc) {
  const n = doc.getNumberOfPages();
  const ahora = new Date().toLocaleString('es-GT');
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Generado ${ahora}`, M, ALTO - 8);
    doc.text(`Página ${i} de ${n}`, ANCHO - M, ALTO - 8, { align: 'right' });
  }
  doc.setTextColor(0);
}

const nuevoDoc = () => new jsPDF({ unit: 'mm', format: 'a4', compress: true });

/** PDF de una unidad: datos + fotos de piloto, cabezal y TC. */
export async function pdfUnidad(op, asignacion, piezas) {
  const doc = nuevoDoc();
  await paginasUnidad(doc, op, asignacion, piezas);
  pies(doc);
  return doc.output('blob');
}

/** PDF de toda la operación: resumen + páginas de cada unidad. `resolver(a)` -> {piloto, cabezal, tc}. */
export async function pdfOperacion(op, asignaciones, resolver) {
  const doc = nuevoDoc();
  resumen(doc, op, asignaciones, resolver);
  for (const a of asignaciones) {
    doc.addPage();
    await paginasUnidad(doc, op, a, resolver(a));
  }
  pies(doc);
  return doc.output('blob');
}
