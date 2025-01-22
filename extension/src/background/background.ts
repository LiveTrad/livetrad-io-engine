import { AudioCaptureState, MessageType, ResponseType, TabInfo } from '../types';

class AudioCaptureManager {
  private state: AudioCaptureState = {
    isCapturing: false,
    activeTabId: null,
    stream: null,
    mediaRecorder: null,
  };

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    chrome.runtime.onMessage.addListener((
      message: MessageType,
      _sender,
      sendResponse: (response: ResponseType) => void
    ) => {
      // Handle async operations
      (async () => {
        try {
          let response: ResponseType;
          
          switch (message.type) {
            case 'START_CAPTURE':
              response = await this.startCapture(message.tabId);
              break;
            case 'STOP_CAPTURE':
              response = await this.stopCapture(message.tabId);
              break;
            case 'GET_RECORDING_STATE':
              response = { success: true, state: this.state };
              break;
            case 'GET_TABS':
              const tabs = await this.getAvailableTabs();
              response = { success: true, tabs };
              break;
            default:
              response = { success: false, error: 'Unknown message type' };
          }
          
          sendResponse(response);
        } catch (error) {
          console.error('Error handling message:', error);
          sendResponse({ success: false, error: String(error) });
        }
      })();

      return true; // Keep the message channel open for async response
    });

    chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
      if (tab.windowId !== undefined) {
        chrome.sidePanel.open({ windowId: tab.windowId });
      }
    });
  }

  private async startCapture(tabId: number): Promise<ResponseType> {
    try {
      if (this.state.isCapturing) {
        throw new Error('Already capturing audio');
      }

      // Get the tab info
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error('Tab not found');
      }

      // Create a MediaStream from the tab
      const stream = await new Promise<MediaStream>((resolve, reject) => {
        const options: chrome.tabCapture.CaptureOptions = {
          audio: true,
          video: false,
          audioConstraints: {
            mandatory: {
              chromeMediaSource: 'tab',
            },
          },
        };

        // Execute tabCapture in the context of the service worker
        chrome.tabs.sendMessage(tabId, { type: 'REQUEST_TAB_CAPTURE' }, async (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            resolve(stream);
          } catch (error) {
            reject(error);
          }
        });
      });

      // Update state with the new stream
      this.state = {
        ...this.state,
        isCapturing: true,
        activeTabId: tabId,
        stream,
      };

      return { success: true, stream };
    } catch (error) {
      console.error('Error starting capture:', error);
      return { success: false, error: String(error) };
    }
  }

  private async stopCapture(tabId: number): Promise<ResponseType> {
    try {
      if (!this.state.isCapturing || this.state.activeTabId !== tabId) {
        throw new Error('No active capture for this tab');
      }

      if (this.state.stream) {
        this.state.stream.getTracks().forEach(track => track.stop());
      }

      this.state = {
        isCapturing: false,
        activeTabId: null,
        stream: null,
        mediaRecorder: null,
      };

      return { success: true };
    } catch (error) {
      console.error('Error stopping capture:', error);
      return { success: false, error: String(error) };
    }
  }

  private async getAvailableTabs(): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({ audible: true });
    return tabs.map(tab => ({
      id: tab.id!,
      title: tab.title || 'Unnamed Tab',
      url: tab.url || '',
    }));
  }
}

// Initialize the manager
new AudioCaptureManager();
