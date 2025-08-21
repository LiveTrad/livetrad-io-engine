import { AudioCaptureState, MessageType, ResponseType, TabInfo } from '../types';
import { AudioCaptureService } from '../services/audioCaptureService';

class AudioCaptureManager {
  private state: AudioCaptureState = {
    isStreaming: false,
    activeTabId: null,
    stream: null
  };

  private audioCaptureService: AudioCaptureService;
  private useWebRTC: boolean = true;
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
      (async () => {
        try {
          let response: ResponseType;
          
          switch (message.type) {
            case 'START_STREAMING':
              console.log(`[Background] Starting streaming for tab ${message.tabId}`);
              this.activeTabId = message.tabId;
              
              try {
                // 1. Connecter d'abord au bureau via WebRTC
                const connectResponse = await this.sendMessageToWebRTC({
                  type: 'WEBRTC_CONNECT'
                });
                console.log('[Background] WebRTC connect response:', connectResponse);
                
                if (!connectResponse.success) {
                  throw new Error(connectResponse.error || 'Failed to connect to desktop');
                }
                
                // 2. Démarrer la capture audio via le content script
                const captureResponse = await this.captureTabAudio(message.tabId);
                console.log('[Background] Audio capture started successfully');
                
                // Mettre à jour l'état
                this.state.isStreaming = true;
                this.state.activeTabId = message.tabId;
                this.state.stream = captureResponse;
                
                response = { success: true, data: { success: true } };
              } catch (error) {
                console.error('[Background] Error starting streaming:', error);
                response = { 
                  success: false, 
                  error: `Failed to start streaming: ${(error as Error).message}` 
                };
              }
              
              this.notifyStreamingStateChanged();
              break;
            case 'STOP_STREAMING':
              console.log(`[Background] Stopping streaming for tab ${message.tabId}`);
              
              try {
                // 1. Arrêter la capture audio via le content script
                await this.sendMessageToWebRTC({
                  type: 'STOP_AUDIO_CAPTURE',
                  tabId: message.tabId
                });
                
                // 2. Déconnecter du bureau via WebRTC
                await this.sendMessageToWebRTC({
                  type: 'WEBRTC_DISCONNECT'
                });
                
                // Mettre à jour l'état
                this.state.isStreaming = false;
                this.state.activeTabId = null;
                this.state.stream = null;
                
                response = { success: true, data: { status: 'stopped' } };
                console.log('[Background] Streaming stopped successfully');
              } catch (error) {
                console.error('[Background] Error stopping streaming:', error);
                response = { 
                  success: false, 
                  error: `Failed to stop streaming: ${(error as Error).message}` 
                };
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
                console.log('[Background] Using real WebRTC content script relay');
                try {
                  const connectResponse = await this.sendMessageToWebRTC({
                    type: 'WEBRTC_CONNECT'
                  });
                  console.log('[Background] WebRTC connect response:', connectResponse);
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
    console.log(`[Background] Sending CAPTURE_TAB_AUDIO to tab ${tabId}`);
    
    // Envoyer le message au content script dans l'onglet cible
    const response = await this.sendMessageToWebRTC({
      type: 'CAPTURE_TAB_AUDIO',
      tabId: tabId
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to capture tab audio');
    }
    
    // Le flux audio est maintenant géré directement par le content script
    // via WebRTC, donc nous n'avons pas besoin de le retourner ici
    return new MediaStream();
  }

  // Relay message to content script in active tab with safe injection
  private async sendMessageToWebRTC(message: any): Promise<ResponseType> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        console.error('[Background] No active tab found');
        return { success: false, error: 'No active tab found' };
      }
      
      const activeTab = tabs[0];
      
      // Vérifier que c'est une vraie page web (http ou https)
      if (!activeTab.url || !/^https?:\/\//.test(activeTab.url)) {
        console.warn('[Background] Not a web page, cannot inject content script:', activeTab.url);
        return { 
          success: false, 
          error: 'Please open a real web page (http:// or https://) to enable audio capture.'
        };
      }
      
      console.log(`[Background] Preparing to send message to tab ${activeTab.id} (${activeTab.url})`);
      
      // Essayer d'abord d'envoyer le message directement
      try {
        console.log('[Background] Attempting to send message directly to content script');
        const response = await new Promise<ResponseType | null>((resolve) => {
          chrome.tabs.sendMessage(activeTab.id!, message, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[Background] Direct message failed, will try to inject script:', chrome.runtime.lastError);
              resolve(null);
            } else {
              resolve(response);
            }
          });
        });
        
        if (response) {
          console.log('[Background] Message delivered to existing content script');
          return response;
        }
      } catch (error) {
        console.warn('[Background] Error sending direct message, will try to inject script:', error);
      }
      
      // Si le message direct échoue, essayer d'injecter le script
      try {
        console.log('[Background] Injecting content script into tab:', activeTab.id);
        
        // Injecter le script de contenu
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id! },
          files: ['webrtc-content.js']
        });
        
        console.log('[Background] Content script injected, waiting for initialization...');
        
        // Attendre un peu pour que le script s'initialise
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Essayer d'envoyer le message après l'injection
        console.log('[Background] Sending message after script injection');
        return await new Promise<ResponseType>((resolve) => {
          chrome.tabs.sendMessage(activeTab.id!, message, (response) => {
            if (chrome.runtime.lastError) {
              console.error('[Background] Failed to send message after injection:', chrome.runtime.lastError);
              resolve({ 
                success: false, 
                error: `Failed to communicate with content script: ${chrome.runtime.lastError.message}`
              });
            } else {
              console.log('[Background] Message delivered after script injection');
              resolve(response);
            }
          });
        });
      } catch (error) {
        console.error('[Background] Error injecting content script:', error);
        return { 
          success: false, 
          error: `Failed to inject content script: ${(error as Error).message}`
        };
      }
    } catch (error) {
      console.error('[Background] Error in sendMessageToWebRTC:', error);
      return { 
        success: false, 
        error: `Unexpected error: ${(error as Error).message || 'Unknown error'}`
      };
    }
  }
}

// Initialize the manager
new AudioCaptureManager();