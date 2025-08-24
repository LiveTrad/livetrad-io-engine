import { defaultAudioConfig, AudioConfig } from './audio.config';
import { defaultPlatformConfig, PlatformConfig } from './platform.config';
import { defaultAppConfig, AppConfig } from './app.config';

export interface Config {
  app: AppConfig;
  audio: AudioConfig;
  platforms: PlatformConfig;
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
  }
};

export const isPlatformSupported = (url: string): boolean => {
  const hostname = new URL(url).hostname;
  return Object.values(config.platforms.domains).some(domains => 
    domains.some(domain => hostname.includes(domain))
  );
};

export { config };
