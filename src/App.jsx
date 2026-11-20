import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Layout from './components/Layout';
import Login from './pages/Login';
import CatalogoPage from './pages/CatalogoPage';
import FichaPage from './pages/FichaPage';
import OperacionesPage from './pages/OperacionesPage';
import OperacionPage from './pages/OperacionPage';

function useSesion() {
  const [sesion, setSesion] = useState({ estado: 'cargando' });
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) return setSesion({ estado: 'fuera' });
        try {
          const snap = await getDoc(doc(db, 'equipo', (user.email || '').toLowerCase()));
          setSesion({ estado: snap.exists() ? 'dentro' : 'sin-acceso', user });
        } catch {
          setSesion({ estado: 'sin-acceso', user });
        }
      }),
    [],
  );
  return sesion;
}

export default function App() {
  const sesion = useSesion();

  if (sesion.estado === 'cargando') return <div className="centro">Cargando…</div>;
  if (sesion.estado === 'fuera') return <Login />;
  if (sesion.estado === 'sin-acceso') {
    return (
      <div className="centro">
        <div className="tarjeta login">
          <h1>Sin acceso</h1>
          <p>
            El usuario <b>{sesion.user.email}</b> no está en la lista del equipo. Pide a un administrador que te agregue.
          </p>
          <button onClick={() => signOut(auth)}>Salir</button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={sesion.user} />}>
          <Route index element={<Navigate to="/operaciones" replace />} />
          <Route path="operaciones" element={<OperacionesPage />} />
          <Route path="operaciones/:id" element={<OperacionPage />} />
          <Route path="catalogo/:tipo" element={<CatalogoPage />} />
          <Route path="catalogo/:tipo/:id" element={<FichaPage />} />
          <Route path="*" element={<Navigate to="/operaciones" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
