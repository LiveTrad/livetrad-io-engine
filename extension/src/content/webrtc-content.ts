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
    const logContext = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        context: 'content-script'
    };
    
    try {
        console.log('[WebRTC Content] Starting tab audio capture...', logContext);
        
        // Vérifier si l'API tabCapture est disponible
        if (typeof chrome.tabCapture === 'undefined') {
            const error = new Error('chrome.tabCapture is not available in this context. Make sure the tabCapture permission is set in manifest.json');
            console.error('[WebRTC Content] Tab capture API not available:', {
                ...logContext,
                error: error.message,
                availableAPIs: Object.keys(chrome).join(','),
                permissions: chrome.runtime.getManifest().permissions
            });
            throw error;
        }
        
        // Obtenir l'ID de l'onglet actuel
        console.log('[WebRTC Content] Querying active tab...', logContext);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
            const error = new Error('Could not get active tab');
            console.error('[WebRTC Content] No active tab found:', { ...logContext, error: error.message });
            throw error;
        }
        
        // Mettre à jour le contexte avec les infos de l'onglet
        const tabContext = {
            ...logContext,
            tabId: tab.id,
            tabUrl: tab.url,
            tabTitle: tab.title,
            tabAudible: tab.audible,
            tabMuted: tab.mutedInfo?.muted
        };
        
        console.log(`[WebRTC Content] Capturing audio from tab`, tabContext);
        
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
        
        console.log('[WebRTC Content] Capture options:', {
            ...tabContext,
            captureOptions: {
                ...captureOptions,
                // Ne pas logger les IDs complets pour des raisons de confidentialité
                audioConstraints: {
                    mandatory: {
                        chromeMediaSource: captureOptions.audioConstraints.mandatory.chromeMediaSource,
                        chromeMediaSourceId: '***redacted***'
                    }
                }
            }
        });
        
        // Démarrer la capture
        const stream = await new Promise<MediaStream>((resolve, reject) => {
            const captureStartTime = Date.now();
            console.log('[WebRTC Content] Starting tab capture...', { ...tabContext, captureStartTime });
            
            chrome.tabCapture.capture(captureOptions, (stream) => {
                const captureEndTime = Date.now();
                const captureDuration = captureEndTime - captureStartTime;
                
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
                    const errorDetails = {
                        ...tabContext,
                        error: errorMsg,
                        captureDuration,
                        chromeRuntimeError: chrome.runtime.lastError,
                        timestamp: new Date().toISOString()
                    };
                    console.error('[WebRTC Content] Tab capture error:', errorDetails);
                    reject(new Error(`Tab capture failed after ${captureDuration}ms: ${errorMsg}`));
                    return;
                } 
                
                if (!stream) {
                    const error = new Error('No audio stream received from tab capture');
                    console.error('[WebRTC Content] No stream received from tab capture', {
                        ...tabContext,
                        error: error.message,
                        captureDuration,
                        timestamp: new Date().toISOString()
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
                
                console.log('[WebRTC Content] Tab capture started successfully', {
                    ...tabContext,
                    captureDuration,
                    audioTracks: trackInfo,
                    streamId: stream.id,
                    active: stream.active,
                    timestamp: new Date().toISOString()
                });
                
                resolve(stream);
            });
        });
        
        // Stocker le flux pour pouvoir l'arrêter plus tard
        currentStream = stream;
        const streamId = stream.id;
        
        // Ajouter des gestionnaires d'événements pour les pistes audio
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach((track, index) => {
            const trackId = track.id;
            const logTrackEvent = (eventName: string, eventData = {}) => {
                console.log(`[WebRTC Content] Audio track ${index} ${eventName}`, {
                    ...tabContext,
                    streamId,
                    trackId: trackId.substring(0, 8) + '...', // Ne pas logger l'ID complet
                    eventName,
                    trackState: {
                        enabled: track.enabled,
                        muted: track.muted,
                        readyState: track.readyState,
                        settings: track.getSettings()
                    },
                    timestamp: new Date().toISOString(),
                    ...eventData
                });
            };
            
            track.onended = () => {
                logTrackEvent('ended');
                // Nettoyer les références
                if (currentStream === stream) {
                    console.log('[WebRTC Content] Cleaning up currentStream reference');
                    currentStream = null;
                }
            };
            
            track.onmute = () => {
                logTrackEvent('muted');
                // Tenter de réactiver la piste si elle est muette
                if (track.muted) {
                    console.warn('[WebRTC Content] Track was muted, attempting to enable...');
                    try {
                        // On ne peut pas modifier directement 'muted' car c'est en lecture seule
                        // On active simplement la piste
                        track.enabled = true;
                        logTrackEvent('enable_attempt');
                    } catch (error) {
                        console.error('[WebRTC Content] Failed to enable track:', error);
                    }
                }
            };
            
            track.onunmute = () => {
                logTrackEvent('unmuted');
            };
            
            // Gestion des erreurs via l'événement 'ended' et le suivi de l'état
            // Note: onerror n'est pas un événement standard pour MediaStreamTrack
            
            // Log initial track state
            logTrackEvent('added');
        });
        
        console.log('[WebRTC Content] Audio capture fully initialized', {
            ...tabContext,
            streamId,
            audioTrackCount: audioTracks.length,
            timestamp: new Date().toISOString()
        });
        
        return stream;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorDetails = {
            ...logContext,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString()
        };
        
        console.error('[WebRTC Content] Error in captureTabAudio:', errorDetails);
        
        // Nettoyer les ressources en cas d'erreur
        try {
            if (currentStream) {
                currentStream.getTracks().forEach(track => {
                    try {
                        track.stop();
                        console.log('[WebRTC Content] Stopped audio track during error cleanup');
                    } catch (trackError) {
                        console.error('[WebRTC Content] Error stopping track during cleanup:', trackError);
                    }
                });
                currentStream = null;
            }
        } catch (cleanupError) {
            console.error('[WebRTC Content] Error during cleanup after capture error:', cleanupError);
        }
        
        // Relancer l'erreur avec plus de contexte
        const enhancedError = new Error(`Tab audio capture failed: ${errorMessage}`);
        if (error instanceof Error) {
            enhancedError.stack = error.stack;
        }
        throw enhancedError;
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
                case 'WEBRTC_SEND_AUDIO_STREAM':
                    try {
                        console.log('[WebRTC Content] Received request to send audio stream to WebRTC');
                        
                        // Nous ne pouvons pas recevoir le stream directement du background script
                        // Nous devons capturer l'audio nous-mêmes
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
                        console.error('[WebRTC Content] Error in WEBRTC_SEND_AUDIO_STREAM:', error);
                        sendResponse({ 
                            success: false, 
                            error: `Failed to send audio stream to WebRTC: ${(error as Error).message}` 
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