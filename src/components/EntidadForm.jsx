import { useState } from 'react';
import { TIPOS } from '../lib/catalogo';
import { guardarEntidad } from '../lib/db';

/**
 * Formulario de piloto / cabezal / TC. Se usa en la ficha y en el registro rápido
 * desde una asignación (`compacto`).
 */
export default function EntidadForm({ tipo, id = null, inicial = {}, compacto = false, onGuardado, onCancelar }) {
  const cfg = TIPOS[tipo];
  const [valores, setValores] = useState(() =>
    Object.fromEntries(cfg.campos.map((c) => [c.name, inicial[c.name] ?? ''])),
  );
  const [estado, setEstado] = useState({ guardando: false, error: '', ok: false });

  const cambiar = (name) => (e) => {
    setValores((v) => ({ ...v, [name]: e.target.value }));
    setEstado((s) => ({ ...s, ok: false }));
  };

  async function guardar(e) {
    e.preventDefault();
    e.stopPropagation();
    setEstado({ guardando: true, error: '', ok: false });
    try {
      const nuevoId = await guardarEntidad(tipo, id, valores);
      setEstado({ guardando: false, error: '', ok: true });
      onGuardado?.(nuevoId);
    } catch (err) {
      setEstado({ guardando: false, error: err.message, ok: false });
    }
  }

  return (
    <form className={compacto ? 'form compacto' : 'form'} onSubmit={guardar}>
      {compacto && <h4>Registrar {cfg.singular.toLowerCase()} nuevo</h4>}
      <div className="campos">
        {cfg.campos
          .filter((c) => !(compacto && c.multilinea))
          .map((c) => (
            <label key={c.name} className={c.multilinea ? 'ancho' : ''}>
              {c.label}{c.requerido && ' *'}
              {c.multilinea ? (
                <textarea rows={3} value={valores[c.name]} onChange={cambiar(c.name)} />
              ) : (
                <input
                  type={c.type || 'text'}
                  value={valores[c.name]}
                  onChange={cambiar(c.name)}
                  required={c.requerido}
                  autoFocus={compacto && c === cfg.campos[0]}
                  style={c.name === 'placa' ? { textTransform: 'uppercase' } : undefined}
                />
              )}
            </label>
          ))}
      </div>
      {estado.error && <p className="aviso error">{estado.error}</p>}
      <div className="acciones">
        <button type="submit" disabled={estado.guardando}>
          {estado.guardando ? 'Guardando…' : id ? 'Guardar cambios' : compacto ? 'Registrar y usar' : 'Crear'}
        </button>
        {onCancelar && <button type="button" className="sec" onClick={onCancelar}>Cancelar</button>}
        {estado.ok && !compacto && <span className="ok">Guardado ✓</span>}
      </div>
    </form>
  );
}
