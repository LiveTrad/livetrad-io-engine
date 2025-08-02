import { EventEmitter } from 'events';
import { ConnectionState } from '../types';
import { WebRTCConfig, defaultWebRTCConfig } from '../config/webrtc.config';
import { AudioConfig, defaultAudioConfig } from '../config/audio.config';
import { logger } from '../utils/logger';

export interface WebRTCConnectionState extends ConnectionState {
  iceConnectionState: RTCIceConnectionState;
  connectionState: RTCPeerConnectionState;
  signalingState: RTCSignalingState;
}

export interface WebRTCMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'control';
  data: any;
}

export class WebRTCService extends EventEmitter {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private config: WebRTCConfig;
  private audioConfig: AudioConfig;
  private signalingWebSocket: WebSocket | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private iceGatheringTimeout: NodeJS.Timeout | null = null;
  private connectionStartTime: number = 0;
  private lastIceState: RTCIceConnectionState | null = null;
  private iceRestartAttempts: number = 0;
  private maxIceRestartAttempts: number = 3;

  constructor(config: WebRTCConfig = defaultWebRTCConfig, audioConfig: AudioConfig = defaultAudioConfig) {
    super();
    this.config = config;
    this.audioConfig = audioConfig;
  }

  public async connect(): Promise<WebRTCConnectionState> {
    return new Promise((resolve, reject) => {
      try {
        this.connectionStartTime = Date.now();
        this.isConnecting = true;
        this.iceRestartAttempts = 0;
        
        logger.info('WebRTC', `Connecting to signaling server: ${this.config.signalingUrl}`);
        
        // Connect to signaling server first
        this.signalingWebSocket = new WebSocket(this.config.signalingUrl);
        
        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.signalingWebSocket?.readyState !== WebSocket.OPEN) {
            const error = new Error('Signaling server connection timeout');
            logger.error('WebRTC', 'Signaling connection timeout');
            this.cleanup();
            reject(error);
          }
        }, 10000); // 10 second timeout
        
        this.signalingWebSocket.onopen = async () => {
          clearTimeout(connectionTimeout);
          const connectionTime = Date.now() - this.connectionStartTime;
          logger.info('WebRTC', `Signaling connection established in ${connectionTime}ms`);
          
          try {
            await this.initializePeerConnection();
            resolve(this.getConnectionState());
          } catch (error) {
            logger.errorWithDetails('WebRTC', error, { phase: 'initializePeerConnection' });
            this.cleanup();
            reject(error);
          }
        };

        this.signalingWebSocket.onclose = () => {
          console.log('[WebRTC] Signaling connection closed');
          this.handleDisconnect();
        };

        this.signalingWebSocket.onerror = (error) => {
          console.error('[WebRTC] Signaling error:', error);
          reject(error);
        };

        this.signalingWebSocket.onmessage = (event) => {
          this.handleSignalingMessage(JSON.parse(event.data));
        };

      } catch (error) {
        console.error('[WebRTC] Failed to connect:', error);
        reject(error);
      }
    });
  }

  private async initializePeerConnection(): Promise<void> {
    try {
      // Créer une configuration sécurisée pour la connexion
      const connectionConfig: RTCConfiguration = {
        iceServers: this.config.iceServers || [],
        iceTransportPolicy: this.config.iceTransportPolicy || 'all',
        bundlePolicy: this.config.bundlePolicy || 'max-bundle',
        rtcpMuxPolicy: this.config.rtcpMuxPolicy || 'require',
        iceCandidatePoolSize: this.config.iceCandidatePoolSize || 10,
        // sdpSemantics est une propriété non standard, nous l'utilisons via une assertion de type
        ...(this.config.sdpSemantics ? { sdpSemantics: this.config.sdpSemantics as RTCSdpType } : {})
      };

      // Journalisation de la configuration (masquage des informations sensibles)
      const logConfig = {
        ...connectionConfig,
        iceServers: connectionConfig.iceServers?.map(s => ({
          ...s,
          credential: s.credential ? '***' : undefined,
          // Masquer également le nom d'utilisateur s'il est présent
          username: s.username ? '***' : undefined
        }))
      };
      
      logger.info('WebRTC', 'Initializing peer connection with config:', logConfig);

      // Créer une nouvelle connexion RTCPeerConnection
      this.peerConnection = new RTCPeerConnection(connectionConfig);
      
      // Si sdpSemantics est défini, nous devons peut-être le définir après la création
      // car ce n'est pas une propriété standard de RTCConfiguration
      if (this.config.sdpSemantics && 'sdpSemantics' in this.peerConnection) {
        (this.peerConnection as any).sdpSemantics = this.config.sdpSemantics;
      }
      
      // Suivi de l'état de collecte ICE
      const gatheringStartTime = Date.now();
      const iceGatheringTimeoutMs = 10000; // 10 secondes de timeout pour la collecte ICE
      
      // Configurer la gestion des candidats ICE avec journalisation détaillée
      this.peerConnection.onicecandidate = (event) => {
        const elapsed = Date.now() - gatheringStartTime;
        
        if (event.candidate) {
          const candidate = event.candidate;
          const candidateInfo = {
            protocol: candidate.protocol || 'unknown',
            type: candidate.type || 'unknown',
            address: candidate.address || 'unknown',
            port: candidate.port || 0,
            candidateType: candidate.candidate ? (candidate.candidate.split(' ')[7] || 'unknown') : 'unknown',
            component: candidate.component === 1 ? 'RTP' : 'RTCP'
          };
          
          logger.debug('WebRTC', `New ICE candidate (${elapsed}ms):`, candidateInfo);
          
          // Réinitialiser le timeout à chaque nouveau candidat
          if (this.iceGatheringTimeout) {
            clearTimeout(this.iceGatheringTimeout);
          }
          
          this.iceGatheringTimeout = setTimeout(() => {
            logger.warn('WebRTC', `ICE gathering taking too long (${elapsed}ms), may indicate network issues`);
          }, iceGatheringTimeoutMs);
          
          // Envoyer le candidat au pair distant
          if (this.signalingWebSocket?.readyState === WebSocket.OPEN) {
            this.signalingWebSocket.send(JSON.stringify({
              type: 'ice-candidate',
              data: candidate.toJSON()
            }));
          } else {
            logger.warn('WebRTC', 'Cannot send ICE candidate: WebSocket not open');
          }
        } else {
          // Tous les candidats ICE ont été collectés
          if (this.iceGatheringTimeout) {
            clearTimeout(this.iceGatheringTimeout);
            this.iceGatheringTimeout = null;
          }
          
          logger.info('WebRTC', `All ICE candidates gathered in ${elapsed}ms`);
          
          // Vérifier l'état de la connexion après la collecte
          this.checkConnectionHealth();
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE connection state:', this.peerConnection?.iceConnectionState);
        this.emitConnectionStateChange();
      };

      this.peerConnection.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', this.peerConnection?.connectionState);
        this.emitConnectionStateChange();
      };

      this.peerConnection.onsignalingstatechange = () => {
        console.log('[WebRTC] Signaling state:', this.peerConnection?.signalingState);
        this.emitConnectionStateChange();
      };

      // Create data channel for control messages
      this.dataChannel = this.peerConnection.createDataChannel('control', {
        ordered: true,
        maxRetransmits: 3
      });

      this.dataChannel.onopen = () => {
        console.log('[WebRTC] Data channel opened');
      };

      this.dataChannel.onclose = () => {
        console.log('[WebRTC] Data channel closed');
      };

      this.dataChannel.onerror = (error) => {
        console.error('[WebRTC] Data channel error:', error);
      };

      // Create and send offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await this.peerConnection.setLocalDescription(offer);
      
      this.sendSignalingMessage({
        type: 'offer',
        data: offer
      });

    } catch (error) {
      console.error('[WebRTC] Failed to initialize peer connection:', error);
      throw error;
    }
  }

  private handleSignalingMessage(message: WebRTCMessage): void {
    if (!this.peerConnection) return;

    switch (message.type) {
      case 'answer':
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
        break;
      case 'ice-candidate':
        this.peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
        break;
      default:
        console.warn('[WebRTC] Unknown signaling message type:', message.type);
    }
  }

  private sendSignalingMessage(message: WebRTCMessage): void {
    if (this.signalingWebSocket?.readyState === WebSocket.OPEN) {
      this.signalingWebSocket.send(JSON.stringify(message));
    }
  }

  public async sendAudioStream(stream: MediaStream): Promise<boolean> {
    if (!this.peerConnection || this.peerConnection.connectionState !== 'connected') {
      console.warn('[WebRTC] Cannot send audio: peer connection not ready');
      return false;
    }

    try {
      // Add audio track to peer connection
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        this.peerConnection.addTrack(audioTrack, stream);
        console.log('[WebRTC] Audio track added to peer connection');
        return true;
      }
      return false;
    } catch (error) {
      console.error('[WebRTC] Error sending audio stream:', error);
      return false;
    }
  }

  public sendControlMessage(message: any): boolean {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public getConnectionState(): WebRTCConnectionState {
    return {
      status: this.peerConnection?.connectionState === 'connected' ? 'connected' : 
             this.isConnecting ? 'connecting' : 'disconnected',
      desktopUrl: this.config.signalingUrl,
      iceConnectionState: this.peerConnection?.iceConnectionState || 'new',
      connectionState: this.peerConnection?.connectionState || 'new',
      signalingState: this.peerConnection?.signalingState || 'stable'
    };
  }

  private emitConnectionStateChange(): void {
    // This will be used by the audio capture service
    const state = this.getConnectionState();
    console.log('[WebRTC] Connection state changed:', state);
  }

  public disconnect(): void {
    this.isConnecting = false;
    
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.signalingWebSocket) {
      this.signalingWebSocket.close();
      this.signalingWebSocket = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Vérifie la santé de la connexion et tente des réparations si nécessaire
   */
  private checkConnectionHealth(): void {
    if (!this.peerConnection) {
      logger.warn('WebRTC', 'Cannot check connection health: no peer connection');
      return;
    }

    const connectionState = this.peerConnection.connectionState;
    const iceConnectionState = this.peerConnection.iceConnectionState;
    
    logger.info('WebRTC', 'Connection health check:', {
      connectionState,
      iceConnectionState,
      signalingState: this.peerConnection.signalingState
    });

    // Si la connexion a échoué, tenter une récupération
    if (iceConnectionState === 'failed' || connectionState === 'failed') {
      logger.warn('WebRTC', 'Connection in failed state, attempting recovery...');
      
      // Si nous n'avons pas dépassé le nombre maximum de tentatives de redémarrage ICE
      if (this.iceRestartAttempts < this.maxIceRestartAttempts) {
        this.iceRestartAttempts++;
        logger.info('WebRTC', `Initiating ICE restart (attempt ${this.iceRestartAttempts}/${this.maxIceRestartAttempts})`);
        
        // Créer une nouvelle offre pour forcer un redémarrage ICE
        this.createAndSendOffer({ iceRestart: true }).catch(error => {
          logger.errorWithDetails('WebRTC', error, { phase: 'iceRestart' });
        });
      } else {
        logger.error('WebRTC', 'Max ICE restart attempts reached, giving up');
        this.emit('error', new Error('Connection failed and could not be recovered'));
      }
    }
  }

  /**
   * Crée et envoie une offre SDP
   */
  private async createAndSendOffer(options: RTCOfferOptions = {}): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No active peer connection');
    }

    try {
      logger.info('WebRTC', 'Creating offer with options:', options);
      const offer = await this.peerConnection.createOffer(options);
      
      // Mettre à jour la description locale
      await this.peerConnection.setLocalDescription(offer);
      
      // Envoyer l'offre via le canal de signalisation
      if (this.signalingWebSocket?.readyState === WebSocket.OPEN) {
        this.signalingWebSocket.send(JSON.stringify({
          type: 'offer',
          data: offer
        }));
        logger.info('WebRTC', 'Offer sent successfully');
      } else {
        throw new Error('Cannot send offer: WebSocket not connected');
      }
    } catch (error) {
      logger.errorWithDetails('WebRTC', error, { phase: 'createAndSendOffer' });
      throw error;
    }
  }

  /**
   * Nettoie toutes les ressources et connexions
   */
  private cleanup(): void {
    logger.debug('WebRTC', 'Cleaning up WebRTC resources');
    
    // Nettoyer les timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.iceGatheringTimeout) {
      clearTimeout(this.iceGatheringTimeout);
      this.iceGatheringTimeout = null;
    }
    
    // Fermer la connexion WebSocket
    if (this.signalingWebSocket) {
      try {
        this.signalingWebSocket.close();
      } catch (error) {
        logger.error('WebRTC', 'Error closing signaling socket:', error);
      }
      this.signalingWebSocket = null;
    }
    
    // Fermer la connexion peer
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (error) {
        logger.error('WebRTC', 'Error closing peer connection:', error);
      }
      this.peerConnection = null;
    }
    
    this.dataChannel = null;
    this.isConnecting = false;
  }
  
  /**
   * Gère la déconnexion et tente une reconnexion si nécessaire
   */
  private handleDisconnect(): void {
    logger.info('WebRTC', `Handling disconnect, reconnect attempt ${this.reconnectAttempts + 1}/${this.config.maxReconnectAttempts}`);
    
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(
        this.config.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
        this.config.maxReconnectDelay
      );
      
      logger.info('WebRTC', `Will attempt to reconnect in ${delay}ms`);
      
      this.reconnectTimeout = setTimeout(() => {
        logger.info('WebRTC', `Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
        this.connect().catch(error => {
          logger.errorWithDetails('WebRTC', error, { phase: 'reconnect' });
        });
      }, delay);
    } else {
      logger.warn('WebRTC', 'Max reconnection attempts reached, giving up');
      this.emit('disconnected');
    }
  }
} 