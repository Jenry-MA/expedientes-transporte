import { useEffect, useState } from 'react';
import { urlDeVista } from '../lib/api';

/** <img> de un archivo privado de R2, con link firmado pedido en lote. */
export default function FotoR2({ k, alt = '', className = '', onClick }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    setError(false);
    urlDeVista(k).then((u) => vivo && setUrl(u)).catch(() => vivo && setError(true));
    return () => { vivo = false; };
  }, [k]);
  if (error) return <div className={`foto-vacia ${className}`}>Sin imagen</div>;
  if (!url) return <div className={`foto-vacia ${className}`}>…</div>;
  return <img src={url} alt={alt} className={className} loading="lazy" onClick={onClick} onError={() => setError(true)} />;
}
