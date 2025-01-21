// Type definitions for Firefox's browser API
declare namespace browser {
  export const tabs: {
    query: (queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
    }) => Promise<{
      id?: number;
      url?: string;
      title?: string;
      active: boolean;
      windowId: number;
    }[]>;
  };
  
  export const runtime: {
    connect: (connectInfo?: { name?: string }) => {
      onMessage: { addListener: (callback: (message: any) => void) => void };
      onDisconnect: { addListener: (callback: () => void) => void };
      postMessage: (message: any) => void;
    };
    sendMessage: (message: any) => Promise<any>;
  };
}

// Firefox browser API wrapper
export const browserAPI = {
  tabs: {
    async query(queryInfo: { active?: boolean; currentWindow?: boolean }) {
      return browser.tabs.query(queryInfo);
    }
  },
  
  runtime: {
    connect(connectInfo?: { name?: string }) {
      return browser.runtime.connect(connectInfo);
    },

    sendMessage(message: any): Promise<any> {
      return browser.runtime.sendMessage(message);
    }
  }
};
