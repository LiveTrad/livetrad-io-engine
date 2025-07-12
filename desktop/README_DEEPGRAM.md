# Intégration Deepgram - LiveTrad Desktop

## Configuration

### 1. Obtenir une clé API Deepgram

1. Créez un compte sur [Deepgram](https://deepgram.com/)
2. Obtenez votre clé API depuis le dashboard
3. Copiez la clé API

### 2. Configuration de l'environnement

Créez un fichier `.env` dans le dossier `desktop/` avec le contenu suivant :

```env
# Deepgram Configuration
DEEPGRAM_API_KEY=votre_cle_api_deepgram_ici
DEEPGRAM_LANGUAGE=fr
DEEPGRAM_MODEL=nova
DEEPGRAM_TRANSCRIPTION_PORT=3000

# WebSocket Configuration
WS_PORT=8080
WS_HOST=localhost

# App Configuration
APP_NAME=LiveTrad Desktop
APP_VERSION=1.0.0
WINDOW_WIDTH=1200
WINDOW_HEIGHT=800
WINDOW_TITLE=LiveTrad Desktop - Transcription en temps réel

# Environment
NODE_ENV=development
```

### 3. Installation des dépendances

```bash
cd desktop
npm install
```

## Utilisation

### 1. Démarrer l'application

```bash
npm run dev
```

### 2. Activer la transcription

1. Assurez-vous que l'extension est connectée et envoie des données audio
2. Cochez la case "Activer la transcription Deepgram" dans l'interface
3. La transcription apparaîtra en temps réel dans la section "Transcription en temps réel"

### 3. Fonctionnalités

- **Transcription en temps réel** : Les transcriptions apparaissent au fur et à mesure
- **Transcriptions finales vs intermédiaires** : 
  - Vert = transcription finale
  - Orange = transcription intermédiaire (en cours)
- **Niveau de confiance** : Affiché en pourcentage pour chaque transcription
- **Historique** : Les 50 dernières transcriptions sont conservées
- **Gestion d'erreurs** : Affichage des erreurs Deepgram

## Architecture

### Services

- **WebSocketService** : Gère les connexions WebSocket et l'audio
- **DeepgramService** : Gère la transcription via l'API Deepgram

### Flux de données

1. Extension → WebSocket → Desktop App
2. Desktop App → Deepgram API → Transcription
3. Transcription → Interface utilisateur

### Configuration Deepgram

- **Modèle** : `nova` (le plus récent et précis)
- **Langue** : `fr` (français)
- **Ponctuation** : Activée
- **Formatage intelligent** : Activé
- **Résultats intermédiaires** : Activés

## Dépannage

### Erreurs courantes

1. **"API key not found"** : Vérifiez que votre clé API est correctement configurée dans le fichier `.env`

2. **"Deepgram error"** : 
   - Vérifiez votre connexion internet
   - Vérifiez que votre clé API est valide
   - Vérifiez votre quota Deepgram

3. **Pas de transcription** :
   - Vérifiez que l'extension est connectée
   - Vérifiez que l'audio est bien capturé
   - Vérifiez que la transcription est activée

### Logs

Les logs sont affichés dans la console de l'application. Recherchez les messages commençant par :
- `[Deepgram]` : Logs du service Deepgram
- `[WebSocket]` : Logs du service WebSocket

## Développement

### Ajouter de nouvelles fonctionnalités

1. **Nouveaux événements Deepgram** : Ajoutez-les dans `DeepgramService`
2. **Nouvelle interface** : Modifiez `index.html` et `renderer.js`
3. **Nouveaux IPC** : Ajoutez-les dans `main.ts` et `preload.ts`

### Tests

Pour tester la transcription :
1. Parlez dans votre microphone
2. Vérifiez que l'audio est capturé (barre de niveau)
3. Activez la transcription
4. Vérifiez que les transcriptions apparaissent

## Support

Pour toute question ou problème :
1. Vérifiez les logs dans la console
2. Vérifiez la configuration Deepgram
3. Testez avec un exemple simple d'audio 