import { config, isPlatformSupported } from '../config';

export class PlatformManager {
  static async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  static async checkCurrentPlatform(): Promise<boolean> {
    const tab = await this.getCurrentTab();
    if (!tab?.url) return false;
    
    const isSupported = isPlatformSupported(tab.url);
    if (!isSupported && config.app.debug) {
      console.log(`LiveTrad: Platform not supported for URL: ${tab.url}`);
      console.log('LiveTrad: Supported platforms:', config.platforms.supported);
      console.log('LiveTrad: Supported domains:', config.platforms.domains);
    }
    
    return isSupported;
  }

  static getPlatformFromUrl(url: string): string | null {
    const hostname = new URL(url).hostname;
    for (const [platform, domains] of Object.entries(config.platforms.domains)) {
      if (domains.some(domain => hostname.includes(domain))) {
        return platform;
      }
    }
    return null;
  }
}
