import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'api', {
        getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
        onConnectionChange: (callback: (status: boolean, details: any) => void) => {
            ipcRenderer.on('connection-change', (_event, { status, details }) => callback(status, details));
        }
    }
);
