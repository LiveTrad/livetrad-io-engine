// Type definitions for Firefox's browser API
declare namespace browser {
  export const tabs: typeof chrome.tabs;
  export const runtime: typeof chrome.runtime;
}

// Helper to detect browser type
export const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

// Unified browser API
export const browserAPI = {
  tabs: {
    async query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
      if (isFirefox) {
        return browser.tabs.query(queryInfo);
      }
      return new Promise((resolve) => {
        chrome.tabs.query(queryInfo, resolve);
      });
    }
  },
  
  runtime: {
    lastError: chrome.runtime.lastError,
    
    connect(connectInfo?: chrome.runtime.ConnectInfo): chrome.runtime.Port {
      if (isFirefox) {
        return browser.runtime.connect(connectInfo);
      }
      return chrome.runtime.connect(connectInfo);
    },

    sendMessage<T = any>(
      message: any,
      options?: chrome.runtime.MessageOptions
    ): Promise<T> {
      if (isFirefox) {
        return browser.runtime.sendMessage(message, options);
      }
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, options, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    }
  },

  tabCapture: {
    capture(options: chrome.tabCapture.CaptureOptions): Promise<MediaStream> {
      if (isFirefox) {
        throw new Error('tabCapture not supported in Firefox');
      }
      return new Promise((resolve, reject) => {
        chrome.tabCapture.capture(options, (stream) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!stream) {
            reject(new Error('Failed to get media stream'));
          } else {
            resolve(stream);
          }
        });
      });
    }
  }
};
