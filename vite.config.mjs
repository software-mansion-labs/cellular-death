import tailwindcss from '@tailwindcss/vite';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [typegpu({}), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1600
  }
});
