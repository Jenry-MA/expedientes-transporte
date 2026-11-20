# Expedientes de transporte

Por cada operación de barco se arman unidades (piloto + cabezal + TC) y se saca su expediente en PDF con fotos.
El catálogo de pilotos, cabezales y TC se reutiliza y crece con cada barco.

- **Frontend:** React + Vite + React Router, Firebase Auth/Firestore, jsPDF.
- **API:** Cloudflare Pages Functions en `functions/api/` (código compartido en `server/`).
- **Archivos:** Cloudflare R2, bucket privado. El navegador solo recibe links firmados.

```
functions/api/_middleware.js   verifica token de Firebase + lista del equipo en toda /api/*
functions/api/upload-url.js    POST {key}    -> link de subida (5 min)
functions/api/view-url.js      POST {keys[]} -> links de lectura (1 h)
functions/api/delete.js        POST {key}    -> borra una foto
server/                        auth, firma de R2, utilidades HTTP
src/lib/                       api, compresión de fotos, catálogo, Firestore, PDF
src/pages, src/components      pantallas
firestore.rules                reglas para pegar en la consola de Firebase
r2-cors.json                   política CORS del bucket
```

## 1. Firebase (plan Spark)

1. Crear proyecto en <https://console.firebase.google.com>.
2. **Authentication → Sign-in method:** activar *Correo electrónico/contraseña*.
3. **Authentication → Users:** crear un usuario por persona del equipo (no hay registro público en la app).
4. **Firestore Database:** crear base en modo producción.
5. **Firestore → Reglas:** pegar el contenido de [`firestore.rules`](firestore.rules) y publicar.
6. **Firestore → Datos:** crear la colección `equipo` con un documento por usuario, cuyo **ID es el correo en minúsculas**
   (por ejemplo `ana@empresa.com`). El contenido puede ser `{ nombre: "Ana" }`. Sin ese documento el usuario no entra
   ni puede usar la API.
7. **Configuración del proyecto → Tus apps → Web:** registrar una app y copiar `apiKey`, `authDomain`, `projectId`, `appId`.
8. **Authentication → Settings → Authorized domains:** agregar `TU-PROYECTO.pages.dev`.

## 2. Cloudflare R2

1. Crear bucket (por ejemplo `expedientes`). Dejarlo **privado** (sin dominio público ni r2.dev).
2. **R2 → Manage API tokens → Create API token:** permiso *Object Read & Write*, limitado a ese bucket.
   Guardar Access Key ID, Secret Access Key y el Account ID **fuera del chat** (gestor de contraseñas).
3. **Bucket → Settings → CORS policy:** pegar [`r2-cors.json`](r2-cors.json) cambiando `TU-PROYECTO.pages.dev` por el dominio real.

## 3. Cloudflare Pages

1. Subir este repositorio a GitHub y en Cloudflare **Workers & Pages → Create → Pages → Connect to Git**.
2. Build command: `npm run build` · Output directory: `dist`.
3. **Settings → Variables and Secrets** (Production y Preview):

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `VITE_FIREBASE_API_KEY` | texto | de Firebase |
   | `VITE_FIREBASE_AUTH_DOMAIN` | texto | `tu-proyecto.firebaseapp.com` |
   | `VITE_FIREBASE_PROJECT_ID` | texto | `tu-proyecto` |
   | `VITE_FIREBASE_APP_ID` | texto | de Firebase |
   | `VITE_EMPRESA_NOMBRE` | texto | opcional, sale en el PDF |
   | `FIREBASE_PROJECT_ID` | texto | `tu-proyecto` |
   | `R2_ACCOUNT_ID` | texto | ID de la cuenta Cloudflare |
   | `R2_BUCKET` | texto | `expedientes` |
   | `R2_ACCESS_KEY_ID` | **secreto** | del token de R2 |
   | `R2_SECRET_ACCESS_KEY` | **secreto** | del token de R2 |

4. Volver a desplegar después de cambiar variables.
5. Recomendado: en Cloudflare, poner una alerta de uso (Notifications) para R2 y Workers.

## Desarrollo local

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
cp .dev.vars.example .dev.vars
```

Llenar ambos archivos (nunca se suben a GitHub) y en dos terminales:

```bash
npm run dev:api
```

```bash
npm run dev
```

Abrir <http://localhost:5173>. Vite redirige `/api` al wrangler del puerto 8788.

## Cómo funciona

- **Fotos:** se comprimen en el navegador (lado mayor 1600 px, JPEG 0.8), se suben con link firmado a
  `pilotos|cabezales|tcs/{id}/{fotoId}.jpg` y Firestore guarda `{ key, etiqueta, subidaEn }` en `fotos[]`.
- **Placas:** se guardan en mayúsculas y se comparan sin espacios ni guiones (`placaNorm`) para evitar duplicados.
- **Unidades:** número consecutivo por operación (transacción sobre `operaciones.ultimoNumero`). Si una pieza ya está
  en otra unidad del mismo barco se avisa antes de guardar.
- **Cerrar unidad:** genera el PDF y lo guarda en `expedientes/{operacionId}/unidad-{n}.pdf`; queda congelado aunque
  después cambien las fotos del catálogo. *Reabrir* permite cambiar piezas y volver a cerrar.
- **PDF de operación:** resumen + una página (o más) por unidad, en `expedientes/{operacionId}/operacion.pdf`.
- **Borrado:** no se puede borrar un piloto/cabezal/TC que aparezca en alguna operación.

## Respaldo

El export administrado de Firestore (`gcloud firestore export`) exige plan Blaze. En Spark, el respaldo semanal
tendría que ser un pequeño script que lea las cinco colecciones y guarde un JSON (pendiente, no incluido todavía).
