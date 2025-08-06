// This script will be injected into a page context where WebRTC APIs are available
import { WebRTCService } from '../services/webrtc';
import { defaultWebRTCConfig } from '../config/webrtc.config';
import { defaultAudioConfig } from '../config/audio.config';

// Create a global WebRTC service that can be accessed from the background script
(window as any).webrtcService = new WebRTCService(defaultWebRTCConfig, defaultAudioConfig);

console.log('[WebRTC Injector] WebRTC service created and available globally');

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[WebRTC Injector] Received message:', message.type);
  
  (async () => {
    try {
      const webrtcService = (window as any).webrtcService;
      
      switch (message.type) {
        case 'WEBRTC_CONNECT':
          console.log('[WebRTC Injector] Connecting to WebRTC service...');
          const connectionState = await webrtcService.connect();
          console.log('[WebRTC Injector] Connection result:', connectionState);
          sendResponse({ success: true, data: connectionState });
          break;
          
        case 'WEBRTC_SEND_AUDIO':
          console.log('[WebRTC Injector] Sending audio stream...');
          console.log('[WebRTC Injector] Stream details:', message.stream);
          const success = await webrtcService.sendAudioStream(message.stream);
          console.log('[WebRTC Injector] Audio stream result:', success);
          sendResponse({ success, data: { success } });
          break;
          
        case 'WEBRTC_SEND_CONTROL':
          console.log('[WebRTC Injector] Sending control message...');
          const controlSuccess = webrtcService.sendControlMessage(message.data);
          sendResponse({ success: controlSuccess, data: { success: controlSuccess } });
          break;
          
        case 'WEBRTC_DISCONNECT':
          console.log('[WebRTC Injector] Disconnecting...');
          webrtcService.disconnect();
          sendResponse({ success: true, data: { status: 'disconnected' } });
          break;
          
        case 'WEBRTC_GET_STATE':
          const state = webrtcService.getConnectionState();
          sendResponse({ success: true, data: state });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[WebRTC Injector] Error:', error);
      sendResponse({ success: false, error: (error as Error).message || 'Unknown error' });
    }
  })();
  
  return true; // Keep message channel open for async response
}); 