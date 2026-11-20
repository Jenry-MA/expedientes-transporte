import { useMemo, useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizar } from '../lib/catalogo';
import { useColeccion } from '../lib/db';
import {
  agregarTransporte, idTransporte, limpiarNombre, renombrarTransporte, transporteEnUso,
} from '../lib/transportes';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function usoTexto(u) {
  const partes = [];
  if (u.pilotos) partes.push(plural(u.pilotos, 'piloto', 'pilotos'));
  if (u.cabezales) partes.push(plural(u.cabezales, 'cabezal', 'cabezales'));
  if (u.tcs) partes.push(plural(u.tcs, 'TC', 'TC'));
  return partes.length ? partes.join(', ') : 'Sin uso todavía';
}

export default function TransportesPage() {
  const { items, error } = useColeccion('transportes');
  const pilotos = useColeccion('pilotos').items;
  const cabezales = useColeccion('cabezales').items;
  const tcs = useColeccion('tcs').items;
  const [nuevo, setNuevo] = useState('');
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState(null); // { id, nombre }
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Cuántos pilotos, cabezales y TC usa cada transporte (por nombre normalizado).
  const usos = useMemo(() => {
    const m = new Map();
    const contar = (lista, campo) => (lista || []).forEach((r) => {
      const id = idTransporte(r.transportista);
      if (!id) return;
      const u = m.get(id) || { pilotos: 0, cabezales: 0, tcs: 0, nombre: limpiarNombre(r.transportista) };
      u[campo] += 1;
      m.set(id, u);
    });
    contar(pilotos, 'pilotos');
    contar(cabezales, 'cabezales');
    contar(tcs, 'tcs');
    return m;
  }, [pilotos, cabezales, tcs]);

  const catalogo = items || [];
  const enCatalogo = new Set(catalogo.map((t) => t.id));
  // Nombres escritos en registros que todavía no están en el catálogo.
  const sueltos = [...usos.entries()].filter(([id]) => !enCatalogo.has(id)).map(([, u]) => u.nombre);

  const lista = catalogo
    .filter((t) => !q || normalizar(t.nombre).includes(normalizar(q)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

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

  const agregar = (e) => {
    e.preventDefault();
    tarea(async () => {
      const id = idTransporte(nuevo);
      if (enCatalogo.has(id)) throw new Error(`«${limpiarNombre(nuevo)}» ya está en el catálogo`);
      await agregarTransporte(nuevo);
      setNuevo('');
    });
  };

  const guardarNombre = (t) => (e) => {
    e.preventDefault();
    tarea(async () => {
      await renombrarTransporte(t, editando.nombre);
      setEditando(null);
    });
  };

  const borrar = (t) => tarea(async () => {
    if (await transporteEnUso(t.nombre)) throw new Error(`«${t.nombre}» está en uso; cámbialo primero en esos registros.`);
    if (!confirm(`¿Borrar «${t.nombre}» del catálogo?`)) return;
    await deleteDoc(doc(db, 'transportes', t.id));
  });

  const agregarSueltos = () => tarea(async () => {
    for (const n of sueltos) await agregarTransporte(n);
  });

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Transportes</h1>
          <p className="tenue">Las empresas de transporte que se eligen en pilotos, cabezales y TC.</p>
        </div>
      </div>

      <form className="tarjeta form-linea" onSubmit={agregar}>
        <label>
          Nombre del transporte
          <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Ej. Transportes Escobar" required />
        </label>
        <button type="submit" disabled={ocupado || !limpiarNombre(nuevo)}>Agregar transporte</button>
      </form>

      {msg && <p className="aviso error">{msg}</p>}
      {error && <p className="aviso error">{error.message}</p>}

      {sueltos.length > 0 && (
        <div className="aviso-bloque">
          <p>
            Hay {plural(sueltos.length, 'nombre escrito', 'nombres escritos')} en registros que no está en el catálogo:{' '}
            <b>{sueltos.join(', ')}</b>.
          </p>
          <button className="sec chico" disabled={ocupado} onClick={agregarSueltos}>
            Agregar {sueltos.length === 1 ? 'al catálogo' : 'todos al catálogo'}
          </button>
        </div>
      )}

      {catalogo.length > 6 && (
        <input className="buscador" type="search" placeholder="Buscar transporte…" value={q} onChange={(e) => setQ(e.target.value)} />
      )}

      {items === null ? (
        <p className="tenue">Cargando…</p>
      ) : catalogo.length === 0 ? (
        <div className="lista-vacia">
          <p>Todavía no hay transportes. Agrega el primero arriba, o escríbelo directamente al registrar un piloto, cabezal o TC.</p>
        </div>
      ) : lista.length === 0 ? (
        <p className="tenue">Ningún transporte coincide con «{q}».</p>
      ) : (
        <ul className="lista">
          {lista.map((t) => (
            <li key={t.id} className="fila">
              {editando?.id === t.id ? (
                <form className="form-linea en-fila" onSubmit={guardarNombre(t)}>
                  <input
                    aria-label="Nuevo nombre"
                    value={editando.nombre}
                    onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                    autoFocus
                  />
                  <button type="submit" className="chico" disabled={ocupado}>Guardar</button>
                  <button type="button" className="sec chico" onClick={() => setEditando(null)}>Cancelar</button>
                </form>
              ) : (
                <>
                  <b>{t.nombre}</b>
                  <span className="tenue">{usoTexto(usos.get(t.id) || {})}</span>
                  <div className="acciones">
                    <button className="sec chico" disabled={ocupado} onClick={() => setEditando({ id: t.id, nombre: t.nombre })}>
                      Cambiar nombre
                    </button>
                    {!usos.get(t.id) && (
                      <button className="peligro chico" disabled={ocupado} onClick={() => borrar(t)}>Borrar</button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {catalogo.length > 0 && (
        <p className="tenue pie">Al cambiar el nombre se actualiza también en los pilotos, cabezales y TC que lo usan.</p>
      )}
    </>
  );
}
