import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  // `scripts/host-env.sh` exports NODE_ENV=development for the server tooling.
  // Without this, running a build in that same shell would ship React's
  // development bundle, which is roughly twice the size and much slower.
  if (command === 'build') process.env.NODE_ENV = 'production';

  return {
    plugins: [react()],
    build: { outDir: 'dist', sourcemap: true },
    server: {
      host: '127.0.0.1',
      port: 58082,
      strictPort: true,
      // Local dev server only; the containerised dashboard is served by nginx.
      proxy: { '/api': { target: 'http://127.0.0.1:58080', changeOrigin: false } },
    },
  };
});
