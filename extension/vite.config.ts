import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { writeFileSync, copyFileSync } from 'fs';

const copyAssets = () => {
  return {
    name: 'copy-assets',
    closeBundle: () => {
      // Copier le manifest
      copyFileSync('manifest.json', 'dist/manifest.json');
      
      // Copier les fichiers CSS
      copyFileSync('src/components/FloatingSwitch.css', 'dist/assets/FloatingSwitch.css');
      copyFileSync('src/assets/content.css', 'dist/assets/content.css');
      copyFileSync('src/popup/popup.css', 'dist/assets/popup.css');
    }
  };
};

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'classic'
    }), 
    copyAssets()
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        content: resolve(__dirname, 'src/content.ts'),
        'content-module': resolve(__dirname, 'src/content-module.ts'),
        'background': resolve(__dirname, 'src/background.ts'),
        'audioProcessor': resolve(__dirname, 'src/core/audioProcessor.ts')
      },
      output: {
        entryFileNames: 'generated/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        format: 'es',
        sourcemap: true
      }
    },
    minify: false,
    sourcemap: true,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom')
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom']
  }
});
