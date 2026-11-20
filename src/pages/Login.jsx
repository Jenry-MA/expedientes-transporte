import { useState } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

const MENSAJES = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos',
  'auth/invalid-email': 'Correo inválido',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión a internet',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setEnviando(true);
    setMsg('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), clave);
    } catch (err) {
      setMsg(MENSAJES[err.code] || err.message);
      setEnviando(false);
    }
  }

  async function recuperar() {
    if (!email.trim()) return setMsg('Escribe tu correo primero');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg('Te enviamos un correo para cambiar la contraseña.');
    } catch (err) {
      setMsg(MENSAJES[err.code] || err.message);
    }
  }

  return (
    <div className="centro">
      <form className="tarjeta login" onSubmit={entrar}>
        <h1>Expedientes de transporte</h1>
        <label>
          Correo
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
        </label>
        {msg && <p className="aviso">{msg}</p>}
        <button type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="link" onClick={recuperar}>Olvidé mi contraseña</button>
      </form>
    </div>
  );
}
