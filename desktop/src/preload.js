const { contextBridge, ipcRenderer } = require('electron');

// White-listed channels
const ipc = {
    'render': {
        // From render to main
        'send': [],
        // From main to render
        'receive': ['connection-change', 'audio-stats', 'transcription', 'deepgram-connected', 'deepgram-disconnected', 'deepgram-error'],
        // From render to main and back again
        'sendReceive': ['authenticate', 'check-auth', 'get-connection-status', 'toggle-playback', 'get-playback-status', 'set-volume', 'toggle-mute', 'get-volume', 'toggle-transcription', 'get-transcription-status', 'toggle-auto-translate', 'get-auto-translate-status', 'set-target-language', 'get-target-language']
    }
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'api', 
    // API functions for renderer
    {
        // Authentication
        authenticate: (username, password) => 
            ipcRenderer.invoke('authenticate', { username, password }),
        
        // Check authentication status
        checkAuth: () => 
            ipcRenderer.invoke('check-auth'),
        
        // Connection status
        getConnectionStatus: () =>
            ipcRenderer.invoke('get-connection-status'),
        
        // Audio controls
        togglePlayback: () =>
            ipcRenderer.invoke('toggle-playback'),
            
        getPlaybackStatus: () =>
            ipcRenderer.invoke('get-playback-status'),
            
        setVolume: (volume) =>
            ipcRenderer.invoke('set-volume', { volume }),
            
        toggleMute: () =>
            ipcRenderer.invoke('toggle-mute'),
            
        getVolume: () =>
            ipcRenderer.invoke('get-volume'),
            
        // Transcription
        toggleTranscription: () =>
            ipcRenderer.invoke('toggle-transcription'),
            
        getTranscriptionStatus: () =>
            ipcRenderer.invoke('get-transcription-status'),

        setTranscriptionLanguage: (language, detectLanguage) =>
            ipcRenderer.invoke('set-transcription-language', { language, detectLanguage }),
        
        // Translation
        toggleAutoTranslate: (enabled) =>
            ipcRenderer.invoke('toggle-auto-translate', { enabled }),
            
        getAutoTranslateStatus: () =>
            ipcRenderer.invoke('get-auto-translate-status'),
            
        setTargetLanguage: (language) =>
            ipcRenderer.invoke('set-target-language', { language }),
            
        getTargetLanguage: () =>
            ipcRenderer.invoke('get-target-language'),
        
        // Event listeners
        onConnectionChange: (callback) => 
            ipcRenderer.on('connection-change', (event, ...args) => callback(...args)),
        
        onAudioStats: (callback) => 
            ipcRenderer.on('audio-stats', (event, ...args) => callback(...args)),
            
        onTranscription: (callback) =>
            ipcRenderer.on('transcription', (event, ...args) => callback(...args)),
            
        onDeepgramConnected: (callback) =>
            ipcRenderer.on('deepgram-connected', (event, ...args) => callback(...args)),
            
        onDeepgramDisconnected: (callback) =>
            ipcRenderer.on('deepgram-disconnected', (event, ...args) => callback(...args)),
            
        onDeepgramError: (callback) =>
            ipcRenderer.on('deepgram-error', (event, ...args) => callback(...args))
    }
);

// For backward compatibility
contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        invoke: async (channel, ...args) => {
            return await ipcRenderer.invoke(channel, ...args);
        },
        on: (channel, func) => {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
});
