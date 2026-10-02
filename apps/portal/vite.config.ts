/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base and hash routing: the built app can be served from any path and wrapped as a
// phone app without a rewrite rule.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Boasis Portal',
        short_name: 'Boasis',
        description: 'Company and compliance portal for UAE companies.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F6F8FB',
        theme_color: '#16243A',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  server: { port: 5190, strictPort: true },
  test: {
    name: 'portal',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
