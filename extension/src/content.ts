import { AudioCapture } from './core/audioCapture';

let audioCapture: AudioCapture | null = null;

// Attendre que la page soit complètement chargée
window.addEventListener('load', async () => {
  console.log('LiveTrad: Content script loaded');
  
  // Initialiser la capture audio
  audioCapture = new AudioCapture();
  const success = await audioCapture.initialize();
  
  if (success) {
    console.log('LiveTrad: Audio capture initialized successfully');
  } else {
    console.error('LiveTrad: Failed to initialize audio capture');
  }
});

// Nettoyer lors de la fermeture
window.addEventListener('unload', async () => {
  if (audioCapture) {
    await audioCapture.stop();
  }
});
