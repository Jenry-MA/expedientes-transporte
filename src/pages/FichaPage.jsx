import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { TIPOS } from '../lib/catalogo';
import { estaEnUso, useDocumento } from '../lib/db';
import { borrarArchivo } from '../lib/api';
import EntidadForm from '../components/EntidadForm';
import Documentos from '../components/Documentos';

export default function FichaPage() {
  const { tipo, id } = useParams();
  const navigate = useNavigate();
  const recienCreado = useLocation().state?.recienCreado;
  const cfg = TIPOS[tipo];
  const nuevo = id === 'nuevo';
  const { data, cargando, error } = useDocumento(tipo, cfg && !nuevo ? id : null);
  const [msg, setMsg] = useState('');
  if (!cfg) return <Navigate to="/catalogo/pilotos" replace />;

  async function eliminar() {
    setMsg('');
    try {
      if (await estaEnUso(tipo, id)) {
        setMsg('No se puede borrar: aparece en al menos una operación.');
        return;
      }
      if (!confirm(`¿Borrar ${cfg.singular.toLowerCase()} «${cfg.resumen(data)}» y sus documentos? No se puede deshacer.`)) return;
      await deleteDoc(doc(db, tipo, id));
      await Promise.allSettled((data.fotos || []).map((f) => borrarArchivo(f.key)));
      navigate(`/catalogo/${tipo}`, { replace: true });
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <>
      <p className="migas"><Link to={`/catalogo/${tipo}`}>← {cfg.titulo}</Link></p>
      {cargando ? (
        <p className="tenue">Cargando…</p>
      ) : error ? (
        <p className="aviso error">{error.message}</p>
      ) : !nuevo && !data ? (
        <p className="aviso">Este registro no existe o fue borrado.</p>
      ) : (
        <>
          <h2>{nuevo ? `Nuevo ${cfg.singular.toLowerCase()}` : cfg.resumen(data)}</h2>
          <section className="tarjeta">
            <EntidadForm
              key={nuevo ? 'nuevo' : id}
              tipo={tipo}
              id={nuevo ? null : id}
              inicial={data || {}}
              onGuardado={(nid) => nuevo && navigate(`/catalogo/${tipo}/${nid}`, { replace: true, state: { recienCreado: true } })}
            />
          </section>
          {nuevo ? (
            <p className="tenue">Guarda primero; luego se piden los documentos (licencia, DPI, tarjeta…).</p>
          ) : (
            <>
              {recienCreado && <p className="aviso ok-fondo">Guardado. Ahora sube sus documentos: imagen o PDF.</p>}
              <Documentos tipo={tipo} id={id} docs={data.fotos || []} />
              {msg && <p className="aviso error">{msg}</p>}
              <button className="peligro" onClick={eliminar}>Borrar {cfg.singular.toLowerCase()}</button>
            </>
          )}
        </>
      )}
    </>
  );
}
