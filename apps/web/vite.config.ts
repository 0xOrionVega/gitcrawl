import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: demo ? './' : '/',
    define: {
      __DEMO__: JSON.stringify(demo),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:8787',
        '/og': 'http://localhost:8787',
        '/badge': 'http://localhost:8787',
        '/auth': 'http://localhost:8787',
      },
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 2500,
      sourcemap: false,
    },
  };
});
