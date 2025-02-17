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
    supported: (process.env.SUPPORTED_PLATFORMS || 'meet,zoom,teams').split(','),
    domains: {
      meet: (process.env.MEET_DOMAINS || 'meet.google.com').split(','),
      zoom: (process.env.ZOOM_DOMAINS || 'zoom.us').split(','),
      teams: (process.env.TEAMS_DOMAINS || 'teams.microsoft.com').split(',')
    }
  },
  ws: {
    url: process.env.WS_DESKTOP_URL || 'ws://localhost:8080',
    reconnectInterval: parseInt(process.env.WS_INITIAL_RECONNECT_DELAY || '1000'),
    maxRetries: parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS || '5')
  }
};

export const isPlatformSupported = (url: string): boolean => {
  const hostname = new URL(url).hostname;
  return Object.values(config.platforms.domains).some(domains => 
    domains.some(domain => hostname.includes(domain))
  );
};

export { config };
