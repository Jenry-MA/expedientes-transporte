import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api se redirige a `npm run dev:api` (wrangler en el puerto 8788).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8788' } },
});
