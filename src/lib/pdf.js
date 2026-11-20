import { jsPDF } from 'jspdf';
import { descargar } from './api';
import { fmtFecha } from './catalogo';

// Cómo se arma el expediente:
// 1. jsPDF dibuja las páginas propias (resumen, datos de cada unidad y sus imágenes).
// 2. pdf-lib une ese PDF con los PDF que se subieron al catálogo (licencias, tarjetas…),
//    cada uno justo después de las páginas de su unidad, y numera todas las páginas.

const EMPRESA = import.meta.env.VITE_EMPRESA_NOMBRE || '';
const M = 15; // margen (mm)
const ANCHO = 210;
const ALTO = 297;
const UTIL = ANCHO - 2 * M;
const LIMITE_Y = ALTO - M - 6; // deja espacio al pie de página
const MM = 72 / 25.4; // puntos por mm (pdf-lib usa puntos)

const esPdf = (d) => d.tipo === 'pdf' || /\.pdf$/.test(d.key);

async function cargarImagen(key) {
  try {
    const blob = await descargar(key);
    const bmp = await createImageBitmap(blob);
    const dims = { w: bmp.width, h: bmp.height };
    bmp.close?.();
    return { data: new Uint8Array(await blob.arrayBuffer()), ...dims };
  } catch (e) {
    console.warn('No se pudo cargar la imagen', key, e);
    return null;
  }
}

async function cargarPdf(key) {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const blob = await descargar(key);
    return await PDFDocument.load(await blob.arrayBuffer());
  } catch (e) {
    console.warn('No se pudo cargar el PDF', key, e);
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
  doc.text(`Barco: ${op.barco}${op.viaje ? `  V. ${op.viaje}` : ''}    ETA: ${fmtFecha(op.fecha)}`, M, M + 11);
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
  ? [['Nombre', p.nombre], ['Licencia', p.licencia], ['Teléfono', p.telefono], ['Transportista', p.transportista]]
  : [['', 'Sin asignar']];
const datosVehiculo = (v) => v
  ? [['Placa', v.placa], ['Transportista', v.transportista], ...(v.notas ? [['Notas', v.notas]] : [])]
  : [['', 'Sin asignar']];

/** Dibuja la unidad y devuelve los PDF adjuntos ya cargados, para unirlos después. */
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

  const todos = [
    ...(piloto?.fotos || []).map((f) => ({ ...f, grupo: 'Piloto' })),
    ...(cabezal?.fotos || []).map((f) => ({ ...f, grupo: 'Cabezal' })),
    ...(tc?.fotos || []).map((f) => ({ ...f, grupo: 'TC' })),
  ];
  const imagenes = todos.filter((d) => !esPdf(d));
  const pdfs = todos.filter(esPdf);
  const [imgs, docsPdf] = await Promise.all([
    Promise.all(imagenes.map((f) => cargarImagen(f.key))),
    Promise.all(pdfs.map((f) => cargarPdf(f.key))),
  ]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Documentos', M, y);
  y += 4;
  if (!todos.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Sin documentos registrados.', M, y + 4);
    return [];
  }

  const sep = 6;
  const celdaW = (UTIL - sep) / 2;
  const celdaH = 72;
  const rotuloH = 5;
  let col = 0;

  imagenes.forEach((f, i) => {
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
  if (col === 1) y += rotuloH + celdaH + 6;

  // Lista de los PDF que se agregan después de estas páginas.
  if (pdfs.length) {
    if (y + 8 + pdfs.length * 4.5 > LIMITE_Y) {
      doc.addPage();
      y = encabezado(doc, op, `${titulo} (cont.)`);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Documentos PDF (en las páginas siguientes):', M, y + 2);
    y += 7;
    doc.setFont('helvetica', 'normal');
    pdfs.forEach((f, i) => {
      const p = docsPdf[i];
      const detalle = p ? `${p.getPageCount()} pág.` : 'no se pudo cargar';
      doc.text(`• ${f.grupo} — ${f.etiqueta} (${detalle})`, M + 2, y);
      y += 4.5;
    });
  }

  return pdfs
    .map((f, i) => ({ pdf: docsPdf[i], rotulo: `Unidad ${a.numero} · ${f.grupo} — ${f.etiqueta}` }))
    .filter((x) => x.pdf);
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

// Las fuentes estándar de PDF solo tienen caracteres latinos; lo demás se cambia por "?".
const latino = (s) => String(s).replace(/[^\x20-\x7E -ÿ–—•]/g, '?');

/**
 * Une las páginas de jsPDF con los PDF adjuntos. `tramos` = [{ hasta, adjuntos }]:
 * después de la página `hasta` del PDF base se insertan los adjuntos de ese tramo.
 */
async function ensamblar(base, tramos) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const propio = await PDFDocument.load(base.output('arraybuffer'));
  const final = await PDFDocument.create();
  const rotulos = new Map(); // índice de página -> rótulo (solo páginas adjuntas)

  let desde = 0;
  for (const tramo of tramos) {
    const indices = Array.from({ length: tramo.hasta - desde }, (_, i) => desde + i);
    (await final.copyPages(propio, indices)).forEach((p) => final.addPage(p));
    desde = tramo.hasta;
    for (const adj of tramo.adjuntos) {
      for (const p of await final.copyPages(adj.pdf, adj.pdf.getPageIndices())) {
        rotulos.set(final.getPageCount(), adj.rotulo);
        final.addPage(p);
      }
    }
  }

  const fuente = await final.embedFont(StandardFonts.Helvetica);
  const total = final.getPageCount();
  const ahora = latino(new Date().toLocaleString('es-GT'));
  const gris = rgb(0.45, 0.45, 0.45);
  const texto = (page, t, x, y) => {
    const ancho = fuente.widthOfTextAtSize(t, 8);
    page.drawRectangle({ x: x - 2, y: y - 2.5, width: ancho + 4, height: 10, color: rgb(1, 1, 1), opacity: 0.85 });
    page.drawText(t, { x, y, size: 8, font: fuente, color: gris });
    return ancho;
  };

  final.getPages().forEach((page, i) => {
    const { width, height } = page.getSize();
    const piso = 8 * MM;
    texto(page, `Generado ${ahora}`, M * MM, piso);
    const num = `Página ${i + 1} de ${total}`;
    texto(page, num, width - M * MM - fuente.widthOfTextAtSize(num, 8), piso);
    if (rotulos.has(i)) texto(page, latino(rotulos.get(i)), M * MM, height - 8 * MM);
  });

  return new Blob([await final.save()], { type: 'application/pdf' });
}

const nuevoDoc = () => new jsPDF({ unit: 'mm', format: 'a4', compress: true });

/** PDF de una unidad: datos, imágenes y los PDF adjuntos de piloto, cabezal y TC. */
export async function pdfUnidad(op, asignacion, piezas) {
  const doc = nuevoDoc();
  const adjuntos = await paginasUnidad(doc, op, asignacion, piezas);
  return ensamblar(doc, [{ hasta: doc.getNumberOfPages(), adjuntos }]);
}

/** PDF de toda la operación: resumen + cada unidad con sus adjuntos. `resolver(a)` -> {piloto, cabezal, tc}. */
export async function pdfOperacion(op, asignaciones, resolver) {
  const doc = nuevoDoc();
  resumen(doc, op, asignaciones, resolver);
  const tramos = [{ hasta: doc.getNumberOfPages(), adjuntos: [] }];
  for (const a of asignaciones) {
    doc.addPage();
    const adjuntos = await paginasUnidad(doc, op, a, resolver(a));
    tramos.push({ hasta: doc.getNumberOfPages(), adjuntos });
  }
  return ensamblar(doc, tramos);
}
