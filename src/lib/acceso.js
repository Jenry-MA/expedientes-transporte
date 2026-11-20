import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Nombre escrito en el registro: onAuthStateChanged se dispara antes de que
// updateProfile guarde el displayName, así que se pasa por aquí.
let nombreRegistro = '';
export const recordarNombre = (n) => { nombreRegistro = n.trim(); };

const correoDe = (user) => (user.email || '').toLowerCase();

/**
 * Al entrar: si todavía no hay admin, este usuario lo reclama.
 * Si no es del equipo, deja su solicitud de acceso (una sola vez).
 */
async function prepararAcceso(user) {
  const email = correoDe(user);
  const nombre = nombreRegistro || user.displayName || email.split('@')[0];
  const miembroRef = doc(db, 'equipo', email);
  const adminRef = doc(db, 'config', 'admin');

  const admin = await getDoc(adminRef);
  if (!admin.exists()) {
    const batch = writeBatch(db);
    batch.set(miembroRef, { nombre, email, rol: 'admin', creadoEn: serverTimestamp() }, { merge: true });
    batch.set(adminRef, { email, creadoEn: serverTimestamp() });
    try {
      await batch.commit();
      return;
    } catch (e) {
      // Otro usuario se registró primero; sigue como solicitud normal.
      console.warn('No se pudo reclamar admin:', e.code || e);
    }
  }

  if ((await getDoc(miembroRef)).exists()) return;
  const solRef = doc(db, 'solicitudes', email);
  if (!(await getDoc(solRef)).exists()) {
    await setDoc(solRef, { nombre, email, uid: user.uid, estado: 'pendiente', creadoEn: serverTimestamp() });
  }
}

/**
 * Estado de la sesión: 'cargando' | 'fuera' | 'pendiente' | 'rechazado' | 'error' | 'dentro' (con rol).
 * Escucha en vivo: cuando el admin aprueba, el usuario entra sin recargar.
 */
export function useSesion() {
  const [sesion, setSesion] = useState({ estado: 'cargando' });

  useEffect(() => {
    let dejarDeEscuchar = () => {};
    const offAuth = onAuthStateChanged(auth, async (user) => {
      dejarDeEscuchar();
      dejarDeEscuchar = () => {};
      if (!user) return setSesion({ estado: 'fuera' });
      setSesion({ estado: 'cargando' });
      try {
        await prepararAcceso(user);
      } catch (e) {
        console.error(e);
        return setSesion({ estado: 'error', user, mensaje: e.message });
      }

      const email = correoDe(user);
      let miembro;
      let solicitud;
      const actualizar = () => {
        if (miembro === undefined) return;
        if (miembro) return setSesion({ estado: 'dentro', user, rol: miembro.rol || 'miembro', nombre: miembro.nombre });
        if (solicitud === undefined) return;
        setSesion({ estado: solicitud?.estado === 'rechazada' ? 'rechazado' : 'pendiente', user });
      };
      const offM = onSnapshot(
        doc(db, 'equipo', email),
        (d) => { miembro = d.exists() ? d.data() : null; actualizar(); },
        () => { miembro = null; actualizar(); },
      );
      const offS = onSnapshot(
        doc(db, 'solicitudes', email),
        (d) => { solicitud = d.exists() ? d.data() : null; actualizar(); },
        () => { solicitud = null; actualizar(); },
      );
      dejarDeEscuchar = () => { offM(); offS(); };
    });
    return () => { offAuth(); dejarDeEscuchar(); };
  }, []);

  return sesion;
}
