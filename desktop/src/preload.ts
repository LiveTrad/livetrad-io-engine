import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
    // Generic invoke wrapper for IPC calls
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    // For connection status changes
    onConnectionChange: (callback: any) => {
      ipcRenderer.on('connection-change', (event, data) => {
        callback(data.status, data.details);
      });
    },
    
    // For audio stats updates
    onAudioStats: (callback: any) => {
      ipcRenderer.on('audio-stats', (_event, stats) => {
        // Convert the stats format to what the renderer expects
        // Create a dummy Float32Array with the right average level for visualization
        const dummyData = new Float32Array(stats.bufferSize || 4096);
        const avgValue = parseFloat(stats.avgValue);
        for (let i = 0; i < dummyData.length; i++) {
          dummyData[i] = avgValue;
        }
        callback(dummyData, stats);
      });
    },
    
    // Get current connection status
    getConnectionStatus: () => {
      return ipcRenderer.invoke('get-connection-status');
    }
  });