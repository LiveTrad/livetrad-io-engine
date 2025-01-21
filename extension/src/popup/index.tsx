import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { AudioCapture } from '../core/audioCapture';
import { FloatingSwitch } from '../components/FloatingSwitch';
import '../components/FloatingSwitch.css';
import './popup.css';
import { config } from '../core/config';

console.log('LiveTrad: Popup script loaded');

let audioCapture: AudioCapture | null = null;

function Popup() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [status, setStatus] = useState('Not started');

  const handleAudioToggle = async (enabled: boolean) => {
    console.log('LiveTrad: Toggle clicked, enabled:', enabled);
    try {
      if (enabled) {
        console.log('LiveTrad: Starting audio capture');
        if (!audioCapture) {
          console.log('LiveTrad: Creating new AudioCapture instance');
          audioCapture = new AudioCapture();
        }
        
        // Vérifier que nous sommes dans un onglet actif
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('LiveTrad: Active tabs:', tabs);
        
        if (!tabs[0]?.id) {
          throw new Error('No active tab found');
        }

        await audioCapture.start();
        console.log('LiveTrad: Audio capture started');
        setStatus('Audio running');
        setIsEnabled(true);
      } else {
        console.log('LiveTrad: Stopping audio capture');
        if (audioCapture) {
          await audioCapture.stop();
          audioCapture = null;
        }
        setStatus('Audio stopped');
        setIsEnabled(false);
      }
    } catch (error) {
      console.error('LiveTrad: Error handling audio toggle:', error);
      setStatus('Error: ' + (error as Error).message);
      setIsEnabled(false);
    }
  };

  return (
    <div className="popup-container">
      <h1 className="text-lg font-bold mb-4">LiveTrad</h1>
      <div className="text-sm mb-4">
        <p>Version: {config.app.version}</p>
        <p>Status: {status}</p>
      </div>
      <div className="controls-container">
        <FloatingSwitch
          onToggle={handleAudioToggle}
          initialState={isEnabled}
        />
      </div>
      <p className="text-xs text-gray-500">
        Use the toggle switch to control audio capture
      </p>
    </div>
  );
}

// Nettoyer lors de la fermeture
window.addEventListener('unload', async () => {
  console.log('LiveTrad: Popup unloading');
  if (audioCapture) {
    await audioCapture.stop();
  }
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
