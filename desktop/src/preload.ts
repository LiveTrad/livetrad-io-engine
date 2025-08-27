import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
    // Generic invoke wrapper for IPC calls
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

    // Authentication
    authenticate: (username: string, password: string) =>
      ipcRenderer.invoke('authenticate', { username, password }),
    checkAuth: () => ipcRenderer.invoke('check-auth'),

    // Connection status
    getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
    onConnectionChange: (callback: any) => {
      ipcRenderer.on('connection-change', (_event, data) => {
        callback(data?.status, data?.details);
      });
    },

    // Audio controls
    togglePlayback: () => ipcRenderer.invoke('toggle-playback'),
    getPlaybackStatus: () => ipcRenderer.invoke('get-playback-status'),
    setVolume: (volume: number) => ipcRenderer.invoke('set-volume', { volume }),
    toggleMute: () => ipcRenderer.invoke('toggle-mute'),
    getVolume: () => ipcRenderer.invoke('get-volume'),

    // Audio stats updates (adapts to renderer expectation)
    onAudioStats: (callback: any) => {
      ipcRenderer.on('audio-stats', (_event, stats) => {
        const dummyData = new Float32Array(stats?.bufferSize || 4096);
        const avgValue = parseFloat(stats?.avgValue);
        for (let i = 0; i < dummyData.length; i++) {
          dummyData[i] = avgValue;
        }
        callback(dummyData, stats);
      });
    },

    // Transcription
    toggleTranscription: () => ipcRenderer.invoke('toggle-transcription'),
    getTranscriptionStatus: () => ipcRenderer.invoke('get-transcription-status'),
    onTranscription: (callback: any) => {
      ipcRenderer.on('transcription', (_event, transcriptionData) => {
        callback(transcriptionData);
      });
    },

    // Deepgram events
    onDeepgramConnected: (callback: any) => {
      ipcRenderer.on('deepgram-connected', () => callback());
    },
    onDeepgramDisconnected: (callback: any) => {
      ipcRenderer.on('deepgram-disconnected', () => callback());
    },
    onDeepgramError: (callback: any) => {
      ipcRenderer.on('deepgram-error', (_event, error) => callback(error));
    }
});