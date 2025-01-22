export interface Config {
  app: {
    debug: boolean;
    env: string;
  };
  audio: {
    sampleRate: number;
    channels: number;
    bufferSize: number;
  };
  platforms: {
    supported: string[];
    domains: {
      [key: string]: string[];
    };
  };
  ws: {
    url: string;
    reconnectInterval: number;
    maxRetries: number;
  };
}

const config: Config = {
  app: {
    debug: process.env.DEBUG === 'true',
    env: process.env.NODE_ENV || 'development'
  },
  audio: {
    sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE || '16000'),
    channels: parseInt(process.env.AUDIO_CHANNELS || '1'),
    bufferSize: parseInt(process.env.AUDIO_BUFFER_SIZE || '4096')
  },
  platforms: {
    supported: ['meet', 'zoom', 'teams'],
    domains: {
      meet: ['meet.google.com'],
      zoom: ['zoom.us'],
      teams: ['teams.microsoft.com']
    }
  },
  ws: {
    url: process.env.WS_URL || 'ws://localhost:8000',
    reconnectInterval: parseInt(process.env.WS_RECONNECT_INTERVAL || '1000'),
    maxRetries: parseInt(process.env.WS_MAX_RETRIES || '5')
  }
};

export const isPlatformSupported = (url: string): boolean => {
  const hostname = new URL(url).hostname;
  return Object.values(config.platforms.domains).some(domains => 
    domains.some(domain => hostname.includes(domain))
  );
};

export { config };
