# Guide de Dépannage - Traduction

## Problème : `window.api.getAutoTranslateStatus is not a function`

### Cause
Les méthodes de traduction ne sont pas correctement exposées dans le preload.js ou les handlers IPC ne sont pas définis.

### Solution
1. **Vérifiez que les handlers IPC sont présents** dans `src/main.ts` :
```typescript
ipcMain.handle('get-auto-translate-status', () => {
    if (this.wsService) return { enabled: this.wsService.isAutoTranslateEnabled() };
    if (this.webrtcService) return { enabled: this.webrtcService.isAutoTranslateEnabled() };
    return { enabled: false };
});
```

2. **Vérifiez que les méthodes sont exposées** dans `src/preload.js` :
```javascript
getAutoTranslateStatus: () =>
    ipcRenderer.invoke('get-auto-translate-status'),
```

3. **Vérifiez que les canaux sont autorisés** dans `src/preload.js` :
```javascript
'sendReceive': [..., 'get-auto-translate-status', 'set-target-language', 'get-target-language']
```

4. **Redémarrez l'application** après les modifications :
```bash
npm run build
npm start
```

## Problème : Pas de traduction

### Cause
- Clés API manquantes ou incorrectes
- Service de traduction non initialisé
- Provider de traduction non configuré

### Solution
1. **Vérifiez vos clés API** dans le fichier `.env` :
```bash
GOOGLE_TRANSLATE_API_KEY=your_actual_key_here
DEEPL_API_KEY=your_actual_key_here
```

2. **Vérifiez que le service de traduction est initialisé** dans les constructeurs :
```typescript
const translationService = new TranslationService(config.translation?.defaultProvider || 'google');
this.transcriptor = new LiveTradTranscriptor(new DeepgramProvider(), translationService);
```

3. **Testez avec le fallback local** en ne configurant pas de clés API

## Problème : Erreurs de compilation TypeScript

### Cause
- Interfaces manquantes
- Imports incorrects
- Types non définis

### Solution
1. **Vérifiez que l'interface TranslationData** inclut la propriété `language` :
```typescript
export interface TranscriptionData {
    transcript: string;
    confidence: number;
    isFinal: boolean;
    timestamp: Date | string | number;
    language?: string; // Ajoutez cette ligne
}
```

2. **Vérifiez les imports** dans tous les fichiers :
```typescript
import { TranslationService, TranslationData, StreamingTranslationSegment } from '../translation';
```

## Problème : Traductions lentes

### Cause
- Délai de streaming trop élevé
- Pas de cache
- Connexion internet lente

### Solution
1. **Ajustez le délai de streaming** dans `src/services/translation.ts` :
```typescript
private readonly STREAMING_DELAY = 300; // Réduire de 500ms à 300ms
```

2. **Vérifiez que le cache fonctionne** :
```typescript
console.log('Cache size:', translationService.getCacheSize());
```

## Problème : Interface utilisateur ne se met pas à jour

### Cause
- Événements non émis
- Callbacks non définis
- DOM non mis à jour

### Solution
1. **Vérifiez que les événements sont émis** :
```typescript
this.emit('translation', translationData);
```

2. **Vérifiez que les callbacks sont définis** dans le renderer :
```javascript
window.api.onTranscription((transcriptionData) => {
    addTranscriptionToDisplay(transcriptionData);
});
```

## Test de Diagnostic

Exécutez ce code dans la console du navigateur pour diagnostiquer :

```javascript
// Test complet des méthodes de traduction
async function testTranslation() {
    console.log('=== Test de diagnostic ===');
    
    try {
        // Test 1: Vérifier que window.api existe
        if (!window.api) {
            console.error('❌ window.api n\'existe pas');
            return;
        }
        console.log('✅ window.api existe');
        
        // Test 2: Vérifier les méthodes
        const methods = ['getAutoTranslateStatus', 'getTargetLanguage', 'toggleAutoTranslate', 'setTargetLanguage'];
        for (const method of methods) {
            if (typeof window.api[method] !== 'function') {
                console.error(`❌ ${method} n'est pas une fonction`);
                return;
            }
        }
        console.log('✅ Toutes les méthodes existent');
        
        // Test 3: Appeler les méthodes
        const status = await window.api.getAutoTranslateStatus();
        console.log('✅ getAutoTranslateStatus:', status);
        
        const lang = await window.api.getTargetLanguage();
        console.log('✅ getTargetLanguage:', lang);
        
        console.log('✅ Tous les tests passent !');
        
    } catch (error) {
        console.error('❌ Erreur lors du test:', error);
    }
}

testTranslation();
```

## Logs Utiles

Ajoutez ces logs pour déboguer :

```typescript
// Dans le service de traduction
console.log('[Translation] Service initialized with provider:', this.currentProvider.name);

// Dans le transcriptor
console.log('[Transcriptor] Auto-translate set to:', enabled);

// Dans le main process
console.log('[Main] Translation handler called with:', enabled);
```

## Redémarrage Complet

Si rien ne fonctionne, essayez un redémarrage complet :

```bash
# 1. Arrêter l'application
# 2. Nettoyer
rm -rf node_modules
rm -rf dist
npm install

# 3. Recompiler
npm run build

# 4. Redémarrer
npm start
```
