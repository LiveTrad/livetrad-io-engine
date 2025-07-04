# Tab Audio Capture Extension [Current step : Audio playback working]

Extension Chrome moderne pour capturer l'audio d'onglets spécifiques avec un contrôle précis.

## Fonctionnalités

- Interface sidebar moderne et réactive
- Capture audio spécifique par onglet
- Liste des onglets avec audio en temps réel
- Enregistrement et téléchargement des captures audio
- Développé en TypeScript pour une meilleure maintenabilité
- Build system avec Webpack

## Installation pour le développement

1. Cloner le repository
2. Installer les dépendances :
   ```bash
   npm install
   ```
3. Compiler l'extension :
   ```bash
   npm run build
   ```
4. Charger l'extension dans Chrome :
   - Ouvrir `chrome://extensions/`
   - Activer le "Mode développeur"
   - Cliquer sur "Charger l'extension non empaquetée"
   - Sélectionner le dossier `dist` créé par la compilation

## Développement

- `npm run watch` : Compilation en mode watch
- `npm run type-check` : Vérification des types TypeScript
- `npm run lint` : Linting du code

## Structure du projet

```
src/
  ├── background/     # Service worker
  ├── sidebar/        # Interface utilisateur
  ├── types/          # Types TypeScript
  ├── assets/         # Images et ressources
  └── manifest.json   # Configuration de l'extension
```

## Utilisation

1. Cliquez sur l'icône de l'extension pour ouvrir la sidebar
2. Sélectionnez l'onglet dont vous voulez capturer l'audio
3. Cliquez sur "Start Capture" pour démarrer l'enregistrement
4. Cliquez sur "Stop Capture" pour arrêter
5. Utilisez le lecteur audio pour écouter l'enregistrement
6. Téléchargez l'enregistrement si désiré

## Technologies utilisées

- TypeScript
- Chrome Extensions API V3
- WebAudio API
- MediaRecorder API
- Webpack
- ESLint
