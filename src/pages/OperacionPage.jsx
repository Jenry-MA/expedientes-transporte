import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtFecha } from '../lib/catalogo';
import { useAsignaciones, useColeccion, useDocumento } from '../lib/db';
import { abrirArchivo, abrirBlob, subirArchivo } from '../lib/api';
import { pdfOperacion, pdfUnidad } from '../lib/pdf';
import UnidadEditor from '../components/UnidadEditor';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
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
      const sinDocs = [['piloto', p.piloto], ['cabezal', p.cabezal], ['TC', p.tc]]
        .filter(([, x]) => !(x.fotos || []).length).map(([n]) => n);
      if (sinDocs.length && !confirm(`El ${sinDocs.join(', ')} no tiene documentos. ¿Cerrar la unidad de todas formas?`)) return;
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
        <div className="barco-cabecera">
          <div>
            <h1>{op.barco}</h1>
            <p className="tenue">
              {fmtFecha(op.fecha)}, {plural(lista.length, 'unidad', 'unidades')}
              {lista.length > 0 && `, ${cerradas === lista.length ? 'todas cerradas' : plural(cerradas, 'cerrada', 'cerradas')}`}
            </p>
            {op.notas && <p className="tenue">{op.notas}</p>}
          </div>
          <div className="acciones">
            <button className="sec" onClick={() => setEditandoOp({ barco: op.barco, fecha: op.fecha, notas: op.notas || '' })}>Editar datos</button>
            <button className="sec" disabled={!!ocupado || !lista.length || !catalogoListo} onClick={() => vistaPrevia(null)}>Vista previa</button>
            {op.pdfKey && <button className="sec" onClick={() => verPdf(op.pdfKey)}>Ver PDF guardado</button>}
            <button disabled={!!ocupado || !lista.length || !catalogoListo} onClick={guardarPdfOperacion}>
              {op.pdfKey ? 'Actualizar PDF de operación' : 'Guardar PDF de operación'}
            </button>
          </div>
        </div>
      )}

      {ocupado && <p className="aviso">{ocupado}</p>}
      {msg && <p className="aviso error">{msg}</p>}

      <div className="barra-unidades">
        <h2>Unidades</h2>
        {!editando && <button onClick={() => setEditando('nueva')} disabled={!catalogoListo}>Agregar unidad</button>}
      </div>

      {editando === 'nueva' && (
        <UnidadEditor
          key="nueva"
          operacionId={op.id}
          asignacion={null}
          asignaciones={lista}
          catalogos={{ pilotos, cabezales, tcs }}
          onListo={() => setEditando(null)}
        />
      )}

      {lista.length === 0 && editando !== 'nueva' ? (
        <div className="lista-vacia">
          <p>Este barco todavía no tiene unidades. Cada unidad junta un piloto, un cabezal y un TC.</p>
          <button onClick={() => setEditando('nueva')} disabled={!catalogoListo}>Agregar la primera unidad</button>
        </div>
      ) : (
        <ol className="unidades">
          {lista.map((a) => {
            const p = piezas(a);
            const cerrada = !!a.pdfKey;
            if (editando?.id === a.id) {
              return (
                <li key={a.id}>
                  <UnidadEditor
                    operacionId={op.id}
                    asignacion={a}
                    asignaciones={lista}
                    catalogos={{ pilotos, cabezales, tcs }}
                    onListo={() => setEditando(null)}
                  />
                </li>
              );
            }
            return (
              <li key={a.id} className={`unidad ${cerrada ? 'cerrada' : ''}`}>
                <div className="placa" aria-label={`Unidad ${a.numero}`}>{a.numero}</div>
                <div className="unidad-datos">
                  <div className="dato">
                    <span className="dato-tipo">Piloto</span>
                    {p.piloto ? <b title={p.piloto.nombre}>{p.piloto.nombre}</b> : <span className="vacio">Sin piloto</span>}
                  </div>
                  <div className="dato">
                    <span className="dato-tipo">Cabezal</span>
                    {p.cabezal ? <span><span className="matricula">{p.cabezal.placa}</span></span> : <span className="vacio">Sin cabezal</span>}
                  </div>
                  <div className="dato">
                    <span className="dato-tipo">TC</span>
                    {p.tc ? <span><span className="matricula">{p.tc.placa}</span></span> : <span className="vacio">Sin TC</span>}
                  </div>
                </div>
                <div className="unidad-lado">
                  {cerrada ? <span className="insignia ok">Cerrada, PDF guardado</span> : <span className="insignia">Abierta</span>}
                  <div className="acciones fin">
                    {cerrada ? (
                      <>
                        <button className="sec chico" disabled={!!ocupado} onClick={() => reabrir(a)}>Reabrir</button>
                        <button className="chico" onClick={() => verPdf(a.pdfKey)}>Ver PDF</button>
                      </>
                    ) : (
                      <>
                        <button className="peligro chico" disabled={!!ocupado} onClick={() => quitar(a)}>Quitar</button>
                        <button className="sec chico" disabled={!!editando} onClick={() => setEditando(a)}>Cambiar piezas</button>
                        <button className="sec chico" disabled={!!ocupado} onClick={() => vistaPrevia(a)}>Vista previa</button>
                        <button className="chico" disabled={!!ocupado} onClick={() => cerrarUnidad(a)}>Cerrar y guardar PDF</button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
