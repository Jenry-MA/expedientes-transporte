import { Logo } from './Iconos';

/** Pantalla partida para entrar, registrarse o esperar aprobación. */
export default function AccesoMarco({ children }) {
  return (
    <div className="acceso">
      <section className="acceso-marca">
        <div className="marca"><Logo size={36} /><span>Expedientes</span></div>
        <div>
          <h1>Cada barco, con su expediente listo.</h1>
          <p>Arma las unidades de piloto, cabezal y TC con sus documentos, y saca el PDF para imprimir.</p>
        </div>
      </section>
      <div className="acceso-panel">{children}</div>
    </div>
  );
}
