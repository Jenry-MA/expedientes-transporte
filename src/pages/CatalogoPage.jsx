import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { TIPOS, filtrar } from '../lib/catalogo';
import { useColeccion } from '../lib/db';
import { etiquetasDe } from '../components/Documentos';

const DESCRIPCION = {
  pilotos: 'Datos de cada piloto y su licencia, frente y reverso.',
  cabezales: 'Cada cabezal con su placa, transportista y tarjeta de circulación.',
  tcs: 'Cada TC con su placa, transportista y tarjeta de circulación.',
};

export default function CatalogoPage() {
  const { tipo } = useParams();
  const cfg = TIPOS[tipo];
  const { items, error } = useColeccion(cfg ? tipo : 'pilotos');
  const [q, setQ] = useState('');
  if (!cfg) return <Navigate to="/catalogo/pilotos" replace />;

  const lista = filtrar(items, q, tipo);
  const pista = tipo === 'pilotos' ? 'nombre, licencia o transportista' : 'placa o transportista';

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>{cfg.titulo}</h1>
          <p className="tenue">{DESCRIPCION[tipo]}</p>
        </div>
        <div className="acciones">
          <Link className="boton sec" to="/importar">Importar desde Excel</Link>
          <Link className="boton" to={`/catalogo/${tipo}/nuevo`}>Registrar {cfg.singular.toLowerCase()}</Link>
        </div>
      </div>
      <input
        className="buscador"
        type="search"
        placeholder={`Buscar por ${pista}…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {error && <p className="aviso error">{error.message}</p>}
      {items === null ? (
        <p className="tenue">Cargando…</p>
      ) : lista.length === 0 ? (
        q ? (
          <p className="tenue">Nada coincide con «{q}». Revisa la búsqueda o registra uno nuevo.</p>
        ) : (
          <div className="lista-vacia">
            <p>Todavía no hay {cfg.titulo === 'TC' ? 'TC' : cfg.titulo.toLowerCase()} registrados. Lo que registres aquí se reutiliza en cada barco.</p>
            <Link className="boton" to={`/catalogo/${tipo}/nuevo`}>Registrar {cfg.singular.toLowerCase()}</Link>
          </div>
        )
      ) : (
        <ul className="lista">
          {lista.map((it) => (
            <li key={it.id}>
              <Link to={`/catalogo/${tipo}/${it.id}`}>
                {tipo === 'pilotos' ? <b>{cfg.resumen(it)}</b> : <span className="matricula">{cfg.resumen(it)}</span>}
                <span className="tenue">{cfg.detalle(it)}</span>
                {(() => {
                  const docs = it.fotos || [];
                  const faltan = etiquetasDe(tipo).filter((e) => !docs.some((d) => d.etiqueta === e)).length;
                  return faltan
                    ? <span className="insignia falta">Faltan {faltan} doc.</span>
                    : <span className="insignia ok">{docs.length} doc. ✓</span>;
                })()}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items?.length > 0 && <p className="tenue pie">Mostrando {lista.length} de {items.length}</p>}
    </>
  );
}
