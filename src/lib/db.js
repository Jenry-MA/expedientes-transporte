import { useEffect, useState } from 'react';
import {
  addDoc, collection, doc, getDocs, limit, onSnapshot, query,
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
    if (c.vencimiento) {
      // «No aplica» borra la fecha; así no queda una fecha vieja escondida.
      datos.venceNoAplica = !!valores.venceNoAplica;
      if (datos.venceNoAplica) datos[c.name] = '';
    }
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
    barco: barco.trim(), viaje, fecha, notas: notas.trim(), listas: [{ id: LISTA_PRINCIPAL, nombre: 'Listado 1' }], pdfKey: null,
    creadoPor: quien(), creadoEn: serverTimestamp(),
  });
  return ref.id;
}

// ---------- Listados de una operación ----------
// Un barco puede tener varios listados de permisos. La operación guarda `listas: [{ id, nombre }]`
// y cada unidad su `listaId`. Las operaciones viejas (sin `listas`) tienen un solo «Listado 1»
// y sus unidades sin `listaId` pertenecen a él.

export const LISTA_PRINCIPAL = 'principal';
export const listasDe = (op) => (op?.listas?.length ? op.listas : [{ id: LISTA_PRINCIPAL, nombre: 'Listado 1' }]);
export const listaDe = (a) => a.listaId || LISTA_PRINCIPAL;
const idCorto = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);

export async function agregarListado(op, nombre) {
  nombre = String(nombre || '').trim();
  const listas = listasDe(op);
  if (!nombre) nombre = `Listado ${listas.length + 1}`;
  const nueva = { id: idCorto(), nombre };
  await updateDoc(doc(db, 'operaciones', op.id), { listas: [...listas, nueva] });
  return nueva.id;
}

export async function renombrarListado(op, listaId, nombre) {
  nombre = String(nombre || '').trim();
  if (!nombre) throw new Error('Escribe el nombre del listado');
  await updateDoc(doc(db, 'operaciones', op.id), {
    listas: listasDe(op).map((l) => (l.id === listaId ? { ...l, nombre } : l)),
  });
}

/** Borra el listado y sus unidades. Siempre queda al menos un listado. */
export async function borrarListado(op, listaId, unidades) {
  const quedan = listasDe(op).filter((l) => l.id !== listaId);
  if (!quedan.length) throw new Error('La operación necesita al menos un listado');
  const batch = writeBatch(db);
  unidades.forEach((a) => batch.delete(doc(db, 'asignaciones', a.id)));
  batch.update(doc(db, 'operaciones', op.id), { listas: quedan });
  await batch.commit();
}

/**
 * Crea una operación nueva con los datos dados y, si se pide, copia todos sus listados
 * con sus unidades (mismos pilotos, cabezales y TC, numeradas 1, 2, 3… en cada listado).
 */
export async function duplicarOperacion(datos, op, asignaciones = [], copiar = true) {
  const opRef = doc(collection(db, 'operaciones'));
  const listas = copiar ? listasDe(op) : [{ id: LISTA_PRINCIPAL, nombre: 'Listado 1' }];
  const batch = writeBatch(db);
  batch.set(opRef, {
    ...datos, listas, pdfKey: null,
    creadoPor: quien(), creadoEn: serverTimestamp(),
  });
  if (copiar) {
    for (const l of listas) {
      asignaciones.filter((a) => listaDe(a) === l.id).sort((a, b) => a.numero - b.numero).forEach((a, i) => {
        batch.set(doc(collection(db, 'asignaciones')), {
          operacionId: opRef.id, listaId: l.id, numero: i + 1,
          pilotoId: a.pilotoId || null, cabezalId: a.cabezalId || null, tcId: a.tcId || null,
          pdfKey: null, creadoPor: quien(), creadoEn: serverTimestamp(),
        });
      });
    }
  }
  await batch.commit();
  return opRef.id;
}

/**
 * Deja las unidades de UN listado numeradas 1, 2, 3… sin huecos ni repetidos.
 * `quitarId`: unidad que se borra en el mismo lote. Solo escribe las que cambian.
 */
export async function renumerarUnidades(unidadesDeLista, quitarId = null) {
  const quedan = [...unidadesDeLista].filter((a) => a.id !== quitarId).sort((a, b) => a.numero - b.numero);
  const batch = writeBatch(db);
  if (quitarId) batch.delete(doc(db, 'asignaciones', quitarId));
  quedan.forEach((a, i) => {
    if (a.numero !== i + 1) batch.update(doc(db, 'asignaciones', a.id), { numero: i + 1 });
  });
  await batch.commit();
}

/**
 * Nueva unidad al final del listado. Si dos personas agregan a la vez y se repite
 * el número, la pantalla de la operación lo corrige sola (renumerarUnidades).
 */
export async function crearAsignacion(operacionId, piezas, { listaId = LISTA_PRINCIPAL, numero = 1 } = {}) {
  const ref = await addDoc(collection(db, 'asignaciones'), {
    operacionId, listaId, numero, ...piezas, pdfKey: null,
    creadoPor: quien(), creadoEn: serverTimestamp(),
  });
  return ref.id;
}
