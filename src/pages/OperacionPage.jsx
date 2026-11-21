import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtFecha, fmtTelefono, fmtViaje, problemasDe, telHref } from '../lib/catalogo';
import {
  agregarListado, borrarListado, duplicarOperacion, listaDe, listasDe, renombrarListado,
  renumerarUnidades, useAsignaciones, useColeccion, useDocumento,
} from '../lib/db';
import { abrirBlob } from '../lib/api';
import { pdfOperacion, pdfUnidad } from '../lib/pdf';
import UnidadEditor from '../components/UnidadEditor';
import OperacionForm from '../components/OperacionForm';
import { copiarTabla } from '../lib/tabla';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const indexar = (items) => Object.fromEntries((items || []).map((i) => [i.id, i]));

/** Avisos de la unidad en una línea debajo de la fila: «Piloto: …», «TC: …». Nada si está al día. */
function AvisosUnidad({ p }) {
  const items = [['Piloto', 'pilotos', p.piloto], ['Cabezal', 'cabezales', p.cabezal], ['TC', 'tcs', p.tc]]
    .flatMap(([nombre, tipo, e]) => problemasDe(tipo, e).map((x) => ({ ...x, texto: `${nombre}: ${x.texto}` })));
  if (!items.length) return null;
  return (
    <div className="unidad-avisos">
      {items.map((x) => (
        <span key={x.texto} className={`aviso-doc ${x.nivel}`}>{x.nivel === 'error' ? '⛔' : '⚠'} {x.texto}</span>
      ))}
    </div>
  );
}

/** Cuántas unidades tienen documentos pendientes o vencidos. */
function ResumenAvisos({ unidades, piezas }) {
  if (!unidades.length) return null;
  const niveles = unidades.map((a) => {
    const p = piezas(a);
    const todos = [...problemasDe('pilotos', p.piloto), ...problemasDe('cabezales', p.cabezal), ...problemasDe('tcs', p.tc)];
    return todos.some((x) => x.nivel === 'error') ? 'error' : todos.length ? 'aviso' : null;
  });
  const pendientes = niveles.filter(Boolean).length;
  const vencidas = niveles.filter((x) => x === 'error').length;
  if (!pendientes) return <p className="aviso-doc ok">Documentos al día en todas las unidades</p>;
  return (
    <p className={`aviso-doc ${vencidas ? 'error' : 'aviso'}`}>
      {vencidas ? '⛔' : '⚠'} {plural(pendientes, 'unidad con', 'unidades con')} documentos pendientes
      {vencidas ? ` (${vencidas} con algo vencido)` : ''}
    </p>
  );
}

function FilaUnidad({ a, p, ocupado, editando, onPdf, onCambiar, onQuitar }) {
  return (
    <li className="unidad">
      <div className="placa" aria-label={`Unidad ${a.numero}`}>{a.numero}</div>
      <div className="unidad-datos">
        <div className="dato">
          <span className="dato-tipo">Piloto</span>
          {p.piloto ? (
            <span className="dato-piloto">
              <Link className="enlace-pieza" to={`/catalogo/pilotos/${p.piloto.id}`} title={`Abrir ficha de ${p.piloto.nombre}`}>
                <b>{p.piloto.nombre}</b>
              </Link>
              {p.piloto.telefono
                ? <a className="telefono" href={telHref(p.piloto.telefono)}>Tel. {fmtTelefono(p.piloto.telefono)}</a>
                : <span className="vacio">Sin teléfono</span>}
            </span>
          ) : <span className="vacio">Sin piloto</span>}
        </div>
        <div className="dato">
          <span className="dato-tipo">Cabezal</span>
          {p.cabezal ? (
            <span className="dato-pieza">
              <Link className="enlace-pieza" to={`/catalogo/cabezales/${p.cabezal.id}`} title="Abrir ficha del cabezal">
                <span className="matricula">{p.cabezal.placa}</span>
              </Link>
            </span>
          ) : <span className="vacio">Sin cabezal</span>}
        </div>
        <div className="dato">
          <span className="dato-tipo">TC</span>
          {p.tc ? (
            <span className="dato-pieza">
              <Link className="enlace-pieza" to={`/catalogo/tcs/${p.tc.id}`} title="Abrir ficha del TC">
                <span className="matricula">{p.tc.placa}</span>
              </Link>
            </span>
          ) : <span className="vacio">Sin TC</span>}
        </div>
      </div>
      <AvisosUnidad p={p} />
      <div className="unidad-lado">
        <button className="chico" disabled={!!ocupado} onClick={onPdf}>Ver PDF</button>
        <button className="sec chico" disabled={!!editando} onClick={onCambiar}>Cambiar</button>
        <button
          className="peligro chico icono"
          disabled={!!ocupado}
          onClick={onQuitar}
          aria-label={`Quitar la unidad ${a.numero}`}
          title="Quitar unidad"
        >✕</button>
      </div>
    </li>
  );
}

export default function OperacionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: op, cargando, error } = useDocumento('operaciones', id);
  const { items: asignaciones } = useAsignaciones(id);
  const pilotos = useColeccion('pilotos').items;
  const cabezales = useColeccion('cabezales').items;
  const tcs = useColeccion('tcs').items;
  const [editando, setEditando] = useState(null); // null | { listaId, id: 'nueva' | id de la unidad }
  const [renombrando, setRenombrando] = useState(null); // { id, nombre }
  const [nuevoListado, setNuevoListado] = useState(null); // nombre en edición
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

  const listas = listasDe(op);
  const todas = asignaciones || [];
  const deLista = (listaId) => todas.filter((a) => listaDe(a) === listaId);

  // Numeración 1, 2, 3… sin huecos ni repetidos en cada listado; si no, se corrige sola (una vez por estado).
  const firma = todas.map((a) => `${listaDe(a)}:${a.id}:${a.numero}`).join(',');
  const ultimaCorreccion = useRef('');
  useEffect(() => {
    if (!asignaciones || ultimaCorreccion.current === firma) return;
    ultimaCorreccion.current = firma;
    const grupos = {};
    asignaciones.forEach((a) => { (grupos[listaDe(a)] ||= []).push(a); });
    Object.values(grupos).forEach((us) => {
      if (us.some((a, i) => a.numero !== i + 1)) {
        renumerarUnidades(us).catch((e) => console.warn('No se pudo renumerar', e));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  if (cargando) return <p className="tenue">Cargando…</p>;
  if (error) return <p className="aviso error">{error.message}</p>;
  if (!op) return <p className="aviso">La operación no existe. <Link to="/operaciones">Volver</Link></p>;

  const catalogoListo = pilotos && cabezales && tcs;
  const nombreLista = (lid) => listas.find((l) => l.id === lid)?.nombre || 'otro listado';
  // Para el PDF de toda la operación: un listado tras otro, cada uno en su orden.
  const enOrden = listas.flatMap((l) => deLista(l.id));

  async function tarea(texto, fn) {
    setOcupado(texto);
    setMsg('');
    setListo('');
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setMsg(/dynamically imported module|Importing a module script failed/i.test(e.message)
        ? 'Hay una versión nueva de la app. Recarga la página (Ctrl+F5) e intenta de nuevo.'
        : e.message);
    } finally {
      setOcupado('');
    }
  }

  const verPdf = (generar) => {
    const ventana = window.open('', '_blank');
    tarea('Generando PDF…', async () => {
      try {
        abrirBlob(await generar(), ventana);
      } catch (e) {
        ventana?.close();
        throw e;
      }
    });
  };

  const quitar = (a) => {
    if (!confirm(`¿Quitar la unidad ${a.numero} de «${nombreLista(listaDe(a))}»?`)) return;
    // Se quita y las siguientes bajan un número: 1, 2, 3… sin huecos.
    tarea('Quitando…', () => renumerarUnidades(deLista(listaDe(a)), a.id));
  };

  const copiar = (l) => tarea('Copiando…', async () => {
    const filas = deLista(l.id).map((a) => ({ numero: a.numero, ...piezas(a) }));
    await copiarTabla(filas);
    setListo(`«${l.nombre}» copiado: ${plural(filas.length, 'unidad', 'unidades')}. Pégalo en Excel, WhatsApp o un correo.`);
  });

  const crearListado = (e) => {
    e.preventDefault();
    tarea('Creando listado…', async () => {
      const lid = await agregarListado(op, nuevoListado);
      setNuevoListado(null);
      setEditando({ listaId: lid, id: 'nueva' });
    });
  };

  const guardarNombre = (e) => {
    e.preventDefault();
    tarea('Guardando…', async () => {
      await renombrarListado(op, renombrando.id, renombrando.nombre);
      setRenombrando(null);
    });
  };

  const eliminarListado = (l) => {
    const n = deLista(l.id).length;
    if (!confirm(`¿Borrar «${l.nombre}»${n ? ` y sus ${plural(n, 'unidad', 'unidades')}` : ''}? Los pilotos, cabezales y TC siguen en el catálogo.`)) return;
    tarea('Borrando listado…', () => borrarListado(op, l.id, deLista(l.id)));
  };

  const guardarOp = async (datos) => {
    await updateDoc(doc(db, 'operaciones', op.id), datos);
    setFormOp(null);
  };

  const duplicar = async (datos) => {
    const nuevoId = await duplicarOperacion(datos, op, todas, copiarUnidades);
    setFormOp(null);
    navigate(`/operaciones/${nuevoId}`);
  };

  const borrarOp = () => {
    if (todas.length) return setMsg('Quita primero todas las unidades de todos los listados para borrar la operación.');
    if (!confirm(`¿Borrar la operación ${op.barco}?`)) return;
    tarea('Borrando…', async () => {
      await deleteDoc(doc(db, 'operaciones', op.id));
      navigate('/operaciones', { replace: true });
    });
  };

  const editor = (listaId, a) => (
    <UnidadEditor
      key={a ? a.id : `nueva-${listaId}`}
      operacionId={op.id}
      listaId={listaId}
      numeroNuevo={deLista(listaId).length + 1}
      nombreLista={nombreLista}
      asignacion={a}
      asignaciones={todas}
      catalogos={{ pilotos, cabezales, tcs }}
      onListo={() => setEditando(null)}
    />
  );

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
          {todas.length > 0 && (
            <label className="casilla-check">
              <input type="checkbox" checked={copiarUnidades} onChange={(e) => setCopiarUnidades(e.target.checked)} />
              <span>
                Copiar {listas.length > 1 ? `los ${listas.length} listados` : 'el listado'} con sus{' '}
                {plural(todas.length, 'unidad', 'unidades')} (mismos pilotos, cabezales y TC)
                <span className="tenue"> — después puedes cambiar las piezas que no se repitan</span>
              </span>
            </label>
          )}
        </OperacionForm>
      ) : (
        <div className="barco-cabecera">
          <div>
            <h1>{op.barco}{op.viaje && <span className="viaje"> {fmtViaje(op.viaje)}</span>}</h1>
            <p className="tenue">
              ETA {fmtFecha(op.fecha)}, {plural(todas.length, 'unidad', 'unidades')}
              {listas.length > 1 && ` en ${listas.length} listados`}
            </p>
            {op.notas && <p className="tenue">{op.notas}</p>}
            {catalogoListo && <ResumenAvisos unidades={todas} piezas={piezas} />}
          </div>
          <div className="acciones">
            <button className="sec" onClick={() => setFormOp('editar')}>Editar datos</button>
            <button className="sec" onClick={() => { setCopiarUnidades(true); setFormOp('duplicar'); }}>Duplicar</button>
            <button
              disabled={!!ocupado || !todas.length || !catalogoListo}
              onClick={() => verPdf(() => pdfOperacion(op, enOrden, piezas))}
              title={listas.length > 1 ? 'Todos los listados en un solo PDF' : undefined}
            >
              Ver PDF{listas.length > 1 ? ' completo' : ''}
            </button>
          </div>
        </div>
      )}

      {ocupado && <p className="aviso">{ocupado}</p>}
      {msg && <p className="aviso error">{msg}</p>}
      {listo && <p className="ok-fondo">{listo}</p>}

      {listas.map((l) => {
        const unidades = deLista(l.id);
        const editandoAqui = editando?.listaId === l.id;
        return (
          <section key={l.id} className="listado">
            <div className="barra-unidades">
              {renombrando?.id === l.id ? (
                <form className="form-linea en-fila" onSubmit={guardarNombre}>
                  <input
                    aria-label="Nombre del listado"
                    value={renombrando.nombre}
                    onChange={(e) => setRenombrando({ ...renombrando, nombre: e.target.value })}
                    autoFocus
                  />
                  <button type="submit" className="chico">Guardar</button>
                  <button type="button" className="sec chico" onClick={() => setRenombrando(null)}>Cancelar</button>
                </form>
              ) : (
                <div className="listado-titulo">
                  <h2>{l.nombre}</h2>
                  <span className="tenue">{plural(unidades.length, 'unidad', 'unidades')}</span>
                  <button className="link" onClick={() => setRenombrando({ id: l.id, nombre: l.nombre })}>Renombrar</button>
                  {listas.length > 1 && (
                    <button className="link peligro-link" onClick={() => eliminarListado(l)}>Borrar listado</button>
                  )}
                </div>
              )}
              <div className="acciones">
                {unidades.length > 0 && (
                  <>
                    <button className="sec" disabled={!!ocupado || !catalogoListo} onClick={() => copiar(l)}>Copiar tabla</button>
                    {listas.length > 1 && (
                      <button className="sec" disabled={!!ocupado || !catalogoListo} onClick={() => verPdf(() => pdfOperacion(op, unidades, piezas))}>
                        Ver PDF
                      </button>
                    )}
                  </>
                )}
                {!editando && (
                  <button onClick={() => setEditando({ listaId: l.id, id: 'nueva' })} disabled={!catalogoListo}>Agregar unidad</button>
                )}
              </div>
            </div>

            {editandoAqui && editando.id === 'nueva' && editor(l.id, null)}

            {unidades.length === 0 ? (
              !(editandoAqui && editando.id === 'nueva') && (
                <div className="lista-vacia">
                  <p>Este listado todavía no tiene unidades. Cada unidad junta un piloto, un cabezal y un TC.</p>
                  <button onClick={() => setEditando({ listaId: l.id, id: 'nueva' })} disabled={!catalogoListo || !!editando}>
                    Agregar la primera unidad
                  </button>
                </div>
              )
            ) : (
              <div className="unidades">
                <div className="unidades-cab" aria-hidden="true">
                  <span>#</span><span>Piloto</span><span>Cabezal</span><span>TC</span><span />
                </div>
                <ol>
                  {unidades.map((a) => (editando?.id === a.id ? (
                    <li key={a.id} className="unidad-editando">{editor(l.id, a)}</li>
                  ) : (
                    <FilaUnidad
                      key={a.id}
                      a={a}
                      p={piezas(a)}
                      ocupado={ocupado}
                      editando={editando}
                      onPdf={() => verPdf(() => pdfUnidad(op, a, piezas(a)))}
                      onCambiar={() => setEditando({ listaId: l.id, id: a.id })}
                      onQuitar={() => quitar(a)}
                    />
                  )))}
                </ol>
              </div>
            )}
          </section>
        );
      })}

      <div className="nuevo-listado">
        {nuevoListado === null ? (
          <button className="sec" disabled={!!ocupado} onClick={() => setNuevoListado(`Listado ${listas.length + 1}`)}>
            Agregar listado
          </button>
        ) : (
          <form className="tarjeta form-linea" onSubmit={crearListado}>
            <label>
              Nombre del listado nuevo
              <input value={nuevoListado} onChange={(e) => setNuevoListado(e.target.value)} autoFocus placeholder="Ej. Permisos portuaria, Listado naviera" />
            </label>
            <button type="submit" disabled={!!ocupado}>Crear listado</button>
            <button type="button" className="sec" onClick={() => setNuevoListado(null)}>Cancelar</button>
          </form>
        )}
      </div>
    </>
  );
}
