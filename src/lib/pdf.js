import { jsPDF } from 'jspdf';
import { descargar } from './api';

// Cómo se arma el expediente (solo documentos, sin textos):
// 1. jsPDF pone las imágenes de cada unidad, una debajo de otra, a todo lo ancho de la hoja.
//    Cada unidad empieza en hoja nueva.
// 2. pdf-lib une ese PDF con los PDF que se subieron al catálogo (licencias, tarjetas…),
//    cada uno justo después de las imágenes de su unidad, y pone "Página X de N" al pie.

const M = 15; // margen (mm)
const ANCHO = 210;
const ALTO = 297;
const UTIL = ANCHO - 2 * M;
const LIMITE_Y = ALTO - M - 4; // deja espacio al número de página
const SEP = 7; // espacio entre imágenes
const ALTO_MAX = LIMITE_Y - M; // lo más alto que puede ir una imagen
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
    return { error: e.message || String(e) };
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

/**
 * Lleva la cuenta de la hoja actual. La primera hoja de jsPDF ya existe y se usa
 * solo si hay algo que poner; así no quedan hojas en blanco.
 */
function crearHojas(doc) {
  const h = { usada: false, y: M };
  h.nueva = () => {
    if (h.usada) doc.addPage();
    h.usada = true;
    h.y = M;
  };
  h.total = () => (h.usada ? doc.getNumberOfPages() : 0);
  return h;
}

/** Pone las imágenes de la unidad y devuelve sus PDF adjuntos ya cargados, para unirlos después. */
async function paginasUnidad(doc, hojas, { piloto, cabezal, tc }) {
  const todos = [...(piloto?.fotos || []), ...(cabezal?.fotos || []), ...(tc?.fotos || [])];
  const imagenes = todos.filter((d) => !esPdf(d));
  const pdfs = todos.filter(esPdf);
  const [imgs, docsPdf] = await Promise.all([
    Promise.all(imagenes.map((f) => cargarImagen(f.key))),
    Promise.all(pdfs.map((f) => cargarPdf(f.key))),
  ]);

  if (imagenes.length) hojas.nueva(); // cada unidad empieza en hoja nueva

  imagenes.forEach((f, i) => {
    const fallo = imgs[i]?.error;
    const img = fallo ? null : imgs[i];
    // Todo el ancho útil con su proporción; si es muy alta, se reduce hasta caber en la hoja.
    let w = UTIL;
    let h = img ? (img.h * UTIL) / img.w : 40;
    if (h > ALTO_MAX) {
      w = (w * ALTO_MAX) / h;
      h = ALTO_MAX;
    }
    const libre = LIMITE_Y - hojas.y;
    if (h > libre && h * 0.9 <= libre) {
      // Le falta poco para caber: se reduce un poco (máx. 10 %) en vez de gastar otra hoja.
      w = (w * libre) / h;
      h = libre;
    } else if (h > libre) {
      hojas.nueva();
    }

    const x = M + (UTIL - w) / 2;
    const top = hojas.y;
    if (img) {
      doc.addImage(img.data, 'JPEG', x, top, w, h, undefined, 'FAST');
    } else {
      // Aviso dentro del recuadro para que se sepa qué falta y por qué.
      doc.setDrawColor(200);
      doc.rect(x, top, w, h);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text('No se pudo cargar la imagen', M + UTIL / 2, top + h / 2, { align: 'center' });
      if (fallo) {
        doc.setFontSize(7);
        doc.text(doc.splitTextToSize(fallo, UTIL - 10).slice(0, 2), M + UTIL / 2, top + h / 2 + 5, { align: 'center' });
      }
      doc.setTextColor(0);
    }
    hojas.y = top + h + SEP;
  });

  return docsPdf.filter(Boolean);
}

/**
 * Une las hojas de jsPDF con los PDF adjuntos y numera todo. `tramos` = [{ hasta, adjuntos }]:
 * después de la hoja `hasta` del PDF base se insertan los adjuntos de ese tramo.
 */
async function ensamblar(base, tramos) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const propio = await PDFDocument.load(base.output('arraybuffer'));
  const final = await PDFDocument.create();

  let desde = 0;
  for (const tramo of tramos) {
    const indices = Array.from({ length: tramo.hasta - desde }, (_, i) => desde + i);
    (await final.copyPages(propio, indices)).forEach((p) => final.addPage(p));
    desde = tramo.hasta;
    for (const pdf of tramo.adjuntos) {
      (await final.copyPages(pdf, pdf.getPageIndices())).forEach((p) => final.addPage(p));
    }
  }

  const total = final.getPageCount();
  if (!total) throw new Error('No hay documentos para el PDF: sube las licencias, tarjetas o calcomanías primero.');

  const fuente = await final.embedFont(StandardFonts.Helvetica);
  final.getPages().forEach((page, i) => {
    const { width } = page.getSize();
    const t = `Página ${i + 1} de ${total}`;
    const ancho = fuente.widthOfTextAtSize(t, 8);
    const x = width - M * MM - ancho;
    const y = 8 * MM;
    // Fondo blanco por si un PDF adjunto tiene contenido en esa esquina.
    page.drawRectangle({ x: x - 2, y: y - 2.5, width: ancho + 4, height: 10, color: rgb(1, 1, 1), opacity: 0.85 });
    page.drawText(t, { x, y, size: 8, font: fuente, color: rgb(0.45, 0.45, 0.45) });
  });

  return new Blob([await final.save()], { type: 'application/pdf' });
}

const nuevoDoc = () => new jsPDF({ unit: 'mm', format: 'a4', compress: true });

/** PDF de una unidad: imágenes y PDF adjuntos de piloto, cabezal y TC. */
export async function pdfUnidad(op, asignacion, piezas) {
  const doc = nuevoDoc();
  const hojas = crearHojas(doc);
  const adjuntos = await paginasUnidad(doc, hojas, piezas);
  return ensamblar(doc, [{ hasta: hojas.total(), adjuntos }]);
}

/** PDF de toda la operación: los documentos de cada unidad, en orden. `resolver(a)` -> {piloto, cabezal, tc}. */
export async function pdfOperacion(op, asignaciones, resolver) {
  const doc = nuevoDoc();
  const hojas = crearHojas(doc);
  const tramos = [];
  for (const a of asignaciones) {
    const adjuntos = await paginasUnidad(doc, hojas, resolver(a));
    tramos.push({ hasta: hojas.total(), adjuntos });
  }
  return ensamblar(doc, tramos);
}
