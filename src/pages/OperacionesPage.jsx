import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtFecha, hoyISO, normalizar } from '../lib/catalogo';
import { crearOperacion, useColeccion } from '../lib/db';

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
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');

  const lista = (items || [])
    .filter((o) => !q || normalizar(o.barco).includes(normalizar(q)) || fmtFecha(o.fecha).includes(q))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  async function crear(e) {
    e.preventDefault();
    setMsg('');
    try {
      const id = await crearOperacion(form);
      navigate(`/operaciones/${id}`);
    } catch (err) {
      setMsg(err.message);
    }
  }

  const nueva = () => setForm({ barco: '', fecha: hoyISO(), notas: '' });
  const campo = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

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
        <form className="tarjeta form" onSubmit={crear}>
          <h3>Nueva operación</h3>
          <div className="campos">
            <label>Barco *<input {...campo('barco')} required autoFocus /></label>
            <label>Fecha *<input type="date" {...campo('fecha')} required /></label>
            <label className="ancho">Notas<textarea rows={2} {...campo('notas')} /></label>
          </div>
          {msg && <p className="aviso error">{msg}</p>}
          <div className="acciones">
            <button type="submit">Crear operación</button>
            <button type="button" className="sec" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <input className="buscador" type="search" placeholder="Buscar por barco o fecha…" value={q} onChange={(e) => setQ(e.target.value)} />
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
                  <span className="barco-nombre">{o.barco}</span>
                  <span className="tenue">{fmtFecha(o.fecha)}</span>
                </span>
                {o.pdfKey && <span className="insignia ok">PDF guardado</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
