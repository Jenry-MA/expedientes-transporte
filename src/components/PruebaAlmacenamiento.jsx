import { useState } from 'react';
import { probarAlmacenamiento } from '../lib/api';

const ICONO = { corriendo: '…', ok: '✓', error: '✕' };

/** Sube, lee y borra un archivo de prueba para confirmar que Worker + R2 + CORS funcionan. */
export default function PruebaAlmacenamiento() {
  const [pasos, setPasos] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [corriendo, setCorriendo] = useState(false);

  async function probar() {
    setPasos([]);
    setResultado(null);
    setCorriendo(true);
    const ok = await probarAlmacenamiento((nombre, estado, detalle) =>
      setPasos((ps) => [...ps.filter((p) => p.nombre !== nombre), { nombre, estado, detalle }]),
    );
    setResultado(ok);
    setCorriendo(false);
  }

  return (
    <section className="tarjeta">
      <div className="encabezado">
        <div>
          <h3>Almacenamiento (R2)</h3>
          <p className="tenue">Sube, lee y borra un archivo de prueba en el bucket.</p>
        </div>
        <button className="sec" onClick={probar} disabled={corriendo}>{corriendo ? 'Probando…' : 'Probar almacenamiento'}</button>
      </div>
      {pasos.length > 0 && (
        <ul className="pasos">
          {pasos.map((p) => (
            <li key={p.nombre} className={p.estado}>
              <span className="icono">{ICONO[p.estado]}</span>
              <span>
                {p.nombre}
                {p.detalle && <><br /><span className="aviso error">{p.detalle}</span></>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {resultado === true && <p className="ok">Todo funciona: se pueden subir y leer documentos.</p>}
      {resultado === false && (
        <p className="tenue">
          Dominio de esta página: <code>{window.location.origin}</code> (debe estar en la política CORS del bucket).
        </p>
      )}
    </section>
  );
}
