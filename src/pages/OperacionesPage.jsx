import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fmtFecha, hoyISO, normalizar } from '../lib/catalogo';
import { crearOperacion, useColeccion } from '../lib/db';

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

  const campo = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  return (
    <>
      <div className="encabezado">
        <h2>Operaciones de barco</h2>
        {!form && <button onClick={() => setForm({ barco: '', fecha: hoyISO(), notas: '' })}>+ Nueva operación</button>}
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
            <button type="submit">Crear</button>
            <button type="button" className="sec" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <input className="buscador" type="search" placeholder="Buscar por barco o fecha…" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <p className="aviso error">{error.message}</p>}
      {items === null ? (
        <p className="tenue">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="tenue">{q ? 'Sin resultados.' : 'Todavía no hay operaciones.'}</p>
      ) : (
        <ul className="lista">
          {lista.map((o) => (
            <li key={o.id}>
              <Link to={`/operaciones/${o.id}`}>
                <b>{o.barco}</b>
                <span className="tenue">{fmtFecha(o.fecha)}</span>
                <span className="insignia">{o.ultimoNumero || 0} unidades</span>
                {o.pdfKey && <span className="insignia ok">PDF</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
