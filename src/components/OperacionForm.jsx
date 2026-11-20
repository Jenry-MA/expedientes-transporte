import { useState } from 'react';
import { limpiarViaje } from '../lib/catalogo';

/** Datos de una operación: barco, viaje, ETA y notas. Se usa para crear, editar y duplicar. */
export default function OperacionForm({ titulo, inicial, textoBoton, onGuardar, onCancelar, extra, children }) {
  const [form, setForm] = useState(() => ({ barco: '', viaje: '', fecha: '', notas: '', ...inicial }));
  const [estado, setEstado] = useState({ guardando: false, error: '' });
  const campo = (name) => ({ value: form[name] ?? '', onChange: (e) => setForm({ ...form, [name]: e.target.value }) });

  async function enviar(e) {
    e.preventDefault();
    setEstado({ guardando: true, error: '' });
    try {
      if (!form.barco.trim()) throw new Error('Falta el nombre del barco');
      if (!form.fecha) throw new Error('Falta la ETA');
      await onGuardar({
        barco: form.barco.trim(), viaje: limpiarViaje(form.viaje), fecha: form.fecha, notas: form.notas.trim(),
      });
    } catch (err) {
      setEstado({ guardando: false, error: err.message });
    }
  }

  return (
    <form className="tarjeta form" onSubmit={enviar}>
      {titulo && <h3>{titulo}</h3>}
      <div className="campos">
        <label>Barco *<input {...campo('barco')} required autoFocus /></label>
        <label>
          Viaje
          <span className="con-prefijo">
            <span aria-hidden="true">V.</span>
            <input {...campo('viaje')} placeholder="045" aria-label="Viaje (V.)" />
          </span>
        </label>
        <label>ETA *<input type="date" {...campo('fecha')} required /></label>
        <label className="ancho">Notas<textarea rows={2} {...campo('notas')} /></label>
      </div>
      {children}
      {estado.error && <p className="aviso error">{estado.error}</p>}
      <div className="acciones">
        <button type="submit" disabled={estado.guardando}>{estado.guardando ? 'Guardando…' : textoBoton}</button>
        <button type="button" className="sec" onClick={onCancelar}>Cancelar</button>
        {extra}
      </div>
    </form>
  );
}
