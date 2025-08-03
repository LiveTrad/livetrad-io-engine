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
  private lastIceState: RTCIceConnectionState | null | undefined = undefined;
  private iceRestartAttempts: number = 0;
  private maxIceRestartAttempts: number = 3;
  private lastSyncedState: WebRTCConnectionState | null = null;
  private clientId: string = `ext-${Math.random().toString(36).substring(2, 10)}`;
  private lastHeartbeat: number = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 10000; // 10 secondes
  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 secondes sans réponse = déconnexion

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
        this.reconnectAttempts = 0; // Remettre le compteur de reconnexion à zéro
        
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
            logger.error('WebRTC', 'Failed to initialize peer connection', { 
              error: error instanceof Error ? error.message : String(error),
              phase: 'initializePeerConnection' 
            });
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
            component: candidate && candidate.component ? (Number(candidate.component) === 1 ? 'RTP' : 'RTCP') : 'unknown'
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
        const newState = this.peerConnection?.iceConnectionState;
        const prevState = this.lastIceState;
        this.lastIceState = newState;
        
        // Journalisation détaillée avec timestamp et contexte
        const iceContext = {
          timestamp: new Date().toISOString(),
          previousState: prevState,
          newState: newState,
          signalingState: this.peerConnection?.signalingState,
          connectionState: this.peerConnection?.connectionState,
          hasLocalDescription: !!this.peerConnection?.localDescription,
          hasRemoteDescription: !!this.peerConnection?.remoteDescription,
          iceGatheringState: this.peerConnection?.iceGatheringState,
          iceConnectionState: newState
        };
        
        logger.info('WebRTC', `ICE connection state changed: ${prevState} -> ${newState}`, iceContext);
        
        // Gestion des erreurs et tentatives de récupération
        if (newState === 'failed') {
          logger.warn('WebRTC', 'ICE connection failed, attempting recovery...', iceContext);
          this.checkConnectionHealth();
        } else if (newState === 'disconnected') {
          logger.warn('WebRTC', 'ICE connection disconnected', iceContext);
          // Essayer de restaurer la connexion
          setTimeout(() => this.checkConnectionHealth(), 1000);
        }
        
        this.emitConnectionStateChange();
      };

      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection?.connectionState;
        logger.info('WebRTC', `Connection state changed: ${state}`, {
          timestamp: new Date().toISOString(),
          iceConnectionState: this.peerConnection?.iceConnectionState,
          signalingState: this.peerConnection?.signalingState,
          iceGatheringState: this.peerConnection?.iceGatheringState
        });
        this.emitConnectionStateChange();
      };

      this.peerConnection.onsignalingstatechange = () => {
        const state = this.peerConnection?.signalingState;
        logger.info('WebRTC', `Signaling state changed: ${state}`, {
          timestamp: new Date().toISOString(),
          iceConnectionState: this.peerConnection?.iceConnectionState,
          connectionState: this.peerConnection?.connectionState,
          hasLocalDescription: !!this.peerConnection?.localDescription,
          hasRemoteDescription: !!this.peerConnection?.remoteDescription
        });
        
        // Gestion des erreurs spécifiques à l'état de signalisation
        if (state === 'closed') {
          logger.warn('WebRTC', 'Signaling connection closed, cleaning up...');
          this.cleanup();
        }
        
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

      // Démarrer le mécanisme de heartbeat après l'établissement de la connexion
      this.startHeartbeat();
      
    } catch (error) {
      console.error('[WebRTC] Failed to initialize peer connection:', error);
      throw error;
    }
  }

  private handleSignalingMessage(message: WebRTCMessage): void {
    if (!this.peerConnection) {
      logger.warn('WebRTC', 'Received signaling message but no peer connection exists');
      return;
    }

    // Traiter les messages de contrôle comme les heartbeats
    if (message.type === 'control' && message.data?.type === 'heartbeat') {
      this.handleHeartbeat();
      return;
    }

    switch (message.type) {
      case 'answer':
        this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.data))
          .catch(error => {
            logger.error('WebRTC', 'Failed to set remote description', error);
          });
        break;
      case 'ice-candidate':
        if (message.data) {
          this.peerConnection.addIceCandidate(new RTCIceCandidate(message.data))
            .catch(error => {
              logger.warn('WebRTC', 'Failed to add ICE candidate', error);
            });
        }
        break;
      default:
        logger.warn('WebRTC', 'Unknown signaling message type:', { type: message.type });
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
        console.log('[WebRTC] Audio track details:', {
          id: audioTrack.id,
          kind: audioTrack.kind,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          settings: audioTrack.getSettings()
        });
        
        this.peerConnection.addTrack(audioTrack, stream);
        console.log('[WebRTC] Audio track added to peer connection successfully');
        
        // Log sender details
        const senders = this.peerConnection.getSenders();
        const audioSender = senders.find(sender => sender.track?.kind === 'audio');
        if (audioSender) {
          console.log('[WebRTC] Audio sender created:', {
            trackId: audioSender.track?.id,
            kind: audioSender.track?.kind
          });
        }
        
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

  public getSenders(): RTCRtpSender[] {
    return this.peerConnection?.getSenders() || [];
  }

  public removeTrack(sender: RTCRtpSender): void {
    if (this.peerConnection) {
      this.peerConnection.removeTrack(sender);
    }
  }

  private syncConnectionState(force: boolean = false): void {
    if (!this.peerConnection) return;
    
    const currentState: WebRTCConnectionState = {
      status: this.peerConnection.connectionState === 'connected' ? 'connected' : 'connecting',
      iceConnectionState: this.peerConnection.iceConnectionState,
      connectionState: this.peerConnection.connectionState,
      signalingState: this.peerConnection.signalingState,
      desktopUrl: this.config.signalingUrl
    };
    
    const lastState = this.lastSyncedState;
    const stateChanged = !lastState || 
      lastState.iceConnectionState !== currentState.iceConnectionState ||
      lastState.connectionState !== currentState.connectionState ||
      lastState.signalingState !== currentState.signalingState;
    
    if (stateChanged || force) {
      this.lastSyncedState = { ...currentState };
      
      if (this.signalingWebSocket?.readyState === WebSocket.OPEN) {
        const syncMessage: WebRTCMessage = {
          type: 'control',
          data: {
            type: 'sync-state',
            state: currentState,
            timestamp: Date.now(),
            clientId: this.clientId
          }
        };
        
        this.signalingWebSocket.send(JSON.stringify(syncMessage));
        logger.debug('WebRTC', 'Sent state sync', { 
          previousState: lastState, 
          newState: currentState 
        });
      }
    }
    
    this.emit('connectionstatechange', currentState);
  }
  
  private emitConnectionStateChange(): void {
    this.syncConnectionState();
    const state = this.getConnectionState();
    console.log('[WebRTC] Connection state changed:', state);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastHeartbeat = Date.now();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
      this.checkConnectionHealth();
    }, this.HEARTBEAT_INTERVAL);
    logger.debug('WebRTC', 'Heartbeat started');
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.debug('WebRTC', 'Heartbeat stopped');
    }
  }
  
  private sendHeartbeat(): void {
    if (this.signalingWebSocket?.readyState === WebSocket.OPEN) {
      const heartbeatMsg: WebRTCMessage = {
        type: 'control',
        data: {
          type: 'heartbeat',
          clientId: this.clientId,
          timestamp: Date.now()
        }
      };
      this.signalingWebSocket.send(JSON.stringify(heartbeatMsg));
      logger.debug('WebRTC', 'Heartbeat sent');
    }
  }
  
  private handleHeartbeat(): void {
    this.lastHeartbeat = Date.now();
    logger.debug('WebRTC', 'Heartbeat received');
  }
  
  private checkHeartbeat(): void {
    if (this.lastHeartbeat > 0 && (Date.now() - this.lastHeartbeat) > this.HEARTBEAT_TIMEOUT) {
      logger.warn('WebRTC', 'Heartbeat timeout - connection may be dead');
      this.handleDisconnect();
    }
  }
  
  public disconnect(): void {
    this.isConnecting = false;
    this.stopHeartbeat();
    
    // Remettre tous les compteurs à zéro
    this.reconnectAttempts = 0;
    this.iceRestartAttempts = 0;
    
    if (this.signalingWebSocket?.readyState === WebSocket.OPEN) {
      const disconnectMsg: WebRTCMessage = {
        type: 'control',
        data: {
          type: 'disconnect',
          clientId: this.clientId,
          timestamp: Date.now()
        }
      };
      this.signalingWebSocket.send(JSON.stringify(disconnectMsg));
    }
    
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (error) {
        console.error('Error closing data channel:', error);
      }
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

    if (iceConnectionState === 'failed' || connectionState === 'failed') {
      logger.warn('WebRTC', 'Connection in failed state, attempting recovery...');
      
      if (this.iceRestartAttempts < this.maxIceRestartAttempts) {
        this.iceRestartAttempts++;
        logger.info('WebRTC', `Initiating ICE restart (attempt ${this.iceRestartAttempts}/${this.maxIceRestartAttempts})`);
        
        this.createAndSendOffer({ iceRestart: true }).catch(error => {
          logger.error('WebRTC', 'ICE restart failed', { 
            error: error instanceof Error ? error.message : String(error),
            phase: 'iceRestart' 
          });
        });
      } else {
        logger.error('WebRTC', 'Max ICE restart attempts reached, giving up');
        this.emit('error', new Error('Connection failed and could not be recovered'));
      }
    }
  }

  private async createAndSendOffer(options: RTCOfferOptions = {}): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No active peer connection');
    }

    try {
      logger.info('WebRTC', 'Creating offer with options:', options);
      const offer = await this.peerConnection.createOffer(options);
      
      await this.peerConnection.setLocalDescription(offer);
      
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

  private cleanup(): void {
    logger.debug('WebRTC', 'Cleaning up WebRTC resources');
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.iceGatheringTimeout) {
      clearTimeout(this.iceGatheringTimeout);
      this.iceGatheringTimeout = null;
    }
    
    if (this.signalingWebSocket) {
      try {
        this.signalingWebSocket.close();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('WebRTC', 'Error closing signaling socket', { error: errorMessage });
      }
      this.signalingWebSocket = null;
    }
    
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('WebRTC', 'Error closing peer connection', { error: errorMessage });
      }
      this.peerConnection = null;
    }
    
    this.dataChannel = null;
    this.isConnecting = false;
  }
  
  private handleDisconnect(): void {
    logger.info('WebRTC', `Handling disconnect, reconnect attempt ${this.reconnectAttempts + 1}/${this.config.maxReconnectAttempts}`);
    
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(
        this.config.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
        this.config.maxReconnectDelay
      );
      
      logger.info('WebRTC', `Will attempt to reconnect in ${delay}ms`);
      
      // Émettre l'événement de reconnexion
      this.emit('reconnecting', this.reconnectAttempts, this.config.maxReconnectAttempts);
      
      this.reconnectTimeout = setTimeout(() => {
        logger.info('WebRTC', `Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
        this.connect().catch(error => {
          logger.errorWithDetails('WebRTC', error, { phase: 'reconnect' });
        });
      }, delay);
    } else {
      logger.warn('WebRTC', 'Max reconnection attempts reached, giving up');
      // Émettre l'événement d'échec de reconnexion
      this.emit('reconnect-failed');
      this.emit('disconnected');
    }
  }
}