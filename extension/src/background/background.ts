import { AudioCaptureState, MessageType, ResponseType, TabInfo } from '../types';
import { WebSocketService } from '../services/websocket';
import { AudioCaptureService } from '../services/audioCaptureService';
import { WebRTCService } from '../services/webrtc';

class AudioCaptureManager {
  private state: AudioCaptureState = {
    isStreaming: false,
    activeTabId: null,
    stream: null
  };

  private audioCaptureService: AudioCaptureService;
  private useWebRTC: boolean = true; // WebRTC activé par défaut
  private activeTabId: number | null = null;

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
                console.log(`[Background] Starting streaming with WebRTC: ${this.useWebRTC}`);
                if (this.useWebRTC) {
                  console.log('[Background] Using WebRTC via injected script');
                  this.activeTabId = message.tabId;
                  
                  try {
                    // First connect to desktop
                    const connectResponse = await this.sendMessageToWebRTC({
                      type: 'WEBRTC_CONNECT'
                    });
                    
                    if (connectResponse.success) {
                      // Then send the audio stream
                      const audioResponse = await this.sendMessageToWebRTC({
                        type: 'WEBRTC_SEND_AUDIO',
                        stream: message.stream
                      });
                      
                      if (audioResponse.success) {
                        this.state.isStreaming = true;
                        this.state.activeTabId = message.tabId;
                        this.state.stream = message.stream;
                        response = { success: true, data: { success: true } };
                      } else {
                        response = audioResponse;
                      }
                    } else {
                      response = connectResponse;
                    }
                  } catch (error) {
                    console.error('[Background] WebRTC error:', error);
                    response = { success: false, error: (error as Error).message || 'WebRTC connection failed' };
                  }
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
                console.log('[Background] Stopping WebRTC streaming');
                if (this.activeTabId) {
                  await this.sendMessageToWebRTC({
                    type: 'WEBRTC_SEND_CONTROL',
                    data: { action: 'stop_streaming' }
                  });
                }
                this.state.isStreaming = false;
                this.state.activeTabId = null;
                this.state.stream = null;
                response = { success: true, data: { status: 'stopped' } };
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
                console.log('[Background] Using WebRTC via injected script');
                try {
                  const connectResponse = await this.sendMessageToWebRTC({
                    type: 'WEBRTC_CONNECT'
                  });
                  response = connectResponse;
                } catch (error) {
                  console.error('[Background] WebRTC connection error:', error);
                  response = { success: false, error: (error as Error).message || 'WebRTC connection failed' };
                }
              } else {
                console.log('[Background] Using WebSocket connection');
                response = await this.audioCaptureService.connectToDesktop();
              }
              break;
            case 'DISCONNECT_DESKTOP':
              if (this.useWebRTC) {
                console.log('[Background] Disconnecting WebRTC');
                await this.sendMessageToWebRTC({
                  type: 'WEBRTC_DISCONNECT'
                });
                response = { success: true, data: { status: 'disconnected' } };
              } else {
                this.audioCaptureService.disconnectFromDesktop();
                response = { success: true, data: { status: 'disconnected' } };
              }
              break;
            case 'CAPTURE_TAB_AUDIO':
              console.log('[Background] Capturing tab audio...');
              try {
                const stream = await this.captureTabAudio(message.tabId);
                response = { success: true, data: { stream } };
              } catch (error) {
                console.error('[Background] Error capturing tab audio:', error);
                response = { success: false, error: (error as Error).message };
              }
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



  private async captureTabAudio(tabId: number): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      chrome.tabCapture.capture({
        audio: true,
        video: false
      }, (stream) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (stream) {
          resolve(stream);
        } else {
          reject(new Error('Failed to capture tab audio'));
        }
      });
    });
  }

  private async sendMessageToWebRTC(message: any): Promise<ResponseType> {
    try {
      // Get the active tab to inject the WebRTC script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        return { success: false, error: 'No active tab found' };
      }
      
      const activeTab = tabs[0];
      
      // Inject the WebRTC code directly
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id! },
        func: () => {
          // Create WebRTC service if it doesn't exist
          if (typeof (window as any).webrtcService === 'undefined') {
            console.log('[WebRTC] Creating WebRTC service...');
            
            // Simple WebRTC service for testing
            (window as any).webrtcService = {
              connect: async () => {
                console.log('[WebRTC] Connecting to signaling server...');
                return { status: 'connected', iceConnectionState: 'new', connectionState: 'new', signalingState: 'stable' };
              },
              sendAudioStream: async (stream: any) => {
                console.log('[WebRTC] Sending audio stream...');
                return true;
              },
              sendControlMessage: (message: any) => {
                console.log('[WebRTC] Sending control message:', message);
                return true;
              },
              disconnect: () => {
                console.log('[WebRTC] Disconnecting...');
              },
              getConnectionState: () => {
                return { status: 'connected', iceConnectionState: 'new', connectionState: 'new', signalingState: 'stable' };
              }
            };
            
            // Listen for messages
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
              console.log('[WebRTC] Received message:', message.type);
              
              (async () => {
                try {
                  const webrtcService = (window as any).webrtcService;
                  
                  switch (message.type) {
                    case 'WEBRTC_CONNECT':
                      const connectionState = await webrtcService.connect();
                      sendResponse({ success: true, data: connectionState });
                      break;
                    case 'WEBRTC_SEND_AUDIO':
                      const success = await webrtcService.sendAudioStream(message.stream);
                      sendResponse({ success, data: { success } });
                      break;
                    case 'WEBRTC_SEND_CONTROL':
                      const controlSuccess = webrtcService.sendControlMessage(message.data);
                      sendResponse({ success: controlSuccess, data: { success: controlSuccess } });
                      break;
                    case 'WEBRTC_DISCONNECT':
                      webrtcService.disconnect();
                      sendResponse({ success: true, data: { status: 'disconnected' } });
                      break;
                    default:
                      sendResponse({ success: false, error: 'Unknown message type' });
                  }
                } catch (error) {
                  console.error('[WebRTC] Error:', error);
                  sendResponse({ success: false, error: (error as Error).message || 'Unknown error' });
                }
              })();
              
              return true; // Keep message channel open for async response
            });
          }
        }
      });
      
      // Wait a bit for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send message to the injected script
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(activeTab.id!, message, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Background] WebRTC script error:', chrome.runtime.lastError);
            resolve({ success: false, error: chrome.runtime.lastError.message || 'WebRTC script error' });
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      console.error('[Background] Error sending message to WebRTC:', error);
      return { success: false, error: (error as Error).message || 'Unknown error' };
    }
  }
}

// Initialize the manager
new AudioCaptureManager();