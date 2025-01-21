import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { FloatingSwitch } from '../components/FloatingSwitch';
import { AudioCapture } from '../core/audioCapture';
import '../components/FloatingSwitch.css';
import './popup.css';
import { config } from '../core/config';

console.log('LiveTrad: Popup script loaded');

const Popup: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [audioCaptureInstance, setAudioCaptureInstance] = useState<AudioCapture | null>(null);
  const [status, setStatus] = useState('Not started');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioCaptureInstance) {
        audioCaptureInstance.stop();
      }
    };
  }, [audioCaptureInstance]);

  const handleAudioToggle = useCallback(async (enabled: boolean) => {
    console.log('LiveTrad: Toggle clicked, enabled:', enabled);
    try {
      if (enabled) {
        console.log('LiveTrad: Starting audio capture');
        
        // Create new AudioCapture instance if needed
        console.log('LiveTrad: Creating new AudioCapture instance');
        const capture = new AudioCapture();
        setAudioCaptureInstance(capture);

        // Start capture
        const result = await capture.start();
        if (!result.success) {
          throw new Error(result.error);
        }
        setStatus('Audio running');
      } else if (audioCaptureInstance) {
        console.log('LiveTrad: Stopping audio capture');
        await audioCaptureInstance.stop();
        setAudioCaptureInstance(null);
        setStatus('Audio stopped');
      }
      setEnabled(enabled);
    } catch (error) {
      console.error('LiveTrad: Error handling audio toggle:', error);
      setEnabled(false);
      setAudioCaptureInstance(null);
      setStatus('Error: ' + (error as Error).message);
    }
  }, [audioCaptureInstance]);

  return (
    <div className="popup-container">
      <h1 className="text-lg font-bold mb-4">LiveTrad</h1>
      <div className="text-sm mb-4">
        <p>Version: {config.app.version}</p>
        <p>Status: {status}</p>
      </div>
      <div className="controls-container">
        <FloatingSwitch
          enabled={enabled}
          onToggle={handleAudioToggle}
        />
      </div>
      <p className="text-xs text-gray-500">
        Use the toggle switch to control audio capture
      </p>
    </div>
  );
};

// Create root element
const root = document.createElement('div');
root.id = 'root';
document.body.appendChild(root);

// Render app
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
