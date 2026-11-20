import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { compactar, normalizar } from './catalogo';
import { idTransporte, limpiarNombre } from './transportes';

// Importación de pilotos, cabezales y TC desde Excel (solo registros; los documentos se suben después).
// Acepta la plantilla del sistema y también tablas propias con títulos parecidos
// ("Piloto", "Licencia", "Placa cabezal", "Placa TC", "Transporte", "Teléfono").

const TITULOS = {
  nombre: ['piloto', 'nombre', 'nombre del piloto', 'nombre piloto'],
  licencia: ['licencia', 'no licencia', 'numero de licencia', 'no de licencia', 'licencia de conducir'],
  telefono: ['telefono', 'tel', 'celular', 'cel', 'no telefono'],
  transportista: ['transporte', 'transportista', 'empresa', 'empresa de transporte'],
  cabezal: ['placa cabezal', 'cabezal', 'placa del cabezal', 'placa de cabezal'],
  tc: ['placa tc', 'tc', 'placa del tc', 'placa de tc', 'placa plataforma'],
};
const tituloLimpio = (v) => normalizar(v).replace(/[.:#]/g, '').replace(/\s+/g, ' ').trim();

function texto(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Busca la fila de títulos (en las primeras 15) y devuelve en qué columna está cada campo. */
function columnas(data) {
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const mapa = {};
    (data[r] || []).forEach((celda, c) => {
      const t = tituloLimpio(celda);
      for (const [campo, nombres] of Object.entries(TITULOS)) {
        if (mapa[campo] === undefined && nombres.includes(t)) mapa[campo] = c;
      }
    });
    const utiles = Object.keys(mapa).length;
    if (utiles >= 2 && (mapa.nombre !== undefined || mapa.cabezal !== undefined || mapa.tc !== undefined)) {
      return { fila: r, mapa };
    }
  }
  return null;
}

/** Lee el Excel y devuelve las filas con sus campos. Prefiere la hoja «Registros». */
export async function leerExcel(file) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Sube el archivo en formato Excel (.xlsx). Si es .xls, ábrelo y guárdalo como .xlsx.');
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  let hojas;
  try {
    hojas = await readXlsxFile(file);
  } catch {
    throw new Error('No se pudo leer el archivo. Revisa que sea un Excel (.xlsx) válido.');
  }
  const ordenadas = [...hojas].sort((a, b) => (b.sheet === 'Registros') - (a.sheet === 'Registros'));
  for (const h of ordenadas) {
    const cols = columnas(h.data);
    if (!cols) continue;
    const filas = [];
    for (let r = cols.fila + 1; r < h.data.length; r++) {
      const fila = { numero: r + 1 };
      for (const [campo, c] of Object.entries(cols.mapa)) fila[campo] = texto(h.data[r]?.[c]);
      if (Object.keys(TITULOS).some((k) => fila[k])) filas.push(fila);
    }
    return { hoja: h.sheet, campos: Object.keys(cols.mapa), filas };
  }
  throw new Error('No se encontraron los títulos de columnas. Usa la plantilla, o pon títulos como «Piloto», «Licencia», «Placa cabezal», «Placa TC».');
}

const indexar = (lista, clave) => {
  const m = new Map();
  (lista || []).forEach((x) => { const k = clave(x); if (k && !m.has(k)) m.set(k, x); });
  return m;
};

/**
 * Compara las filas con lo que ya hay en el sistema y arma el plan:
 * qué se crea, qué se actualiza y qué ya existe igual. No escribe nada.
 */
export function analizar(filas, { pilotos, cabezales, tcs, transportes }) {
  const porLicencia = indexar(pilotos, (p) => compactar(p.licencia));
  const porNombre = indexar(pilotos, (p) => normalizar(p.nombre));
  const cabPorPlaca = indexar(cabezales, (c) => c.placaNorm || compactar(c.placa));
  const tcPorPlaca = indexar(tcs, (t) => t.placaNorm || compactar(t.placa));
  const catTransportes = indexar(transportes, (t) => t.id);

  const nuevosTransportes = new Map(); // id -> nombre
  const vistos = { pilotos: new Map(), cabezales: new Map(), tcs: new Map() }; // clave -> fila
  const ops = { pilotos: [], cabezales: [], tcs: [] };

  const nombreTransporte = (t) => {
    t = limpiarNombre(t);
    if (!t) return '';
    const id = idTransporte(t);
    if (catTransportes.has(id)) return catTransportes.get(id).nombre;
    if (!nuevosTransportes.has(id)) nuevosTransportes.set(id, t);
    return nuevosTransportes.get(id);
  };

  // Para cabezal y TC: crear, actualizar el transporte o dejar igual.
  const vehiculo = (col, mapa, placa, transportista, numero) => {
    placa = placa.toUpperCase();
    const norm = compactar(placa);
    if (!norm) return null;
    if (vistos[col].has(norm)) return { accion: 'repetido', texto: placa, detalle: `ya está en la fila ${vistos[col].get(norm)}` };
    vistos[col].set(norm, numero);
    const existe = mapa.get(norm);
    if (!existe) {
      ops[col].push({ tipo: 'crear', datos: { placa, placaNorm: norm, transportista, notas: '' } });
      return { accion: 'nuevo', texto: placa };
    }
    if (transportista && transportista !== existe.transportista) {
      ops[col].push({ tipo: 'actualizar', id: existe.id, datos: { transportista } });
      return { accion: 'actualizar', texto: placa, detalle: `transporte: ${existe.transportista || 'vacío'} → ${transportista}` };
    }
    return { accion: 'igual', texto: placa };
  };

  const resultado = filas.map((f) => {
    const r = { numero: f.numero, errores: [] };
    const transportista = nombreTransporte(f.transportista);
    r.transportista = transportista;

    if (f.nombre) {
      const lic = compactar(f.licencia);
      const clave = lic ? `L${lic}` : `N${normalizar(f.nombre)}`;
      if (vistos.pilotos.has(clave)) {
        r.piloto = { accion: 'repetido', texto: f.nombre, detalle: `ya está en la fila ${vistos.pilotos.get(clave)}` };
      } else {
        vistos.pilotos.set(clave, f.numero);
        // Mismo piloto = misma licencia. Por nombre solo si a uno de los dos le falta la licencia
        // (dos pilotos con el mismo nombre y licencias distintas son personas distintas).
        const porNom = porNombre.get(normalizar(f.nombre));
        const existe = (lic && porLicencia.get(lic))
          || (porNom && (!lic || !compactar(porNom.licencia)) ? porNom : null);
        if (!existe) {
          ops.pilotos.push({ tipo: 'crear', datos: { nombre: f.nombre, licencia: f.licencia || '', telefono: f.telefono || '', transportista } });
          r.piloto = { accion: 'nuevo', texto: f.nombre };
        } else {
          const cambios = {};
          if (f.telefono && f.telefono !== existe.telefono) cambios.telefono = f.telefono;
          if (transportista && transportista !== existe.transportista) cambios.transportista = transportista;
          if (f.licencia && !existe.licencia) cambios.licencia = f.licencia;
          const n = Object.keys(cambios);
          if (n.length) {
            ops.pilotos.push({ tipo: 'actualizar', id: existe.id, datos: cambios });
            r.piloto = { accion: 'actualizar', texto: existe.nombre, detalle: `se actualiza: ${n.join(', ')}` };
          } else {
            r.piloto = { accion: 'igual', texto: existe.nombre };
          }
        }
      }
    } else if (f.licencia || f.telefono) {
      r.errores.push('Tiene licencia o teléfono pero falta el nombre del piloto');
    }

    r.cabezal = f.cabezal ? vehiculo('cabezales', cabPorPlaca, f.cabezal, transportista, f.numero) : null;
    r.tc = f.tc ? vehiculo('tcs', tcPorPlaca, f.tc, transportista, f.numero) : null;
    return r;
  });

  const contar = (col) => ({
    nuevos: ops[col].filter((o) => o.tipo === 'crear').length,
    actualizados: ops[col].filter((o) => o.tipo === 'actualizar').length,
  });
  return {
    filas: resultado,
    ops,
    transportes: [...nuevosTransportes.entries()].map(([id, nombre]) => ({ id, nombre })),
    resumen: { pilotos: contar('pilotos'), cabezales: contar('cabezales'), tcs: contar('tcs'), transportes: nuevosTransportes.size },
    errores: resultado.filter((r) => r.errores.length).length,
    total: ops.pilotos.length + ops.cabezales.length + ops.tcs.length + nuevosTransportes.size,
  };
}

/** Escribe el plan en Firestore en lotes. `avance(hechos, total)` informa el progreso. */
export async function aplicar(plan, avance = () => {}) {
  const quien = auth.currentUser?.email || '';
  const escrituras = [];
  for (const t of plan.transportes) {
    escrituras.push((b) => b.set(doc(db, 'transportes', t.id), { nombre: t.nombre, creadoEn: serverTimestamp(), creadoPor: quien }));
  }
  for (const col of ['pilotos', 'cabezales', 'tcs']) {
    for (const op of plan.ops[col]) {
      if (op.tipo === 'crear') {
        escrituras.push((b) => b.set(doc(collection(db, col)), {
          ...op.datos, fotos: [], creadoEn: serverTimestamp(), creadoPor: quien, actualizadoEn: serverTimestamp(),
        }));
      } else {
        escrituras.push((b) => b.update(doc(db, col, op.id), { ...op.datos, actualizadoEn: serverTimestamp() }));
      }
    }
  }
  const LOTE = 400; // Firestore admite hasta 500 escrituras por lote
  for (let i = 0; i < escrituras.length; i += LOTE) {
    const batch = writeBatch(db);
    escrituras.slice(i, i + LOTE).forEach((w) => w(batch));
    await batch.commit();
    avance(Math.min(i + LOTE, escrituras.length), escrituras.length);
  }
  return escrituras.length;
}
