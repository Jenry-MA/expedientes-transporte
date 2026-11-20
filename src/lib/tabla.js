// Copia las unidades de una operación como tabla, con las mismas columnas que usa el equipo en Excel.
// Va en dos formatos a la vez: HTML (Excel y correo la pegan con columnas y bordes)
// y texto con tabuladores (WhatsApp, Notas, o Excel si no acepta HTML).

const COLUMNAS = [
  ['No.', (f) => f.numero],
  ['Piloto', (f) => f.piloto?.nombre],
  ['Licencia', (f) => f.piloto?.licencia],
  ['Placa cabezal', (f) => f.cabezal?.placa],
  ['Placa TC', (f) => f.tc?.placa],
  ['Transporte', (f) => f.piloto?.transportista || f.cabezal?.transportista || f.tc?.transportista],
  ['Teléfono', (f) => f.piloto?.telefono],
];

const escapar = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const limpio = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();

export function tablaComoTexto(filas) {
  return [COLUMNAS.map(([t]) => t), ...filas.map((f) => COLUMNAS.map(([, v]) => limpio(v(f))))]
    .map((r) => r.join('\t'))
    .join('\n');
}

export function tablaComoHtml(filas) {
  const celda = 'border:1px solid #9aa5ab;padding:4px 8px;font-family:Calibri,Arial,sans-serif;font-size:11pt';
  // Licencia, placas y teléfono como texto, para que Excel no los convierta en números ni quite ceros.
  const texto = 'mso-number-format:"\\@"';
  const enc = COLUMNAS.map(([t]) => `<th style="${celda};background:#1f3440;color:#fff">${escapar(t)}</th>`).join('');
  const cuerpo = filas
    .map((f) => `<tr>${COLUMNAS.map(([t, v], i) =>
      `<td style="${celda};${i === 0 ? 'text-align:center' : ''}${['Licencia', 'Placa cabezal', 'Placa TC', 'Teléfono'].includes(t) ? `;${texto}` : ''}">${escapar(v(f))}</td>`).join('')}</tr>`)
    .join('');
  return `<table style="border-collapse:collapse"><thead><tr>${enc}</tr></thead><tbody>${cuerpo}</tbody></table>`;
}

/** Copia seleccionando una tabla oculta: funciona aunque el navegador niegue el permiso del portapapeles. */
function copiarSeleccionando(html, texto) {
  const caja = document.createElement('div');
  caja.contentEditable = 'true';
  caja.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  caja.innerHTML = html;
  document.body.appendChild(caja);
  const alCopiar = (e) => {
    e.preventDefault();
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', texto);
  };
  document.addEventListener('copy', alCopiar);
  const rango = document.createRange();
  rango.selectNodeContents(caja);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(rango);
  try {
    return document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', alCopiar);
    sel.removeAllRanges();
    caja.remove();
  }
}

export async function copiarTabla(filas) {
  const texto = tablaComoTexto(filas);
  const html = tablaComoHtml(filas);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([texto], { type: 'text/plain' }),
      }),
    ]);
    return;
  } catch {
    // Sin permiso o sin ClipboardItem: se intenta a la antigua.
  }
  if (!copiarSeleccionando(html, texto)) {
    throw new Error('El navegador no dejó copiar. Intenta de nuevo o usa otro navegador (Chrome o Edge).');
  }
}
