import { useEffect, useState } from 'react';
import {
  addDoc, collection, doc, getDocs, limit, onSnapshot, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { CAMPO_ASIG, TIPOS, compactar } from './catalogo';

const quien = () => auth.currentUser?.email || '';

/**
 * Colección en tiempo real. `filtro` es [campo, valor] para una igualdad (opcional).
 * El catálogo es chico: la búsqueda y el orden se hacen en el navegador.
 */
export function useColeccion(nombre, filtro = null) {
  const [estado, setEstado] = useState({ items: null, error: null });
  const [campo, valor] = filtro || [];
  useEffect(() => {
    const col = collection(db, nombre);
    const ref = campo ? query(col, where(campo, '==', valor)) : col;
    return onSnapshot(
      ref,
      (s) => setEstado({ items: s.docs.map((d) => ({ id: d.id, ...d.data() })), error: null }),
      (error) => setEstado({ items: [], error }),
    );
  }, [nombre, campo, valor]);
  return estado;
}

export function useDocumento(nombre, id) {
  const [estado, setEstado] = useState({ data: null, cargando: !!id, error: null });
  useEffect(() => {
    if (!id) {
      setEstado({ data: null, cargando: false, error: null });
      return undefined;
    }
    return onSnapshot(
      doc(db, nombre, id),
      (s) => setEstado({ data: s.exists() ? { id: s.id, ...s.data() } : null, cargando: false, error: null }),
      (error) => setEstado({ data: null, cargando: false, error }),
    );
  }, [nombre, id]);
  return estado;
}

export function useAsignaciones(operacionId) {
  // Solo igualdad (sin orderBy) para no necesitar índice compuesto; se ordena aquí.
  const { items, error } = useColeccion('asignaciones', ['operacionId', operacionId]);
  return { items: items && [...items].sort((a, b) => a.numero - b.numero), error };
}

/** Crea o edita un piloto/cabezal/TC. Valida requeridos y placa repetida. Devuelve el id. */
export async function guardarEntidad(tipo, id, valores, { idNuevo = null, fotos = [] } = {}) {
  const cfg = TIPOS[tipo];
  const datos = {};
  for (const c of cfg.campos) {
    datos[c.name] = String(valores[c.name] ?? '').trim();
    if (c.requerido && !datos[c.name]) throw new Error(`Falta: ${c.label}`);
  }
  if (cfg.unico === 'placa') {
    datos.placa = datos.placa.toUpperCase();
    datos.placaNorm = compactar(datos.placa);
    const snap = await getDocs(query(collection(db, tipo), where('placaNorm', '==', datos.placaNorm), limit(2)));
    if (snap.docs.some((d) => d.id !== id)) {
      throw new Error(`Ya existe un ${cfg.singular} con placa ${datos.placa}`);
    }
  }
  datos.actualizadoEn = serverTimestamp();
  if (id) {
    await updateDoc(doc(db, tipo, id), datos);
    return id;
  }
  // idNuevo: id reservado en el formulario, donde ya se subieron los documentos a R2.
  const ref = idNuevo ? doc(db, tipo, idNuevo) : doc(collection(db, tipo));
  await setDoc(ref, { ...datos, fotos, creadoEn: serverTimestamp(), creadoPor: quien() });
  return ref.id;
}

/** ¿El registro aparece en alguna unidad? (no se borran registros usados en operaciones) */
export async function estaEnUso(tipo, id) {
  const snap = await getDocs(query(collection(db, 'asignaciones'), where(CAMPO_ASIG[tipo], '==', id), limit(1)));
  return !snap.empty;
}

export async function crearOperacion({ barco, viaje = '', fecha, notas }) {
  if (!barco.trim()) throw new Error('Falta el nombre del barco');
  if (!fecha) throw new Error('Falta la ETA');
  const ref = await addDoc(collection(db, 'operaciones'), {
    barco: barco.trim(), viaje, fecha, notas: notas.trim(), ultimoNumero: 0, pdfKey: null,
    creadoPor: quien(), creadoEn: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Crea una operación nueva con los datos dados y, si se pide, una copia de sus unidades
 * (mismos pilotos, cabezales y TC, numeradas 1, 2, 3…). Devuelve el id nuevo.
 */
export async function duplicarOperacion(datos, asignaciones = []) {
  const opRef = doc(collection(db, 'operaciones'));
  const unidades = [...asignaciones].sort((a, b) => a.numero - b.numero);
  const batch = writeBatch(db);
  batch.set(opRef, {
    ...datos, ultimoNumero: unidades.length, pdfKey: null,
    creadoPor: quien(), creadoEn: serverTimestamp(),
  });
  unidades.forEach((a, i) => {
    batch.set(doc(collection(db, 'asignaciones')), {
      operacionId: opRef.id, numero: i + 1,
      pilotoId: a.pilotoId || null, cabezalId: a.cabezalId || null, tcId: a.tcId || null,
      pdfKey: null, creadoPor: quien(), creadoEn: serverTimestamp(),
    });
  });
  await batch.commit();
  return opRef.id;
}

/** Nueva unidad con número consecutivo (transacción: dos usuarios no repiten número). */
export async function crearAsignacion(operacionId, piezas) {
  const opRef = doc(db, 'operaciones', operacionId);
  const nueva = doc(collection(db, 'asignaciones'));
  await runTransaction(db, async (tx) => {
    const op = await tx.get(opRef);
    if (!op.exists()) throw new Error('La operación ya no existe');
    const numero = (op.data().ultimoNumero || 0) + 1;
    tx.update(opRef, { ultimoNumero: numero });
    tx.set(nueva, {
      operacionId, numero, ...piezas, pdfKey: null,
      creadoPor: quien(), creadoEn: serverTimestamp(),
    });
  });
  return nueva.id;
}
