import { useState } from 'react';
import {
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase';
import { recordarNombre } from '../lib/acceso';
import AccesoMarco from '../components/AccesoMarco';

const MENSAJES = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos',
  'auth/invalid-email': 'Correo inválido',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Usa «Entrar».',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión a internet',
  'auth/operation-not-allowed': 'El acceso con correo y contraseña no está activado en Firebase',
};
const mensaje = (err) => MENSAJES[err.code] || err.message;

export default function Login() {
  const [modo, setModo] = useState('entrar'); // 'entrar' | 'registro'
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const registro = modo === 'registro';

  async function enviar(e) {
    e.preventDefault();
    setMsg('');
    if (registro) {
      if (!nombre.trim()) return setMsg('Escribe tu nombre');
      if (clave !== clave2) return setMsg('Las contraseñas no coinciden');
    }
    setEnviando(true);
    try {
      if (registro) {
        recordarNombre(nombre);
        const { user } = await createUserWithEmailAndPassword(auth, email.trim(), clave);
        await updateProfile(user, { displayName: nombre.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), clave);
      }
    } catch (err) {
      setMsg(mensaje(err));
      setEnviando(false);
    }
  }

  async function recuperar() {
    if (!email.trim()) return setMsg('Escribe tu correo primero');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg('Te enviamos un correo para cambiar la contraseña.');
    } catch (err) {
      setMsg(mensaje(err));
    }
  }

  function cambiarModo() {
    setModo(registro ? 'entrar' : 'registro');
    setMsg('');
  }

  return (
    <AccesoMarco>
      <form className="acceso-form" onSubmit={enviar}>
        <div>
          <h2>{registro ? 'Crear cuenta' : 'Entrar'}</h2>
          <p className="tenue">
            {registro ? 'Un administrador debe aprobarla antes de que puedas usarla.' : 'Con tu correo y contraseña del equipo.'}
          </p>
        </div>
        {registro && (
          <label>
            Nombre
            <input autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
        )}
        <label>
          Correo
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete={registro ? 'new-password' : 'current-password'}
            minLength={registro ? 6 : undefined}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
          />
        </label>
        {registro && (
          <label>
            Repetir contraseña
            <input type="password" autoComplete="new-password" value={clave2} onChange={(e) => setClave2(e.target.value)} required />
          </label>
        )}
        {msg && <p className="aviso">{msg}</p>}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Un momento…' : registro ? 'Crear cuenta' : 'Entrar'}
        </button>
        <div className="acceso-alterno">
          <button type="button" className="link" onClick={cambiarModo}>
            {registro ? 'Ya tengo cuenta' : 'Crear cuenta'}
          </button>
          {!registro && <button type="button" className="link" onClick={recuperar}>Olvidé mi contraseña</button>}
        </div>
      </form>
    </AccesoMarco>
  );
}
