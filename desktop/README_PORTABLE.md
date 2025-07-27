# LiveTrad Desktop - Application Portable avec FFmpeg Embarqué

## Aperçu

Cette version de LiveTrad Desktop inclut FFmpeg embarqué, rendant l'application entièrement portable sans nécessiter d'installation séparée de FFmpeg sur le système.

## Fonctionnalités

- ✅ **Portable** : Aucune installation de FFmpeg requise
- ✅ **Multi-plateforme** : Support Windows et Linux
- ✅ **Multi-architecture** : Support x64, ia32 (Windows), ARM64 (Linux)
- ✅ **Automatique** : Téléchargement et configuration automatique des binaires

## Structure du projet

```
desktop/
├── src/
│   ├── utils/
│   │   ├── ffmpeg-manager.ts    # Gestionnaire FFmpeg embarqué
│   │   └── dependencies.ts      # Ancien système (utilisé pour les dialogues)
│   └── services/
│       └── websocket.ts         # Service mis à jour pour utiliser FFmpeg embarqué
├── scripts/
│   └── download-ffmpeg.js       # Script de téléchargement automatique
├── binaries/                    # Binaires FFmpeg (généré automatiquement)
│   ├── windows/
│   │   ├── x64/
│   │   │   ├── ffmpeg.exe
│   │   │   └── ffplay.exe
│   │   └── ia32/
│   │       ├── ffmpeg.exe
│   │       └── ffplay.exe
│   └── linux/
│       ├── x64/
│       │   ├── ffmpeg
│       │   └── ffplay
│       └── arm64/
│           ├── ffmpeg
│           └── ffplay
└── dist-electron/               # Applications packagées
```

## Installation et utilisation

### 1. Installation des dépendances

```bash
npm install
```

### 2. Développement

```bash
# Télécharger FFmpeg (requis une seule fois)
npm run download-ffmpeg

# Compiler et démarrer en mode développement
npm run dev
```

### 3. Construction pour la distribution

```bash
# Préparer tout pour la distribution (compile + télécharge FFmpeg)
npm run prepare-dist

# Créer l'application packagée
npm run dist
```

## Scripts disponibles

- `npm run download-ffmpeg` : Télécharge les binaires FFmpeg pour toutes les plateformes
- `npm run prepare-dist` : Compile le code TypeScript et télécharge FFmpeg
- `npm run dist` : Crée l'application packagée avec electron-builder
- `npm run dev` : Mode développement

## Fonctionnement interne

### FFmpegManager

La classe `FFmpegManager` gère automatiquement :

1. **Détection de la plateforme** : Détermine l'OS et l'architecture
2. **Localisation des binaires** : Trouve les bonnes versions de FFmpeg
3. **Initialisation** : Configure les chemins et permissions
4. **Spawn des processus** : Lance FFmpeg/FFplay avec les bons chemins

### Gestion des chemins

- **Mode développement** : Binaires dans `./binaries/`
- **Mode packagé** : Binaires dans `process.resourcesPath/binaries/`

### Téléchargement automatique

Le script `download-ffmpeg.js` :

1. Télécharge les builds officiels depuis GitHub
2. Extrait les archives (ZIP pour Windows, TAR.XZ pour Linux)
3. Copie uniquement les binaires nécessaires (ffmpeg, ffplay)
4. Configure les permissions sur Linux

## Avantages de cette approche

1. **Portabilité complète** : L'application fonctionne sans dépendances externes
2. **Simplicité d'installation** : Un seul fichier à distribuer
3. **Maintenance réduite** : Plus besoin de documenter l'installation de FFmpeg
4. **Compatibilité** : Utilise les builds officiels et stables de FFmpeg
5. **Sécurité** : Contrôle total sur les binaires utilisés

## Taille de l'application

- **Binaires FFmpeg** : ~100-150 MB par plateforme
- **Application finale** : ~200-300 MB (selon la plateforme)

Cette augmentation de taille est compensée par la facilité d'installation et la portabilité.

## Dépannage

### Problème de téléchargement

Si le téléchargement échoue, vous pouvez :

1. Vérifier votre connexion internet
2. Relancer `npm run download-ffmpeg`
3. Télécharger manuellement depuis [FFmpeg Builds](https://github.com/BtbN/FFmpeg-Builds/releases)

### Problème de permissions sur Linux

Si les binaires ne sont pas exécutables :

```bash
chmod +x binaries/linux/x64/ffmpeg
chmod +x binaries/linux/x64/ffplay
```

### Problème de chemin

Vérifiez que les binaires sont dans la bonne structure :

```
binaries/
├── windows/
│   └── x64/
│       ├── ffmpeg.exe
│       └── ffplay.exe
└── linux/
    └── x64/
        ├── ffmpeg
        └── ffplay
```

## Migration depuis l'ancien système

L'ancien système utilisant `checkFFmpegDependencies` est toujours présent pour les dialogues d'erreur, mais le playback utilise maintenant `FFmpegManager` pour les binaires embarqués.

Cette approche assure une transition en douceur tout en offrant la portabilité souhaitée.
