import { defaultWebSocketConfig, WebSocketConfig } from './websocket.config';
import { defaultAudioConfig, AudioConfig } from './audio.config';
import { defaultPlatformConfig, PlatformConfig } from './platform.config';
import { defaultAppConfig, AppConfig } from './app.config';

export interface Config {
  app: AppConfig;
  audio: AudioConfig;
  platforms: PlatformConfig;
  ws: WebSocketConfig;
}

const config: Config = {
  app: {
    debug: process.env.DEBUG === 'true' || defaultAppConfig.debug,
    env: process.env.NODE_ENV || defaultAppConfig.env
  },
  audio: {
    sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE || defaultAudioConfig.sampleRate.toString()),
    channels: parseInt(process.env.AUDIO_CHANNELS || defaultAudioConfig.channels.toString()),
    bufferSize: parseInt(process.env.AUDIO_BUFFER_SIZE || defaultAudioConfig.bufferSize.toString())
  },
  platforms: {
    supported: (process.env.SUPPORTED_PLATFORMS || defaultPlatformConfig.supported.join(',')).split(','),
    domains: {
      meet: (process.env.MEET_DOMAINS || defaultPlatformConfig.domains.meet.join(',')).split(','),
      zoom: (process.env.ZOOM_DOMAINS || defaultPlatformConfig.domains.zoom.join(',')).split(','),
      teams: (process.env.TEAMS_DOMAINS || defaultPlatformConfig.domains.teams.join(',')).split(',')
    }
  },
  ws: {
    desktopUrl: process.env.WS_DESKTOP_URL || defaultWebSocketConfig.desktopUrl,
    initialReconnectDelay: parseInt(process.env.WS_INITIAL_RECONNECT_DELAY || defaultWebSocketConfig.initialReconnectDelay.toString()),
    maxReconnectAttempts: parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS || defaultWebSocketConfig.maxReconnectAttempts.toString()),
    maxReconnectDelay: parseInt(process.env.WS_MAX_RECONNECT_DELAY || defaultWebSocketConfig.maxReconnectDelay.toString())
  }
};

export const isPlatformSupported = (url: string): boolean => {
  const hostname = new URL(url).hostname;
  return Object.values(config.platforms.domains).some(domains => 
    domains.some(domain => hostname.includes(domain))
  );
};

export { config };
