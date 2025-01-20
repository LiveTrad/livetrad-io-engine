export const config = {
  app: {
    name: import.meta.env.VITE_APP_NAME || 'LiveTrad',
    version: import.meta.env.VITE_APP_VERSION || '0.1.0',
    debug: import.meta.env.VITE_DEBUG_MODE === 'true'
  },
  audio: {
    sampleRate: parseInt(import.meta.env.VITE_AUDIO_SAMPLE_RATE || '16000'),
    channels: parseInt(import.meta.env.VITE_AUDIO_CHANNELS || '1')
  },
  platforms: {
    supported: (import.meta.env.VITE_SUPPORTED_PLATFORMS || 'meet.google.com,zoom.us,teams.microsoft.com').split(',')
  },
  ws: {
    url: import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'
  }
};
