import {
  collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { normalizar } from './catalogo';

// Catálogo de transportes: solo el nombre. Pilotos, cabezales y TC guardan el nombre
// en su campo `transportista`; el catálogo sirve para elegirlo sin errores de escritura.
// El id del documento es el nombre normalizado, así no se repite "Transportes López" / "transportes lopez".

const COLECCIONES = ['pilotos', 'cabezales', 'tcs'];

export const limpiarNombre = (n) => String(n ?? '').trim().replace(/\s+/g, ' ');
export const idTransporte = (n) => normalizar(limpiarNombre(n)).replace(/\//g, '-');

/** Agrega el transporte si no existe. Devuelve el nombre tal como quedó en el catálogo. */
export async function agregarTransporte(nombre) {
  nombre = limpiarNombre(nombre);
  if (!nombre) throw new Error('Escribe el nombre del transporte');
  const ref = doc(db, 'transportes', idTransporte(nombre));
  const actual = await getDoc(ref);
  if (actual.exists()) return actual.data().nombre;
  await setDoc(ref, { nombre, creadoEn: serverTimestamp(), creadoPor: auth.currentUser?.email || '' });
  return nombre;
}

/** Nombre del catálogo que coincide (sin importar mayúsculas ni tildes), o null. */
export async function buscarTransporte(nombre) {
  const id = idTransporte(nombre);
  if (!id) return null;
  const s = await getDoc(doc(db, 'transportes', id));
  return s.exists() ? s.data().nombre : null;
}

/** Cambia el nombre en el catálogo y en todos los pilotos, cabezales y TC que lo usan. */
export async function renombrarTransporte(viejo, nuevo) {
  nuevo = limpiarNombre(nuevo);
  if (!nuevo) throw new Error('Escribe el nombre del transporte');
  if (nuevo === viejo.nombre) return;
  const idNuevo = idTransporte(nuevo);
  if (idNuevo !== viejo.id && (await getDoc(doc(db, 'transportes', idNuevo))).exists()) {
    throw new Error(`Ya existe el transporte «${nuevo}»`);
  }
  const batch = writeBatch(db);
  if (idNuevo !== viejo.id) batch.delete(doc(db, 'transportes', viejo.id));
  batch.set(doc(db, 'transportes', idNuevo), { nombre: nuevo, creadoEn: viejo.creadoEn || serverTimestamp(), creadoPor: viejo.creadoPor || '' });
  for (const col of COLECCIONES) {
    const s = await getDocs(query(collection(db, col), where('transportista', '==', viejo.nombre)));
    s.docs.forEach((d) => batch.update(d.ref, { transportista: nuevo }));
  }
  await batch.commit();
}

export async function transporteEnUso(nombre) {
  for (const col of COLECCIONES) {
    const s = await getDocs(query(collection(db, col), where('transportista', '==', nombre), limit(1)));
    if (!s.empty) return true;
  }
  return false;
}
