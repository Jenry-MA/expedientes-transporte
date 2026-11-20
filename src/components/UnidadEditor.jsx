import { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CAMPO_ASIG, TIPOS } from '../lib/catalogo';
import { crearAsignacion } from '../lib/db';
import Selector from './Selector';

const ORDEN = ['pilotos', 'cabezales', 'tcs'];

/** Arma o cambia una unidad: piloto → cabezal → TC. */
export default function UnidadEditor({ operacionId, asignacion, asignaciones, catalogos, onListo }) {
  const [sel, setSel] = useState(() => ({
    pilotoId: asignacion?.pilotoId || null,
    cabezalId: asignacion?.cabezalId || null,
    tcId: asignacion?.tcId || null,
  }));
  const primeraVacia = (s) => ORDEN.find((t) => !s[CAMPO_ASIG[t]]) || null;
  const [abierto, setAbierto] = useState(() => primeraVacia(sel));
  const [estado, setEstado] = useState({ guardando: false, error: '' });

  const otras = asignaciones.filter((a) => a.id !== asignacion?.id);
  const usadoEn = (tipo) => (id) => otras.filter((a) => a[CAMPO_ASIG[tipo]] === id).map((a) => a.numero);

  function elegir(tipo, id) {
    const nuevo = { ...sel, [CAMPO_ASIG[tipo]]: id };
    setSel(nuevo);
    // Sigue el flujo hacia la siguiente pieza que falte.
    const idx = ORDEN.indexOf(tipo);
    setAbierto(ORDEN.slice(idx + 1).find((t) => !nuevo[CAMPO_ASIG[t]]) || null);
  }

  // Al registrar un cabezal o TC nuevo, se sugiere el transportista del piloto o cabezal.
  const piloto = catalogos.pilotos?.find((p) => p.id === sel.pilotoId);
  const cabezal = catalogos.cabezales?.find((c) => c.id === sel.cabezalId);
  const sugerido = { transportista: cabezal?.transportista || piloto?.transportista || '' };

  async function guardar() {
    if (!sel.pilotoId && !sel.cabezalId && !sel.tcId) {
      setEstado({ guardando: false, error: 'Elige al menos una pieza' });
      return;
    }
    const avisos = ORDEN.flatMap((t) => {
      const id = sel[CAMPO_ASIG[t]];
      const usos = id ? usadoEn(t)(id) : [];
      return usos.length ? [`${TIPOS[t].singular} ya está en la unidad ${usos.join(', ')}`] : [];
    });
    if (avisos.length && !confirm(`${avisos.join('\n')}\n\n¿Guardar de todas formas?`)) return;

    setEstado({ guardando: true, error: '' });
    try {
      if (asignacion) {
        await updateDoc(doc(db, 'asignaciones', asignacion.id), { ...sel, actualizadoEn: serverTimestamp() });
      } else {
        await crearAsignacion(operacionId, sel);
      }
      onListo();
    } catch (e) {
      setEstado({ guardando: false, error: e.message });
    }
  }

  return (
    <section className="tarjeta editor">
      <h3>{asignacion ? `Unidad ${asignacion.numero}` : 'Nueva unidad'}</h3>
      {ORDEN.map((t) => (
        <Selector
          key={t}
          tipo={t}
          items={catalogos[t]}
          valorId={sel[CAMPO_ASIG[t]]}
          onChange={(id) => elegir(t, id)}
          usadoEn={usadoEn(t)}
          abierto={abierto === t}
          onAbrir={() => setAbierto(t)}
          onCerrar={() => setAbierto(null)}
          sugerido={t === 'pilotos' ? {} : sugerido}
        />
      ))}
      {estado.error && <p className="aviso error">{estado.error}</p>}
      <div className="acciones">
        <button onClick={guardar} disabled={estado.guardando}>{estado.guardando ? 'Guardando…' : 'Guardar unidad'}</button>
        <button className="sec" onClick={onListo}>Cancelar</button>
      </div>
    </section>
  );
}
