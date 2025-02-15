import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    // Add API methods here that will be available to the renderer process
    getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
});
