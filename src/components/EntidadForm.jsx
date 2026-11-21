import { useId, useState } from 'react';
import { collection, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { TIPOS } from '../lib/catalogo';
import { guardarEntidad } from '../lib/db';
import { borrarArchivo } from '../lib/api';
import Documentos from './Documentos';
import TransporteInput from './TransporteInput';
import { buscarTransporte, agregarTransporte, limpiarNombre } from '../lib/transportes';

/**
 * Formulario de piloto / cabezal / TC. Se usa en la ficha y en el registro rápido
 * desde una asignación (`compacto`).
 */
export default function EntidadForm({ tipo, id = null, inicial = {}, compacto = false, onGuardado, onCancelar }) {
  const cfg = TIPOS[tipo];
  const [valores, setValores] = useState(() =>
    ({
      ...Object.fromEntries(cfg.campos.map((c) => [c.name, inicial[c.name] ?? ''])),
      venceNoAplica: !!inicial.venceNoAplica,
    }),
  );
  const [estado, setEstado] = useState({ guardando: false, error: '', ok: false });
  // Al registrar, el id se reserva desde ya para poder subir los documentos antes de guardar.
  const [idNuevo] = useState(() => (id ? null : doc(collection(db, tipo)).id));
  const [docs, setDocs] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const formId = useId();

  function cancelar() {
    // Lo que se subió para un registro que no se guardó, se borra de R2.
    docs.forEach((d) => borrarArchivo(d.key).catch(() => {}));
    onCancelar();
  }

  const cambiar = (name) => (e) => {
    setValores((v) => ({ ...v, [name]: e.target.value }));
    setEstado((s) => ({ ...s, ok: false }));
  };

  async function guardar(e) {
    e.preventDefault();
    e.stopPropagation();
    setEstado({ guardando: true, error: '', ok: false });
    try {
      // El transportista debe venir del catálogo de transportes.
      let datos = valores;
      const transporte = limpiarNombre(valores.transportista);
      if (transporte) {
        let nombre = await buscarTransporte(transporte);
        if (!nombre) {
          if (!confirm(`«${transporte}» no está en el catálogo de transportes. ¿Agregarlo?`)) {
            setEstado({ guardando: false, error: 'Elige un transportista del catálogo o agrégalo.', ok: false });
            return;
          }
          nombre = await agregarTransporte(transporte);
        }
        datos = { ...valores, transportista: nombre };
        setValores(datos);
      }
      const nuevoId = await guardarEntidad(tipo, id, datos, { idNuevo, fotos: docs });
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
          .map((c) => c.vencimiento ? (
            <div key={c.name} className="campo">
              <label htmlFor={`${formId}-${c.name}`}>{c.label}</label>
              <input
                id={`${formId}-${c.name}`}
                type="date"
                value={valores.venceNoAplica ? '' : valores[c.name]}
                disabled={valores.venceNoAplica}
                onChange={cambiar(c.name)}
              />
              <label className="check-linea">
                <input
                  type="checkbox"
                  checked={valores.venceNoAplica}
                  onChange={(e) => { setValores((x) => ({ ...x, venceNoAplica: e.target.checked })); setEstado((s) => ({ ...s, ok: false })); }}
                />
                No aplica
              </label>
            </div>
          ) : c.transporte ? (
            <div key={c.name} className="campo">
              <label htmlFor={`${formId}-${c.name}`}>{c.label}{c.requerido && ' *'}</label>
              <TransporteInput
                id={`${formId}-${c.name}`}
                value={valores[c.name]}
                required={c.requerido}
                onChange={(v) => { setValores((x) => ({ ...x, [c.name]: v })); setEstado((s) => ({ ...s, ok: false })); }}
              />
            </div>
          ) : (
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
      {idNuevo && (
        <div className="form-docs">
          {compacto && <h4>Documentos</h4>}
          <Documentos tipo={tipo} id={idNuevo} docs={docs} onCambiar={setDocs} onOcupado={setSubiendo} compacto={compacto} />
        </div>
      )}
      {estado.error && <p className="aviso error">{estado.error}</p>}
      <div className="acciones">
        <button type="submit" disabled={estado.guardando || subiendo}>
          {estado.guardando ? 'Guardando…' : subiendo ? 'Esperando documentos…' : id ? 'Guardar cambios' : compacto ? 'Registrar y usar' : `Registrar ${cfg.singular.toLowerCase()}`}
        </button>
        {onCancelar && <button type="button" className="sec" onClick={cancelar}>Cancelar</button>}
        {estado.ok && !compacto && <span className="ok">Guardado ✓</span>}
      </div>
    </form>
  );
}
