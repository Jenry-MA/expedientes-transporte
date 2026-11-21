import { useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import TemaBoton from './TemaBoton';
import { IconoBarco, IconoCabezal, IconoPiloto, IconoTC, IconoTransporte, IconoUsuarios, Logo } from './Iconos';

export default function Layout({ user, nombre, esAdmin }) {
  const enlaces = [
    { to: '/operaciones', texto: 'Operaciones', Icono: IconoBarco },
    { to: '/catalogo/pilotos', texto: 'Pilotos', Icono: IconoPiloto },
    { to: '/catalogo/cabezales', texto: 'Cabezales', Icono: IconoCabezal },
    { to: '/catalogo/tcs', texto: 'TC', Icono: IconoTC },
    { to: '/transportes', texto: 'Transportes', Icono: IconoTransporte },
    ...(esAdmin ? [{ to: '/usuarios', texto: 'Usuarios', Icono: IconoUsuarios }] : []),
  ];
  // Precarga lo que arma los PDF unos segundos después de entrar: así ya está listo
  // y no depende de que la pestaña siga en la misma versión cuando se pida el PDF.
  useEffect(() => {
    const t = setTimeout(() => { import('pdf-lib').catch(() => {}); }, 4000);
    return () => clearTimeout(t);
  }, []);
  const salir = () => signOut(auth);
  const marca = (
    <Link to="/operaciones" className="marca">
      <Logo />
      <span>Expedientes</span>
    </Link>
  );

  return (
    <div className="marco">
      <aside className="riel">
        {marca}
        <nav aria-label="Secciones">
          {enlaces.map(({ to, texto, Icono }) => (
            <NavLink key={to} to={to}><Icono />{texto}</NavLink>
          ))}
        </nav>
        <div className="riel-pie">
          <div className="quien">{nombre || user.displayName || user.email}</div>
          <div className="correo" title={user.email}>{user.email}</div>
          <TemaBoton />
          <button className="link" onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>

      <header className="cabecera-movil">
        {marca}
        <span className="acciones">
          <TemaBoton corto />
          <button className="link" onClick={salir}>Salir</button>
        </span>
      </header>

      <main className="contenido">
        <Outlet />
      </main>

      <nav className="tabs" aria-label="Secciones">
        {enlaces.map(({ to, texto, Icono }) => (
          <NavLink key={to} to={to}><Icono />{texto}</NavLink>
        ))}
      </nav>
    </div>
  );
}
