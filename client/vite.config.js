import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * No dev proxy on purpose.
 *
 * A proxy would make the browser think the API is same-origin, which hides CORS
 * bugs until production — where the API really is on another domain (Render vs
 * Vercel). Calling the API by its real URL in development means dev and prod
 * take the same code path, and a CORS mistake breaks now instead of on deploy day.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
