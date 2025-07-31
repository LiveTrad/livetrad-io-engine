import { WebRTCService } from '../services/webrtc';
import { defaultWebRTCConfig } from '../config/webrtc.config';
import { defaultAudioConfig } from '../config/audio.config';

class WebRTCContentScript {
  private webrtcService: WebRTCService;
  private isInitialized = false;

  constructor() {
    this.webrtcService = new WebRTCService(defaultWebRTCConfig, defaultAudioConfig);
    this.initialize();
  }

  private initialize(): void {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
      return true; // Keep message channel open for async response
    });

    console.log('[WebRTC Content] Content script initialized');
  }

  private async handleMessage(message: any, sendResponse: (response: any) => void): Promise<void> {
    try {
      switch (message.type) {
        case 'WEBRTC_CONNECT':
          console.log('[WebRTC Content] Connecting to desktop...');
          const connectionState = await this.webrtcService.connect();
          sendResponse({ success: true, data: connectionState });
          break;

        case 'WEBRTC_SEND_AUDIO':
          console.log('[WebRTC Content] Sending audio stream...');
          try {
            // Ask background script to capture the tab audio
            const stream = await new Promise<MediaStream>((resolve, reject) => {
              chrome.runtime.sendMessage({
                type: 'CAPTURE_TAB_AUDIO',
                tabId: message.tabId
              }, (response) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                  // The stream will be passed via a different mechanism
                  // For now, we'll create a dummy stream to test the connection
                  navigator.mediaDevices.getUserMedia({ audio: true }).then(resolve).catch(reject);
                } else {
                  reject(new Error('Failed to capture tab audio'));
                }
              });
            });
            
            const success = await this.webrtcService.sendAudioStream(stream);
            sendResponse({ success, data: { success } });
          } catch (error) {
            console.error('[WebRTC Content] Error getting audio stream:', error);
            sendResponse({ success: false, error: (error as Error).message });
          }
          break;

        case 'WEBRTC_SEND_CONTROL':
          console.log('[WebRTC Content] Sending control message...');
          const controlSuccess = this.webrtcService.sendControlMessage(message.data);
          sendResponse({ success: controlSuccess, data: { success: controlSuccess } });
          break;

        case 'WEBRTC_DISCONNECT':
          console.log('[WebRTC Content] Disconnecting...');
          this.webrtcService.disconnect();
          sendResponse({ success: true, data: { status: 'disconnected' } });
          break;

        case 'WEBRTC_GET_STATE':
          const state = this.webrtcService.getConnectionState();
          sendResponse({ success: true, data: state });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
         } catch (error) {
       console.error('[WebRTC Content] Error handling message:', error);
       sendResponse({ success: false, error: (error as Error).message || 'Unknown error' });
     }
  }
}

// Initialize the content script
new WebRTCContentScript(); 