import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtFecha, fmtViaje, hoyISO, normalizar } from '../lib/catalogo';
import { crearOperacion, useColeccion } from '../lib/db';
import OperacionForm from '../components/OperacionForm';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function FechaBloque({ iso }) {
  const [, m, d] = String(iso || '').split('-');
  if (!d) return null;
  return (
    <span className="fecha-bloque" aria-hidden="true">
      <span className="mes">{MESES[Number(m) - 1]}</span>
      <span className="dia">{Number(d)}</span>
    </span>
  );
}

export default function OperacionesPage() {
  const navigate = useNavigate();
  const { items, error } = useColeccion('operaciones');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(false);

  const lista = (items || [])
    .filter((o) => !q || normalizar(`${o.barco} ${fmtViaje(o.viaje)}`).includes(normalizar(q)) || fmtFecha(o.fecha).includes(q))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const crear = async (datos) => navigate(`/operaciones/${await crearOperacion(datos)}`);
  const nueva = () => setForm(true);

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Operaciones</h1>
          <p className="tenue">Un barco por operación, con sus unidades de transporte.</p>
        </div>
        {!form && <button onClick={nueva}>Nueva operación</button>}
      </div>

      {form && (
        <OperacionForm
          titulo="Nueva operación"
          inicial={{ fecha: hoyISO() }}
          textoBoton="Crear operación"
          onGuardar={crear}
          onCancelar={() => setForm(false)}
        />
      )}

      <input className="buscador" type="search" placeholder="Buscar por barco, viaje o ETA…" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="aviso error">{error.message}</p>}
      {items === null ? (
        <p className="tenue">Cargando…</p>
      ) : lista.length === 0 ? (
        q ? (
          <p className="tenue">Ningún barco coincide con «{q}».</p>
        ) : (
          <div className="lista-vacia">
            <p>Todavía no hay operaciones. Crea una por cada barco que vayas a atender.</p>
            {!form && <button onClick={nueva}>Nueva operación</button>}
          </div>
        )
      ) : (
        <ul className="lista">
          {lista.map((o) => (
            <li key={o.id}>
              <Link to={`/operaciones/${o.id}`}>
                <FechaBloque iso={o.fecha} />
                <span className="barco-info">
                  <span className="barco-nombre">{o.barco}{o.viaje && <span className="viaje"> {fmtViaje(o.viaje)}</span>}</span>
                  <span className="tenue">ETA {fmtFecha(o.fecha)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
