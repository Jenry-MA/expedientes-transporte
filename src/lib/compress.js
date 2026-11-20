/** Reduce la foto a lado mayor 1600 px, JPEG calidad 0.8 (obligatorio antes de subir). */
export async function comprimirImagen(file, maxLado = 1600, calidad = 0.8) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`No se pudo leer "${file.name}". Usa una foto JPG o PNG.`);
  }
  const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * escala);
  const h = Math.round(bmp.height * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la foto'))), 'image/jpeg', calidad),
  );
}
