import { WebRTCService } from '../services/webrtc';
import { defaultWebRTCConfig } from '../config/webrtc.config';
import { defaultAudioConfig } from '../config/audio.config';

// Log de démarrage du script
console.log(`[WebRTC Content][${new Date().toISOString()}] Initializing WebRTC content script in ${window.location.href}`);

// Déclaration de la variable pour le service WebRTC
// Elle sera initialisée uniquement quand nécessaire via getOrCreateWebRTCService()
let webrtcService: WebRTCService | null = null;
let currentStream: MediaStream | null = null;

// Fonction pour initialiser le service WebRTC uniquement quand nécessaire
function getOrCreateWebRTCService(): WebRTCService {
    // Si le service n'existe pas, le créer
    if (!webrtcService) {
        console.log('[WebRTC Content] Creating new WebRTC service instance');
        webrtcService = new WebRTCService(defaultWebRTCConfig, defaultAudioConfig);
        
        // Ajouter un gestionnaire d'erreur global pour le service
        webrtcService.on('error', (error: Error) => {
            console.error('[WebRTC Content] WebRTC service error:', error);
            // Nettoyer les références en cas d'erreur critique
            const service = webrtcService; // Garder une référence locale
            webrtcService = null;
            currentStream = null;
            
            // Nettoyer le service de manière synchrone
            try {
                if (service) {
                    service.disconnect();
                    console.log('[WebRTC Content] WebRTC service disconnected during cleanup');
                }
            } catch (e) {
                console.error('[WebRTC Content] Error during cleanup:', e);
            }
        });
        
        webrtcService.on('disconnected', () => {
            console.log('[WebRTC Content] WebRTC service disconnected event received');
            // Ne pas réinitialiser webrtcService ici pour permettre les reconnexions
            if (currentStream) {
                currentStream.getTracks().forEach(track => {
                    console.log('[WebRTC Content] Stopping audio track due to disconnection');
                    track.stop();
                });
                currentStream = null;
            }
        });
    }
    
    // À ce stade, webrtcService ne peut pas être null car nous venons de le créer ou il existait déjà
    return webrtcService!;
}

// Fonction pour capturer l'audio de l'onglet
async function captureTabAudio() {
    try {
        console.log('[WebRTC Content] Starting tab audio capture...');
        
        // Vérifier si l'API tabCapture est disponible
        if (typeof chrome.tabCapture === 'undefined') {
            throw new Error('chrome.tabCapture is not available in this context. Make sure the tabCapture permission is set in manifest.json');
        }
        
        // Obtenir l'ID de l'onglet actuel
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
            throw new Error('Could not get active tab');
        }
        
        console.log(`[WebRTC Content] Capturing audio from tab ${tab.id} (${tab.url})`);
        
        // Créer les options de capture
        const captureOptions = {
            audio: true,
            video: false,
            audioConstraints: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: tab.id.toString()
                }
            }
        };
        
        console.log('[WebRTC Content] Capture options:', captureOptions);
        
        // Démarrer la capture
        const stream = await new Promise<MediaStream>((resolve, reject) => {
            chrome.tabCapture.capture(captureOptions, (stream) => {
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
                    console.error('[WebRTC Content] Tab capture error:', errorMsg);
                    reject(new Error(`Tab capture failed: ${errorMsg}`));
                } else if (!stream) {
                    console.error('[WebRTC Content] No stream received from tab capture');
                    reject(new Error('No audio stream received from tab capture'));
                } else {
                    console.log('[WebRTC Content] Tab capture started successfully');
                    resolve(stream);
                }
            });
        });
        
        // Stocker le flux pour pouvoir l'arrêter plus tard
        currentStream = stream;
        
        // Ajouter un gestionnaire d'erreur pour le flux
        stream.getAudioTracks().forEach(track => {
            track.onended = () => {
                console.log('[WebRTC Content] Audio track ended');
                // Nettoyer les références
                if (currentStream === stream) {
                    currentStream = null;
                }
            };
            
            track.onmute = () => {
                console.warn('[WebRTC Content] Audio track was muted');
            };
            
            track.onunmute = () => {
                console.log('[WebRTC Content] Audio track was unmuted');
            };
        });
        
        return stream;
    } catch (error) {
        console.error('[WebRTC Content] Error in captureTabAudio:', error);
        // Nettoyer en cas d'erreur
        currentStream = null;
        throw error;
    }
}

// Fonction pour arrêter la capture audio
function stopAudioCapture() {
    if (currentStream) {
        console.log('[WebRTC Content] Stopping audio capture');
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

// Écoute des messages du script d'arrière-plan et de la sidebar
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    console.log(`[WebRTC Content][${new Date().toISOString()}] Received message:`, message.type, message);
    
    // Gestion asynchrone des messages
    (async () => {
        try {
            // Vérifier que le message a un type
            if (!message || typeof message !== 'object' || !message.type) {
                console.warn('[WebRTC Content] Received invalid message format');
                sendResponse({ success: false, error: 'Invalid message format' });
                return;
            }
            switch (message.type) {
                case 'CAPTURE_TAB_AUDIO':
                    try {
                        console.log('[WebRTC Content] Received request to capture tab audio');
                        const stream = await captureTabAudio();
                        
                        // Envoyer le flux audio au service WebRTC
                        const service = getOrCreateWebRTCService();
                        const success = await service.sendAudioStream(stream);
                        
                        if (success) {
                            console.log('[WebRTC Content] Successfully sent audio stream to WebRTC service');
                            sendResponse({ success: true });
                        } else {
                            console.error('[WebRTC Content] Failed to send audio stream to WebRTC service');
                            sendResponse({ 
                                success: false, 
                                error: 'Failed to send audio stream to WebRTC service' 
                            });
                        }
                    } catch (error) {
                        console.error('[WebRTC Content] Error in CAPTURE_TAB_AUDIO:', error);
                        sendResponse({ 
                            success: false, 
                            error: `Failed to capture tab audio: ${(error as Error).message}` 
                        });
                    }
                    break;
                    
                case 'WEBRTC_SEND_AUDIO':
                    try {
                        console.log('[WebRTC Content] Starting audio streaming...');
                        const stream = await captureTabAudio();
                        const service = getOrCreateWebRTCService();
                        const success = await service.sendAudioStream(stream);
                        if (success) {
                            console.log('[WebRTC Content] Audio streaming started successfully');
                            sendResponse({ success: true });
                        } else {
                            throw new Error('Failed to start audio streaming');
                        }
                    } catch (error) {
                        console.error('[WebRTC Content] Error starting audio streaming:', error);
                        sendResponse({ 
                            success: false, 
                            error: `Failed to start audio streaming: ${(error as Error).message}` 
                        });
                    }
                    break;
                    
                case 'STOP_AUDIO_CAPTURE':
                    try {
                        console.log('[WebRTC Content] Stopping audio capture');
                        stopAudioCapture();
                        sendResponse({ success: true });
                    } catch (error) {
                        console.error('[WebRTC Content] Error stopping audio capture:', error);
                        sendResponse({ 
                            success: false, 
                            error: `Failed to stop audio capture: ${(error as Error).message}` 
                        });
                    }
                    break;
                    
                case 'WEBRTC_DISCONNECT':
                    try {
                        console.log('[WebRTC Content] Disconnecting from WebRTC...');
                        if (webrtcService) {
                            await webrtcService.disconnect();
                            console.log('[WebRTC Content] Successfully disconnected from WebRTC service');
                            sendResponse({ success: true });
                        } else {
                            console.log('[WebRTC Content] No active WebRTC connection to disconnect');
                            sendResponse({ success: true });
                        }
                    } catch (error) {
                        console.error('[WebRTC Content] Error disconnecting from WebRTC:', error);
                        sendResponse({ 
                            success: false, 
                            error: `Failed to disconnect: ${(error as Error).message}` 
                        });
                    }
                    break;
                    
                case 'WEBRTC_CONNECT':
                    try {
                        const service = getOrCreateWebRTCService();
                        const connectionState = await service.connect();
                        console.log('[WebRTC Content] Successfully connected to WebRTC service. State:', connectionState);
                        sendResponse({ 
                            success: true, 
                            state: connectionState 
                        });
                    } catch (error) {
                        console.error('[WebRTC Content] Error connecting to WebRTC:', error);
                        sendResponse({ 
                            success: false, 
                            error: `Failed to connect: ${(error as Error).message}` 
                        });
                    }
                    break;

        case 'WEBRTC_GET_STATE':
            try {
                if (!webrtcService) {
                    // Si le service n'est pas encore initialisé, retourner un état par défaut
                    console.log('[WebRTC Content] WebRTC service not yet initialized');
                    sendResponse({ 
                        success: true, 
                        state: {
                            connected: false,
                            iceConnectionState: 'new',
                            connectionState: 'new',
                            signalingState: 'stable',
                            error: 'WebRTC service not initialized'
                        }
                    });
                } else {
                    const state = webrtcService.getConnectionState();
                    console.log('[WebRTC Content] Current connection state:', state);
                    sendResponse({ 
                        success: true, 
                        state 
                    });
                }
            } catch (error) {
                console.error('[WebRTC Content] Error getting connection state:', error);
                sendResponse({ 
                    success: false, 
                    error: `Failed to get connection state: ${(error as Error).message}` 
                });
            }
            break;

        case 'WEBRTC_SEND_AUDIO':
          // Cette méthode est obsolète, utiliser CAPTURE_TAB_AUDIO à la place
          console.warn('[WebRTC Content] WEBRTC_SEND_AUDIO is deprecated, use CAPTURE_TAB_AUDIO instead');
          sendResponse({
            success: false,
            error: 'WEBRTC_SEND_AUDIO is deprecated, use CAPTURE_TAB_AUDIO instead'
          });
          break;

        case 'WEBRTC_SEND_CONTROL':
          console.log('[WebRTC Content] Sending control message:', message.data);
          try {
            const service = getOrCreateWebRTCService();
            if (!service) {
              throw new Error('Failed to initialize WebRTC service');
            }
            
            const controlSuccess = service.sendControlMessage(message.data);
            console.log(`[WebRTC Content] Control message ${controlSuccess ? 'sent successfully' : 'failed to send'}`);
            sendResponse({ 
              success: controlSuccess, 
              data: { success: controlSuccess } 
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[WebRTC Content] Error sending control message:', errorMessage);
            sendResponse({ 
              success: false, 
              error: `Control message failed: ${errorMessage}` 
            });
          }
          break;

        case 'WEBRTC_DISCONNECT':
          console.log('[WebRTC Content] Disconnecting from desktop...');
          try {
            if (!webrtcService) {
              console.log('[WebRTC Content] No active WebRTC connection to disconnect');
              sendResponse({ 
                success: true, 
                data: { status: 'disconnected' } 
              });
              return;
            }
            
            webrtcService.disconnect();
            console.log('[WebRTC Content] Successfully disconnected from WebRTC service');
            sendResponse({ 
              success: true, 
              data: { status: 'disconnected' } 
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[WebRTC Content] Error during disconnection:', errorMessage);
            sendResponse({ 
              success: false, 
              error: `Disconnection failed: ${errorMessage}` 
            });
          }
          break;

        case 'WEBRTC_GET_STATE':
          try {
            if (!webrtcService) {
              console.log('[WebRTC Content] WebRTC service not initialized, returning default state');
              sendResponse({
                success: true,
                data: {
                  connected: false,
                  iceConnectionState: 'new',
                  connectionState: 'new',
                  signalingState: 'stable',
                  error: 'WebRTC service not initialized'
                }
              });
              return;
            }
            
            const state = webrtcService.getConnectionState();
            console.log('[WebRTC Content] Current connection state:', state);
            sendResponse({ 
              success: true, 
              data: state 
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[WebRTC Content] Error getting connection state:', errorMessage);
            sendResponse({ 
              success: false, 
              error: `Failed to get connection state: ${errorMessage}` 
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