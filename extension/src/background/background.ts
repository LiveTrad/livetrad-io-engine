import { AudioCaptureState, MessageType, ResponseType, TabInfo } from '../types';
import { WebSocketService } from '../services/websocket';
import { AudioCaptureService } from '../services/audioCaptureService';

class AudioCaptureManager {
  private state: AudioCaptureState = {
    isStreaming: false,
    activeTabId: null,
    stream: null
  };

  private audioCaptureService: AudioCaptureService;

  constructor() {
    this.audioCaptureService = new AudioCaptureService();
    this.initializeListeners();
  }

  private initializeListeners(): void {
    // Listen for tab removal to update streaming state
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.state.activeTabId === tabId) {
        this.audioCaptureService.stopStreaming(tabId);
      }
      this.updateAvailableTabs();
      this.notifyStreamingStateChanged();
    });

    // Listen for tab audio state changes
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.audible !== undefined) {
        this.updateAvailableTabs();
      }
    });

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
            case 'START_STREAMING':
              if (!message.stream) {
                response = { success: false, error: 'No stream provided' };
              } else {
                response = await this.audioCaptureService.startStreaming(message.stream, message.tabId);
                this.state = this.audioCaptureService.getState();
                this.notifyStreamingStateChanged();
              }
              break;
            case 'STOP_STREAMING':
              response = await this.audioCaptureService.stopStreaming(message.tabId);
              this.state = this.audioCaptureService.getState();
              this.notifyStreamingStateChanged();
              break;
            case 'GET_STREAMING_STATE':
              response = { success: true, state: this.state };
              break;
            case 'GET_TABS':
              const tabs = await this.getAvailableTabs();
              response = { success: true, tabs };
              break;
            case 'CONNECT_DESKTOP':
              response = await this.audioCaptureService.connectToDesktop();
              break;
            case 'DISCONNECT_DESKTOP':
              this.audioCaptureService.disconnectFromDesktop();
              response = { success: true };
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

  private async getAvailableTabs(): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({ audible: true });
    const tabList = tabs.map(tab => ({
      id: tab.id!,
      title: tab.title || 'Unnamed Tab',
      url: tab.url || '',
    }));
    return tabList;
  }

  private async updateAvailableTabs(): Promise<void> {
    const tabs = await this.getAvailableTabs();
    chrome.runtime.sendMessage({
      type: 'TABS_UPDATED',
      tabs: tabs
    });
  }

  private notifyStreamingStateChanged(): void {
    chrome.runtime.sendMessage({
      type: 'STREAMING_STATE_CHANGED',
      state: this.state
    });
  }
}

// Initialize the manager
new AudioCaptureManager();
