import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { writeFileSync, copyFileSync } from 'fs';

const copyManifest = () => {
  return {
    name: 'copy-manifest',
    closeBundle: () => {
      copyFileSync('manifest.json', 'dist/manifest.json');
    }
  };
};

export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        content: resolve(__dirname, 'src/content.ts')
      },
      output: {
        entryFileNames: 'generated/[name].js',
        assetFileNames: 'generated/[name].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
