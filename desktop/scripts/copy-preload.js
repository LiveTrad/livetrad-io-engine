const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../src/preload.js');
const destPath = path.join(__dirname, '../dist/preload.js');

// Créer le répertoire de destination s'il n'existe pas
const distDir = path.dirname(destPath);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copier le fichier
fs.copyFileSync(srcPath, destPath);
console.log('Preload file copied to dist directory');
