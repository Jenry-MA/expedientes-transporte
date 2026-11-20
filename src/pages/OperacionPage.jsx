import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtFecha, fmtTelefono, fmtViaje, telHref } from '../lib/catalogo';
import { duplicarOperacion, useAsignaciones, useColeccion, useDocumento } from '../lib/db';
import { abrirArchivo, abrirBlob, subirArchivo } from '../lib/api';
import { pdfOperacion, pdfUnidad } from '../lib/pdf';
import UnidadEditor from '../components/UnidadEditor';
import OperacionForm from '../components/OperacionForm';
import { copiarTabla } from '../lib/tabla';

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
  const [formOp, setFormOp] = useState(null); // null | 'editar' | 'duplicar'
  const [copiarUnidades, setCopiarUnidades] = useState(true);
  const [listo, setListo] = useState('');
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
    setListo('');
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setMsg(e.message);
    } finally {
      setOcupado('');
    }
  }

  const quitar = (a) => {
    if (!confirm(`¿Quitar la unidad ${a.numero} de esta operación?`)) return;
    tarea('Quitando…', () => deleteDoc(doc(db, 'asignaciones', a.id)));
  };

  const verPdf = (key) => abrirArchivo(key).catch((e) => setMsg(e.message));

  const vistaPrevia = (a) => {
    const ventana = window.open('', '_blank');
    tarea('Generando PDF…', async () => {
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

  const guardarOp = async (datos) => {
    await updateDoc(doc(db, 'operaciones', op.id), datos);
    setFormOp(null);
  };

  const duplicar = async (datos) => {
    const nuevoId = await duplicarOperacion(datos, copiarUnidades ? lista : []);
    setFormOp(null);
    navigate(`/operaciones/${nuevoId}`);
  };

  const copiar = () => tarea('Copiando…', async () => {
    const filas = lista.map((a) => ({ numero: a.numero, ...piezas(a) }));
    await copiarTabla(filas);
    setListo(`Tabla copiada: ${plural(filas.length, 'unidad', 'unidades')}. Pégala en Excel, WhatsApp o un correo.`);
  });

  const borrarOp = () => {
    if (lista.length) return setMsg('Quita primero todas las unidades para borrar la operación.');
    if (!confirm(`¿Borrar la operación ${op.barco}?`)) return;
    tarea('Borrando…', async () => {
      await deleteDoc(doc(db, 'operaciones', op.id));
      navigate('/operaciones', { replace: true });
    });
  };


  return (
    <>
      <p className="migas"><Link to="/operaciones">← Operaciones</Link></p>

      {formOp === 'editar' ? (
        <OperacionForm
          titulo="Editar operación"
          inicial={{ barco: op.barco, viaje: op.viaje || '', fecha: op.fecha, notas: op.notas || '' }}
          textoBoton="Guardar cambios"
          onGuardar={guardarOp}
          onCancelar={() => setFormOp(null)}
          extra={<button type="button" className="peligro" onClick={borrarOp}>Borrar operación</button>}
        />
      ) : formOp === 'duplicar' ? (
        <OperacionForm
          titulo={`Duplicar ${op.barco}${op.viaje ? ` ${fmtViaje(op.viaje)}` : ''}`}
          inicial={{ barco: op.barco, viaje: '', fecha: '', notas: op.notas || '' }}
          textoBoton="Crear copia"
          onGuardar={duplicar}
          onCancelar={() => setFormOp(null)}
        >
          {lista.length > 0 && (
            <label className="casilla-check">
              <input type="checkbox" checked={copiarUnidades} onChange={(e) => setCopiarUnidades(e.target.checked)} />
              <span>
                Copiar las {plural(lista.length, 'unidad', 'unidades')} con sus mismos pilotos, cabezales y TC
                <span className="tenue"> (después puedes cambiar las piezas que no se repitan)</span>
              </span>
            </label>
          )}
        </OperacionForm>
      ) : (
        <div className="barco-cabecera">
          <div>
            <h1>{op.barco}{op.viaje && <span className="viaje"> {fmtViaje(op.viaje)}</span>}</h1>
            <p className="tenue">
              ETA {fmtFecha(op.fecha)}, {plural(lista.length, 'unidad', 'unidades')}
            </p>
            {op.notas && <p className="tenue">{op.notas}</p>}
          </div>
          <div className="acciones">
            <button className="sec" onClick={() => setFormOp('editar')}>Editar datos</button>
            <button className="sec" onClick={() => { setCopiarUnidades(true); setFormOp('duplicar'); }}>Duplicar</button>
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
      {listo && <p className="ok-fondo">{listo}</p>}

      <div className="barra-unidades">
        <h2>Unidades</h2>
        <div className="acciones">
          {lista.length > 0 && (
            <button className="sec" disabled={!!ocupado || !catalogoListo} onClick={copiar}>Copiar tabla</button>
          )}
          {!editando && <button onClick={() => setEditando('nueva')} disabled={!catalogoListo}>Agregar unidad</button>}
        </div>
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
              <li key={a.id} className="unidad">
                <div className="placa" aria-label={`Unidad ${a.numero}`}>{a.numero}</div>
                <div className="unidad-datos">
                  <div className="dato">
                    <span className="dato-tipo">Piloto</span>
                    {p.piloto ? (
                      <span className="dato-piloto">
                        <b title={p.piloto.nombre}>{p.piloto.nombre}</b>
                        {p.piloto.telefono
                          ? <a className="telefono" href={telHref(p.piloto.telefono)}>Tel. {fmtTelefono(p.piloto.telefono)}</a>
                          : <span className="vacio">Sin teléfono</span>}
                      </span>
                    ) : <span className="vacio">Sin piloto</span>}
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
                  <div className="acciones fin">
                    <button className="peligro chico" disabled={!!ocupado} onClick={() => quitar(a)}>Quitar</button>
                    <button className="sec chico" disabled={!!editando} onClick={() => setEditando(a)}>Cambiar piezas</button>
                    <button className="chico" disabled={!!ocupado} onClick={() => vistaPrevia(a)}>Ver PDF</button>
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
