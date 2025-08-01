import { WebRTCService } from '../services/webrtc';
import { defaultWebRTCConfig } from '../config/webrtc.config';
import { defaultAudioConfig } from '../config/audio.config';

// Log de démarrage du script
console.log(`[WebRTC Content][${new Date().toISOString()}] Initializing WebRTC content script in ${window.location.href}`);

// Création de l'instance du service WebRTC
const webrtcService = new WebRTCService(defaultWebRTCConfig, defaultAudioConfig);

// Écoute des messages du script d'arrière-plan
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(`[WebRTC Content][${new Date().toISOString()}] Received message:`, message.type, message);
  
  // Gestion asynchrone des messages
  (async () => {
    try {
      switch (message.type) {
        case 'WEBRTC_CONNECT':
          console.log('[WebRTC Content] Connecting to desktop via WebRTC...');
          try {
            const connectionState = await webrtcService.connect();
            console.log('[WebRTC Content] Successfully connected to WebRTC service. State:', connectionState);
            sendResponse({ 
              success: true, 
              data: connectionState 
            });
          } catch (error) {
            console.error('[WebRTC Content] Failed to connect to WebRTC service:', error);
            sendResponse({ 
              success: false, 
              error: `Connection failed: ${(error as Error).message}` 
            });
          }
          break;

        case 'WEBRTC_SEND_AUDIO':
          console.log('[WebRTC Content] Starting tab audio capture...');
          try {
            chrome.tabCapture.capture({ 
              audio: true, 
              video: false 
            }, async (stream) => {
              if (chrome.runtime.lastError || !stream) {
                const errorMsg = chrome.runtime.lastError?.message || 'No stream received';
                console.error('[WebRTC Content] Error capturing tab audio:', errorMsg);
                sendResponse({ 
                  success: false, 
                  error: `Audio capture failed: ${errorMsg}` 
                });
                return;
              }
              
              console.log('[WebRTC Content] Successfully captured tab audio stream');
              
              try {
                const success = await webrtcService.sendAudioStream(stream);
                if (success) {
                  console.log('[WebRTC Content] Audio stream successfully sent to WebRTC service');
                  sendResponse({ 
                    success: true, 
                    data: { success: true } 
                  });
                } else {
                  console.error('[WebRTC Content] Failed to send audio stream to WebRTC service');
                  sendResponse({ 
                    success: false, 
                    error: 'Failed to send audio stream to WebRTC service' 
                  });
                }
              } catch (error) {
                console.error('[WebRTC Content] Error sending audio stream:', error);
                sendResponse({ 
                  success: false, 
                  error: `Error sending audio: ${(error as Error).message}` 
                });
              }
            });
          } catch (error) {
            console.error('[WebRTC Content] Unexpected error in WEBRTC_SEND_AUDIO:', error);
            sendResponse({ 
              success: false, 
              error: `Unexpected error: ${(error as Error).message}` 
            });
          }
          return true; // Indique que la réponse sera asynchrone

        case 'WEBRTC_SEND_CONTROL':
          console.log('[WebRTC Content] Sending control message:', message.data);
          try {
            const controlSuccess = webrtcService.sendControlMessage(message.data);
            console.log(`[WebRTC Content] Control message ${controlSuccess ? 'sent successfully' : 'failed to send'}`);
            sendResponse({ 
              success: controlSuccess, 
              data: { success: controlSuccess } 
            });
          } catch (error) {
            console.error('[WebRTC Content] Error sending control message:', error);
            sendResponse({ 
              success: false, 
              error: `Control message failed: ${(error as Error).message}` 
            });
          }
          break;

        case 'WEBRTC_DISCONNECT':
          console.log('[WebRTC Content] Disconnecting from desktop...');
          try {
            webrtcService.disconnect();
            console.log('[WebRTC Content] Successfully disconnected from WebRTC service');
            sendResponse({ 
              success: true, 
              data: { status: 'disconnected' } 
            });
          } catch (error) {
            console.error('[WebRTC Content] Error during disconnection:', error);
            sendResponse({ 
              success: false, 
              error: `Disconnection failed: ${(error as Error).message}` 
            });
          }
          break;

        case 'WEBRTC_GET_STATE':
          try {
            const state = webrtcService.getConnectionState();
            console.log('[WebRTC Content] Current connection state:', state);
            sendResponse({ 
              success: true, 
              data: state 
            });
          } catch (error) {
            console.error('[WebRTC Content] Error getting connection state:', error);
            sendResponse({ 
              success: false, 
              error: `Failed to get connection state: ${(error as Error).message}` 
            });
          }
          break;

        default:
          const warningMsg = `Unknown message type: ${message.type}`;
          console.warn(`[WebRTC Content] ${warningMsg}`, message);
          sendResponse({ 
            success: false, 
            error: warningMsg 
          });
      }
    } catch (error) {
      const errorMsg = `[WebRTC Content] Unexpected error in message handler: ${(error as Error).message}`;
      console.error(errorMsg, error);
      sendResponse({ 
        success: false, 
        error: errorMsg 
      });
    }
  })();
  
  // Retourne true pour indiquer que la réponse sera asynchrone
  return true;
});

// Log de fin d'initialisation
console.log(`[WebRTC Content][${new Date().toISOString()}] Content script initialization complete`); 