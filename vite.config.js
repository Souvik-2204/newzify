import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  root: path.resolve('client'),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
      allow: [path.resolve('client'), path.resolve('node_modules')],
      deny: [
        '.env',
        '.env.*',
        '**/data/**',
        '**/prisma/edition.json',
        '**/server/**',
        '**/.git/**',
      ],
    },
  },
  build: { outDir: 'dist', sourcemap: false },
  optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom', 'lucide-react'] },
});
