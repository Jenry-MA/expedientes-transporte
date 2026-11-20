import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtFecha } from '../lib/catalogo';
import { useAsignaciones, useColeccion, useDocumento } from '../lib/db';
import { abrirArchivo, abrirBlob, subirArchivo } from '../lib/api';
import { pdfOperacion, pdfUnidad } from '../lib/pdf';
import UnidadEditor from '../components/UnidadEditor';

const indexar = (items) => Object.fromEntries((items || []).map((i) => [i.id, i]));

export default function OperacionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: op, cargando, error } = useDocumento('operaciones', id);
  const { items: asignaciones } = useAsignaciones(id);
  const pilotos = useColeccion('pilotos').items;
  const cabezales = useColeccion('cabezales').items;
  const tcs = useColeccion('tcs').items;
  const [editando, setEditando] = useState(null); // null | 'nueva' | asignación
  const [editandoOp, setEditandoOp] = useState(null);
  const [ocupado, setOcupado] = useState('');
  const [msg, setMsg] = useState('');

  const mapas = useMemo(
    () => ({ pilotos: indexar(pilotos), cabezales: indexar(cabezales), tcs: indexar(tcs) }),
    [pilotos, cabezales, tcs],
  );
  const piezas = (a) => ({ piloto: mapas.pilotos[a.pilotoId], cabezal: mapas.cabezales[a.cabezalId], tc: mapas.tcs[a.tcId] });

  if (cargando) return <p className="tenue">Cargando…</p>;
  if (error) return <p className="aviso error">{error.message}</p>;
  if (!op) return <p className="aviso">La operación no existe. <Link to="/operaciones">Volver</Link></p>;

  const lista = asignaciones || [];
  const catalogoListo = pilotos && cabezales && tcs;

  async function tarea(texto, fn) {
    setOcupado(texto);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setMsg(e.message);
    } finally {
      setOcupado('');
    }
  }

  const cerrarUnidad = (a) =>
    tarea(`Generando PDF de la unidad ${a.numero}…`, async () => {
      const p = piezas(a);
      if (!p.piloto || !p.cabezal || !p.tc) throw new Error(`La unidad ${a.numero} necesita piloto, cabezal y TC para cerrarse`);
      const blob = await pdfUnidad(op, a, p);
      const key = `expedientes/${op.id}/unidad-${a.numero}.pdf`;
      await subirArchivo(key, blob, 'application/pdf');
      await updateDoc(doc(db, 'asignaciones', a.id), { pdfKey: key, cerradaEn: serverTimestamp() });
    });

  const reabrir = (a) => {
    if (!confirm(`¿Reabrir la unidad ${a.numero}? El PDF guardado se reemplazará cuando la vuelvas a cerrar.`)) return;
    tarea('Reabriendo…', () => updateDoc(doc(db, 'asignaciones', a.id), { pdfKey: null, cerradaEn: null }));
  };

  const quitar = (a) => {
    if (!confirm(`¿Quitar la unidad ${a.numero} de esta operación?`)) return;
    tarea('Quitando…', () => deleteDoc(doc(db, 'asignaciones', a.id)));
  };

  const verPdf = (key) => abrirArchivo(key).catch((e) => setMsg(e.message));

  const vistaPrevia = (a) => {
    const ventana = window.open('', '_blank');
    tarea('Generando vista previa…', async () => {
      try {
        const blob = a ? await pdfUnidad(op, a, piezas(a)) : await pdfOperacion(op, lista, piezas);
        abrirBlob(blob, ventana);
      } catch (e) {
        ventana?.close();
        throw e;
      }
    });
  };

  const guardarPdfOperacion = () =>
    tarea('Generando PDF de la operación (puede tardar)…', async () => {
      if (!lista.length) throw new Error('La operación no tiene unidades');
      const blob = await pdfOperacion(op, lista, piezas);
      const key = `expedientes/${op.id}/operacion.pdf`;
      await subirArchivo(key, blob, 'application/pdf');
      await updateDoc(doc(db, 'operaciones', op.id), { pdfKey: key, pdfEn: serverTimestamp() });
    });

  const guardarOp = (e) => {
    e.preventDefault();
    tarea('Guardando…', async () => {
      if (!editandoOp.barco.trim()) throw new Error('Falta el nombre del barco');
      await updateDoc(doc(db, 'operaciones', op.id), {
        barco: editandoOp.barco.trim(), fecha: editandoOp.fecha, notas: editandoOp.notas.trim(),
      });
      setEditandoOp(null);
    });
  };

  const borrarOp = () => {
    if (lista.length) return setMsg('Quita primero todas las unidades para borrar la operación.');
    if (!confirm(`¿Borrar la operación ${op.barco}?`)) return;
    tarea('Borrando…', async () => {
      await deleteDoc(doc(db, 'operaciones', op.id));
      navigate('/operaciones', { replace: true });
    });
  };

  const campoOp = (name) => ({ value: editandoOp[name], onChange: (e) => setEditandoOp({ ...editandoOp, [name]: e.target.value }) });
  const cerradas = lista.filter((a) => a.pdfKey).length;

  return (
    <>
      <p className="migas"><Link to="/operaciones">← Operaciones</Link></p>

      {editandoOp ? (
        <form className="tarjeta form" onSubmit={guardarOp}>
          <div className="campos">
            <label>Barco *<input {...campoOp('barco')} required /></label>
            <label>Fecha *<input type="date" {...campoOp('fecha')} required /></label>
            <label className="ancho">Notas<textarea rows={2} {...campoOp('notas')} /></label>
          </div>
          <div className="acciones">
            <button type="submit">Guardar</button>
            <button type="button" className="sec" onClick={() => setEditandoOp(null)}>Cancelar</button>
            <button type="button" className="peligro" onClick={borrarOp}>Borrar operación</button>
          </div>
        </form>
      ) : (
        <div className="encabezado">
          <div>
            <h2>{op.barco}</h2>
            <p className="tenue">
              {fmtFecha(op.fecha)} · {lista.length} unidades · {cerradas} cerradas
              {op.notas && <><br />{op.notas}</>}
            </p>
          </div>
          <div className="acciones">
            <button className="sec" onClick={() => setEditandoOp({ barco: op.barco, fecha: op.fecha, notas: op.notas || '' })}>Editar</button>
            <button className="sec" disabled={!!ocupado || !lista.length || !catalogoListo} onClick={() => vistaPrevia(null)}>Vista previa</button>
            <button disabled={!!ocupado || !lista.length || !catalogoListo} onClick={guardarPdfOperacion}>Guardar PDF de operación</button>
            {op.pdfKey && <button className="sec" onClick={() => verPdf(op.pdfKey)}>Ver PDF guardado</button>}
          </div>
        </div>
      )}

      {ocupado && <p className="aviso">{ocupado}</p>}
      {msg && <p className="aviso error">{msg}</p>}

      {editando ? (
        <UnidadEditor
          key={editando === 'nueva' ? 'nueva' : editando.id}
          operacionId={op.id}
          asignacion={editando === 'nueva' ? null : editando}
          asignaciones={lista}
          catalogos={{ pilotos, cabezales, tcs }}
          onListo={() => setEditando(null)}
        />
      ) : (
        <button onClick={() => setEditando('nueva')} disabled={!catalogoListo}>+ Agregar unidad</button>
      )}

      <div className="tabla-wrap">
        <table className="tabla">
          <thead>
            <tr><th>#</th><th>Piloto</th><th>Cabezal</th><th>TC</th><th>Estado</th><th /></tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={6} className="tenue">Sin unidades todavía.</td></tr>
            )}
            {lista.map((a) => {
              const p = piezas(a);
              const cerrada = !!a.pdfKey;
              return (
                <tr key={a.id} className={editando?.id === a.id ? 'activa' : ''}>
                  <td>{a.numero}</td>
                  <td>{p.piloto ? <><b>{p.piloto.nombre}</b><br /><span className="tenue">{p.piloto.licencia}</span></> : <span className="tenue">—</span>}</td>
                  <td>{p.cabezal?.placa || <span className="tenue">—</span>}</td>
                  <td>{p.tc?.placa || <span className="tenue">—</span>}</td>
                  <td>{cerrada ? <span className="insignia ok">Cerrada</span> : <span className="insignia">Abierta</span>}</td>
                  <td><div className="acciones fin">
                    {cerrada ? (
                      <>
                        <button className="chico" onClick={() => verPdf(a.pdfKey)}>Ver PDF</button>
                        <button className="sec chico" disabled={!!ocupado} onClick={() => reabrir(a)}>Reabrir</button>
                      </>
                    ) : (
                      <>
                        <button className="sec chico" disabled={!!editando} onClick={() => setEditando(a)}>Cambiar</button>
                        <button className="sec chico" disabled={!!ocupado} onClick={() => vistaPrevia(a)}>Vista previa</button>
                        <button className="chico" disabled={!!ocupado} onClick={() => cerrarUnidad(a)}>Cerrar</button>
                        <button className="peligro chico" disabled={!!ocupado} onClick={() => quitar(a)}>Quitar</button>
                      </>
                    )}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
