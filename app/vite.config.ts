import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        // Client-only application: Mantine's React Server Component markers do not apply.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('@mantine')) return;
        defaultHandler(warning);
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.MANDAP_API_PORT ?? '4318'}`, changeOrigin: true } },
  },
  preview: {
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.MANDAP_API_PORT ?? '4318'}`, changeOrigin: true } },
  },
});
