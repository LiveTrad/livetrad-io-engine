import { AudioCaptureState, MessageType, ResponseType, TabInfo } from '../types';
import { WebSocketService } from '../services/websocket';
import { AudioCaptureService } from '../services/audioCaptureService';
import { WebRTCAudioCaptureService } from '../services/webrtcAudioCaptureService';

class AudioCaptureManager {
  private state: AudioCaptureState = {
    isStreaming: false,
    activeTabId: null,
    stream: null
  };

  private audioCaptureService: AudioCaptureService;
  private webrtcAudioCaptureService: WebRTCAudioCaptureService;
  private useWebRTC: boolean = true; // WebRTC activé par défaut // Toggle for WebRTC vs WebSocket

  constructor() {
    this.audioCaptureService = new AudioCaptureService();
    this.webrtcAudioCaptureService = new WebRTCAudioCaptureService();
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
                console.log(`[Background] Starting streaming with WebRTC: ${this.useWebRTC}`);
                if (this.useWebRTC) {
                  console.log('[Background] Using WebRTC service');
                  response = await this.webrtcAudioCaptureService.startStreaming(message.stream, message.tabId);
                  this.state = this.webrtcAudioCaptureService.getState();
                } else {
                  console.log('[Background] Using WebSocket service');
                  response = await this.audioCaptureService.startStreaming(message.stream, message.tabId);
                  this.state = this.audioCaptureService.getState();
                }
                this.notifyStreamingStateChanged();
              }
              break;
            case 'STOP_STREAMING':
              if (this.useWebRTC) {
                response = await this.webrtcAudioCaptureService.stopStreaming(message.tabId);
                this.state = this.webrtcAudioCaptureService.getState();
              } else {
                response = await this.audioCaptureService.stopStreaming(message.tabId);
                this.state = this.audioCaptureService.getState();
              }
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
              console.log(`[Background] Connecting to desktop with WebRTC: ${this.useWebRTC}`);
              if (this.useWebRTC) {
                console.log('[Background] Using WebRTC connection');
                response = await this.webrtcAudioCaptureService.connectToDesktop();
              } else {
                console.log('[Background] Using WebSocket connection');
                response = await this.audioCaptureService.connectToDesktop();
              }
              break;
            case 'DISCONNECT_DESKTOP':
              if (this.useWebRTC) {
                this.webrtcAudioCaptureService.disconnectFromDesktop();
              } else {
                this.audioCaptureService.disconnectFromDesktop();
              }
              response = { success: true };
              break;
            case 'TOGGLE_WEBRTC':
              this.useWebRTC = !this.useWebRTC;
              response = { success: true, data: { useWebRTC: this.useWebRTC } };
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