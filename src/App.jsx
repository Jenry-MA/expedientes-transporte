import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';
import { useSesion } from './lib/acceso';
import Layout from './components/Layout';
import Login from './pages/Login';
import CatalogoPage from './pages/CatalogoPage';
import FichaPage from './pages/FichaPage';
import OperacionesPage from './pages/OperacionesPage';
import OperacionPage from './pages/OperacionPage';
import UsuariosPage from './pages/UsuariosPage';

function Aviso({ titulo, children, user }) {
  return (
    <div className="centro">
      <div className="tarjeta login">
        <h1>{titulo}</h1>
        {children}
        {user && <p className="tenue">Cuenta: {user.email}</p>}
        <button onClick={() => signOut(auth)}>Salir</button>
      </div>
    </div>
  );
}

export default function App() {
  const sesion = useSesion();

  switch (sesion.estado) {
    case 'cargando':
      return <div className="centro">Cargando…</div>;
    case 'fuera':
      return <Login />;
    case 'pendiente':
      return (
        <Aviso titulo="Esperando aprobación" user={sesion.user}>
          <p>Tu solicitud de acceso fue enviada. Un administrador debe aprobarla.</p>
          <p className="tenue">Esta página se actualiza sola cuando te aprueben.</p>
        </Aviso>
      );
    case 'rechazado':
      return (
        <Aviso titulo="Acceso rechazado" user={sesion.user}>
          <p>Un administrador rechazó tu solicitud. Si es un error, pídele que la revise.</p>
        </Aviso>
      );
    case 'error':
      return (
        <Aviso titulo="No se pudo verificar tu acceso" user={sesion.user}>
          <p className="aviso error">{sesion.mensaje}</p>
          <p className="tenue">Revisa que las reglas de Firestore estén publicadas e intenta de nuevo.</p>
        </Aviso>
      );
    default:
      break;
  }

  const esAdmin = sesion.rol === 'admin';
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={sesion.user} esAdmin={esAdmin} />}>
          <Route index element={<Navigate to="/operaciones" replace />} />
          <Route path="operaciones" element={<OperacionesPage />} />
          <Route path="operaciones/:id" element={<OperacionPage />} />
          <Route path="catalogo/:tipo" element={<CatalogoPage />} />
          <Route path="catalogo/:tipo/:id" element={<FichaPage />} />
          {esAdmin && <Route path="usuarios" element={<UsuariosPage yo={sesion.user.email.toLowerCase()} />} />}
          <Route path="*" element={<Navigate to="/operaciones" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
