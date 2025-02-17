import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'api', {
        getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
        onConnectionChange: (callback: (status: boolean) => void) => {
            ipcRenderer.on('connection-change', (_event, status) => callback(status));
        }
    }
);
