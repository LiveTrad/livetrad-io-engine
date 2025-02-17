export interface PlatformConfig {
  supported: string[];
  domains: {
    [key: string]: string[];
  };
}

export const defaultPlatformConfig: PlatformConfig = {
  supported: ['meet', 'zoom', 'teams'],
  domains: {
    meet: ['meet.google.com'],
    zoom: ['zoom.us'],
    teams: ['teams.microsoft.com']
  }
};