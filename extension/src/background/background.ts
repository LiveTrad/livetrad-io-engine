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
      (async () => {
        try {
          let response: ResponseType;
          
          switch (message.type) {
            case 'START_STREAMING':
              console.log(`[Background] Starting streaming for tab ${message.tabId}`);
              this.activeTabId = message.tabId;
              
              try {
                // 1. Capturer l'audio depuis le background script
                const stream = await this.captureTabAudio(message.tabId);
                console.log('[Background] Audio capture started successfully');
                
                // 2. Envoyer le stream au content script pour traitement WebRTC
                const streamResponse = await this.sendMessageToContentScript({
                  type: 'WEBRTC_SEND_AUDIO_STREAM',
                  stream: stream
                });
                
                if (!streamResponse.success) {
                  throw new Error(streamResponse.error || 'Failed to send audio stream to WebRTC');
                }
                
                console.log('[Background] Audio stream sent successfully to content script');
                
                // Mettre à jour l'état
                this.state.isStreaming = true;
                this.state.activeTabId = message.tabId;
                this.state.stream = stream;
                
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
              
            case 'WEBRTC_SEND_AUDIO_STREAM':
              console.log(`[Background] Sending audio stream to WebRTC for tab ${message.tabId}`);
              
              try {
                // Envoyer le stream au content script pour traitement WebRTC
                const streamResponse = await this.sendMessageToContentScript({
                  type: 'WEBRTC_SEND_AUDIO_STREAM'
                });
                
                if (!streamResponse.success) {
                  throw new Error(streamResponse.error || 'Failed to send audio stream to WebRTC');
                }
                
                console.log('[Background] Audio stream sent successfully to WebRTC');
                
                // Mettre à jour l'état
                this.state.isStreaming = true;
                this.state.activeTabId = message.tabId;
                this.state.stream = message.stream;
                
                response = { success: true, data: { success: true } };
              } catch (error) {
                console.error('[Background] Error sending audio stream:', error);
                response = { 
                  success: false, 
                  error: `Failed to send audio stream: ${(error as Error).message}` 
                };
              }
              
              this.notifyStreamingStateChanged();
              break;
            case 'STOP_STREAMING':
              console.log(`[Background] Stopping streaming for tab ${message.tabId}`);
              
              try {
                // 1. Envoyer message d'arrêt au content script
                await this.sendMessageToContentScript({
                  type: 'STOP_AUDIO_CAPTURE'
                });
                
                // 2. Déconnecter WebRTC
                await this.sendMessageToContentScript({
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
                console.log('[Background] Using WebRTC connection via content script');
                try {
                  const connectResponse = await this.sendMessageToContentScript({
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
                await this.sendMessageToContentScript({
                  type: 'WEBRTC_DISCONNECT'
                });
                response = { success: true, data: { status: 'disconnected' } };
              } else {
                this.audioCaptureService.disconnectFromDesktop();
                response = { success: true, data: { status: 'disconnected' } };
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
    console.log(`[Background] Capturing tab audio for tab ${tabId}`);
    
    try {
      // Vérifier si l'API tabCapture est disponible
      if (typeof chrome.tabCapture === 'undefined') {
        throw new Error('chrome.tabCapture is not available in this context. Make sure the tabCapture permission is set in manifest.json');
      }
      
      // Obtenir les informations de l'onglet
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        throw new Error('Could not get tab information');
      }
      
      // Vérifier si c'est une URL restreinte
      const restrictedUrls = ['chrome://', 'chrome-extension://', 'edge://', 'about:'];
      if (restrictedUrls.some(prefix => tab.url?.startsWith(prefix))) {
        throw new Error('This page cannot be captured due to browser security restrictions.');
      }
      
      console.log(`[Background] Capturing audio from tab ${tabId} (${tab.url})`);
      
      // Créer les options de capture
      const captureOptions = {
        audio: true,
        video: false,
        audioConstraints: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: tabId.toString()
          }
        }
      };
      
      // Démarrer la capture
      const stream = await new Promise<MediaStream>((resolve, reject) => {
        const captureStartTime = Date.now();
        console.log('[Background] Starting tab capture...', { tabId, captureStartTime });
        
        chrome.tabCapture.capture(captureOptions, (stream) => {
          const captureEndTime = Date.now();
          const captureDuration = captureEndTime - captureStartTime;
          
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
            console.error('[Background] Tab capture error:', {
              tabId,
              error: errorMsg,
              captureDuration,
              chromeRuntimeError: chrome.runtime.lastError
            });
            reject(new Error(`Tab capture failed after ${captureDuration}ms: ${errorMsg}`));
            return;
          } 
          
          if (!stream) {
            const error = new Error('No audio stream received from tab capture');
            console.error('[Background] No stream received from tab capture', {
              tabId,
              error: error.message,
              captureDuration
            });
            reject(error);
            return;
          }
          
          // Vérifier les pistes audio
          const audioTracks = stream.getAudioTracks();
          const trackInfo = audioTracks.map(track => ({
            id: track.id,
            kind: track.kind,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
          }));
          
          console.log('[Background] Tab capture started successfully', {
            tabId,
            captureDuration,
            audioTracks: trackInfo,
            streamId: stream.id,
            active: stream.active
          });
          
          resolve(stream);
        });
      });
      
      return stream;
    } catch (error) {
      console.error('[Background] Error in captureTabAudio:', error);
      throw error;
    }
  }


  // Relay message to content script in active tab with safe injection
  private async sendMessageToContentScript(message: any): Promise<ResponseType> {
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
      console.error('[Background] Error in sendMessageToContentScript:', error);
      return { 
        success: false, 
        error: `Unexpected error: ${(error as Error).message || 'Unknown error'}`
      };
    }
  }


}

// Initialize the manager
new AudioCaptureManager();