import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useColeccion } from '../lib/db';
import { analizar, aplicar, leerExcel } from '../lib/importar';

const ETIQUETA = {
  nuevo: ['ok', 'Nuevo'],
  actualizar: ['falta', 'Se actualiza'],
  igual: ['', 'Ya existe'],
  repetido: ['', 'Repetido'],
};

function Estado({ e }) {
  if (!e) return <span className="tenue">—</span>;
  const [clase, texto] = ETIQUETA[e.accion];
  return (
    <span className="celda-estado" title={e.detalle || ''}>
      <span>{e.texto}</span>
      <span className={`insignia ${clase}`}>{texto}</span>
      {e.detalle && <span className="tenue chico">{e.detalle}</span>}
    </span>
  );
}

const linea = (r, uno, varios) => {
  const partes = [];
  if (r.nuevos) partes.push(`${r.nuevos} ${r.nuevos === 1 ? uno : varios} nuevo${r.nuevos === 1 ? '' : 's'}`);
  if (r.actualizados) partes.push(`${r.actualizados} se actualiza${r.actualizados === 1 ? '' : 'n'}`);
  return partes.join(', ');
};

export default function ImportarPage() {
  const pilotos = useColeccion('pilotos').items;
  const cabezales = useColeccion('cabezales').items;
  const tcs = useColeccion('tcs').items;
  const transportes = useColeccion('transportes').items;
  const listo = pilotos && cabezales && tcs && transportes;

  const [archivo, setArchivo] = useState(null); // { nombre, hoja, filas }
  const [error, setError] = useState('');
  const [encima, setEncima] = useState(false);
  const [estado, setEstado] = useState({ guardando: false, avance: '', hecho: null });
  const input = useRef(null);

  // El análisis se recalcula si cambia el catálogo (por ejemplo, justo después de importar).
  const plan = useMemo(
    () => (archivo && listo ? analizar(archivo.filas, { pilotos, cabezales, tcs, transportes }) : null),
    [archivo, listo, pilotos, cabezales, tcs, transportes],
  );

  async function cargar(file) {
    if (!file) return;
    setError('');
    setEstado({ guardando: false, avance: '', hecho: null });
    try {
      const { hoja, filas } = await leerExcel(file);
      if (!filas.length) throw new Error('El archivo no tiene filas con datos debajo de los títulos.');
      setArchivo({ nombre: file.name, hoja, filas });
    } catch (e) {
      setArchivo(null);
      setError(e.message);
    }
  }

  async function importar() {
    setEstado({ guardando: true, avance: 'Guardando…', hecho: null });
    try {
      const n = await aplicar(plan, (h, t) => setEstado((s) => ({ ...s, avance: `Guardando ${h} de ${t}…` })));
      setEstado({ guardando: false, avance: '', hecho: { n, resumen: plan.resumen } });
    } catch (e) {
      setEstado({ guardando: false, avance: '', hecho: null });
      setError(e.code === 'permission-denied' ? 'Sin permiso para guardar: revisa que las reglas de Firestore estén publicadas.' : e.message);
    }
  }

  const soltar = (e) => {
    e.preventDefault();
    setEncima(false);
    cargar(e.dataTransfer.files?.[0]);
  };

  return (
    <>
      <p className="migas"><Link to="/catalogo/pilotos">← Pilotos</Link></p>
      <div className="encabezado">
        <div>
          <h1>Importar desde Excel</h1>
          <p className="tenue">
            Registra muchos pilotos, cabezales y TC de una vez. Solo los datos: las fotos y PDF se suben después en la ficha de cada uno.
          </p>
        </div>
        <a className="boton sec" href="/plantilla-registros.xlsx" download="plantilla-registros.xlsx">Descargar plantilla</a>
      </div>

      <div
        className={`soltar-excel ${encima ? 'encima' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
      >
        <p>
          <b>Arrastra aquí el Excel</b> o elígelo. Sirve la plantilla o tu propia tabla con columnas como
          «Piloto», «Licencia», «Teléfono», «Transporte», «Placa cabezal» y «Placa TC».
        </p>
        <button type="button" onClick={() => input.current?.click()}>Elegir archivo .xlsx</button>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => { cargar(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      {error && <p className="aviso error">{error}</p>}
      {archivo && !listo && <p className="tenue">Cargando el catálogo para comparar…</p>}

      {estado.hecho && (
        <div className="ok-fondo">
          Listo: {estado.hecho.n} cambios guardados. Ahora puedes subir los documentos desde{' '}
          <Link to="/catalogo/pilotos">Pilotos</Link>, <Link to="/catalogo/cabezales">Cabezales</Link> y <Link to="/catalogo/tcs">TC</Link>.
        </div>
      )}

      {plan && (
        <section className="tarjeta">
          <div className="encabezado">
            <div>
              <h3>Revisión antes de guardar</h3>
              <p className="tenue">{archivo.nombre}, hoja «{archivo.hoja}», {archivo.filas.length} filas.</p>
            </div>
            <button disabled={!plan.total || estado.guardando} onClick={importar}>
              {estado.guardando ? estado.avance : plan.total ? `Importar ${plan.total} cambios` : 'Nada que importar'}
            </button>
          </div>

          <ul className="resumen-import">
            <li><b>Pilotos:</b> {linea(plan.resumen.pilotos, 'piloto', 'pilotos') || 'sin cambios'}</li>
            <li><b>Cabezales:</b> {linea(plan.resumen.cabezales, 'cabezal', 'cabezales') || 'sin cambios'}</li>
            <li><b>TC:</b> {linea(plan.resumen.tcs, 'TC', 'TC') || 'sin cambios'}</li>
            {plan.resumen.transportes > 0 && (
              <li><b>Transportes:</b> {plan.resumen.transportes} nuevo{plan.resumen.transportes === 1 ? '' : 's'} en el catálogo</li>
            )}
            {plan.errores > 0 && <li className="aviso"><b>{plan.errores} fila{plan.errores === 1 ? '' : 's'} con problemas</b> (se omiten esos datos)</li>}
          </ul>

          <div className="tabla-wrap">
            <table className="tabla-import">
              <thead>
                <tr><th>Fila</th><th>Piloto</th><th>Transporte</th><th>Cabezal</th><th>TC</th></tr>
              </thead>
              <tbody>
                {plan.filas.map((r) => (
                  <tr key={r.numero} className={r.errores.length ? 'con-error' : ''}>
                    <td>{r.numero}</td>
                    <td>
                      <Estado e={r.piloto} />
                      {r.errores.map((e) => <span key={e} className="aviso chico">{e}</span>)}
                    </td>
                    <td>{r.transportista || <span className="tenue">—</span>}</td>
                    <td><Estado e={r.cabezal} /></td>
                    <td><Estado e={r.tc} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
