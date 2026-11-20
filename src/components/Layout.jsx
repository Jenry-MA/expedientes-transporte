import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function Layout({ user, esAdmin }) {
  return (
    <>
      <header className="barra">
        <div className="marca">Expedientes</div>
        <nav>
          <NavLink to="/operaciones">Operaciones</NavLink>
          <NavLink to="/catalogo/pilotos">Pilotos</NavLink>
          <NavLink to="/catalogo/cabezales">Cabezales</NavLink>
          <NavLink to="/catalogo/tcs">TC</NavLink>
          {esAdmin && <NavLink to="/usuarios">Usuarios</NavLink>}
        </nav>
        <div className="usuario">
          <span title={user.email}>{user.email}</span>
          <button className="sec chico" onClick={() => signOut(auth)}>Salir</button>
        </div>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
    </>
  );
}
