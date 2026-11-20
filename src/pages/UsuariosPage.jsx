import { useState } from 'react';
import { deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useColeccion } from '../lib/db';
import PruebaAlmacenamiento from '../components/PruebaAlmacenamiento';

const fecha = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('es-GT') : '');

export default function UsuariosPage({ yo }) {
  const solicitudes = useColeccion('solicitudes');
  const equipo = useColeccion('equipo');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function tarea(fn) {
    setMsg('');
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setOcupado(false);
    }
  }

  const aprobar = (s) =>
    tarea(async () => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'equipo', s.id), {
        nombre: s.nombre || s.id, email: s.id, rol: 'miembro', aprobadoPor: yo, creadoEn: serverTimestamp(),
      });
      batch.delete(doc(db, 'solicitudes', s.id));
      await batch.commit();
    });

  const rechazar = (s) => {
    if (!confirm(`¿Rechazar a ${s.nombre} (${s.id})?`)) return;
    tarea(() => updateDoc(doc(db, 'solicitudes', s.id), { estado: 'rechazada', revisadoPor: yo }));
  };

  const borrarSolicitud = (s) =>
    tarea(() => deleteDoc(doc(db, 'solicitudes', s.id)));

  const cambiarRol = (m, rol) => tarea(() => updateDoc(doc(db, 'equipo', m.id), { rol }));

  const quitar = (m) => {
    if (!confirm(`¿Quitar el acceso de ${m.nombre || m.id}? Tendrá que volver a pedir acceso.`)) return;
    tarea(() => deleteDoc(doc(db, 'equipo', m.id)));
  };

  const pendientes = (solicitudes.items || []).filter((s) => s.estado !== 'rechazada');
  const rechazadas = (solicitudes.items || []).filter((s) => s.estado === 'rechazada');
  const miembros = [...(equipo.items || [])].sort((a, b) => (a.nombre || a.id).localeCompare(b.nombre || b.id));

  return (
    <>
      <h1>Usuarios</h1>
      <p className="tenue">Aprueba a quien pide acceso y decide quién administra.</p>
      {msg && <p className="aviso error">{msg}</p>}

      <section className="tarjeta">
        <h3>Solicitudes pendientes {pendientes.length > 0 && <span className="insignia">{pendientes.length}</span>}</h3>
        {solicitudes.items === null ? (
          <p className="tenue">Cargando…</p>
        ) : pendientes.length === 0 ? (
          <p className="tenue">No hay solicitudes por revisar.</p>
        ) : (
          <ul className="lista">
            {pendientes.map((s) => (
              <li key={s.id} className="fila">
                <b>{s.nombre}</b>
                <span className="tenue">{s.id}{s.creadoEn && `, pidió acceso el ${fecha(s.creadoEn)}`}</span>
                <div className="acciones">
                  <button className="chico" disabled={ocupado} onClick={() => aprobar(s)}>Aprobar</button>
                  <button className="peligro chico" disabled={ocupado} onClick={() => rechazar(s)}>Rechazar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="tarjeta">
        <h3>Equipo</h3>
        <ul className="lista">
          {miembros.map((m) => {
            const soyYo = m.id === yo;
            return (
              <li key={m.id} className="fila">
                <b>{m.nombre || m.id}{soyYo && ' (tú)'}</b>
                <span className="tenue">{m.id}</span>
                <div className="acciones">
                  <select
                    value={m.rol || 'miembro'}
                    disabled={soyYo || ocupado}
                    onChange={(e) => cambiarRol(m, e.target.value)}
                    title={soyYo ? 'No puedes cambiar tu propio rol' : ''}
                  >
                    <option value="miembro">Miembro</option>
                    <option value="admin">Admin</option>
                  </select>
                  {!soyYo && <button className="peligro chico" disabled={ocupado} onClick={() => quitar(m)}>Quitar acceso</button>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <PruebaAlmacenamiento />

      {rechazadas.length > 0 && (
        <section className="tarjeta">
          <h3>Rechazadas</h3>
          <ul className="lista">
            {rechazadas.map((s) => (
              <li key={s.id} className="fila">
                <b>{s.nombre}</b>
                <span className="tenue">{s.id}</span>
                <div className="acciones">
                  <button className="sec chico" disabled={ocupado} onClick={() => aprobar(s)}>Aprobar</button>
                  <button className="sec chico" disabled={ocupado} onClick={() => borrarSolicitud(s)} title="Le permite volver a pedir acceso">
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
