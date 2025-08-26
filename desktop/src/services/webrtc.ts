import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/env';
import { DeepgramService, TranscriptionData } from './deepgram';

// Import WebRTC APIs from wrtc
const wrtc = require('wrtc');
const RTCPeerConnection = wrtc.RTCPeerConnection;
const RTCSessionDescription = wrtc.RTCSessionDescription;
const RTCIceCandidate = wrtc.RTCIceCandidate;

export interface WebRTCMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'control';
  data: any;
}

export interface StreamInfo {
  hasAudio: boolean;
  hasVideo: boolean;
  codecs: Array<{
    kind: string;
    codec: string;
    enabled: boolean;
    readyState: string;
  }>;
}

export interface WebRTCConnectionState {
  status: 'connected' | 'connecting' | 'disconnected';
  iceConnectionState: RTCIceConnectionState | 'disconnected';
  connectionState: RTCPeerConnectionState | 'disconnected';
  signalingState: RTCSignalingState | 'closed';
  clientId?: string;
  desktopUrl?: string;
  timestamp?: string;
  streamInfo?: StreamInfo;
}

// Déclaration d'interface pour l'événement d'erreur de candidat ICE
interface RTCIceCandidateErrorEvent extends Event {
  readonly address: string | null;
  readonly port: number | null;
  readonly url: string;
  readonly errorCode: number;
  readonly errorText: string;
}

export class WebRTCService extends EventEmitter {
  private signalingServer: WebSocketServer | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private connections: Map<WebSocket, string> = new Map();
  private deepgramService: DeepgramService;
  private transcriptionEnabled: boolean = false;
  private currentVolume: number = 0.8;
  private isMuted: boolean = false;
  // AudioContext and MediaStreamAudioDestinationNode are not available in Node.js
  // private audioContext: AudioContext | null = null;
  // private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private iceRestartAttempts: number = 0;
  private processedAudioTracks: Set<string> = new Set();
  private audioPlaybackProcess: any = null;
  private isPlaying: boolean = false;
  private _isPlaybackActive: boolean = false;
  private audioBuffer: Buffer[] = [];
  private bufferMaxSize: number = 10; // Nombre de chunks à conserver
  private bufferFlushInterval: NodeJS.Timeout | null = null;
  private isFlushing: boolean = false;
  private readonly TARGET_LATENCY_MS = 50; // 50ms de latence cible
  private lastFlushTime: number = 0;
  private readonly FLUSH_INTERVAL_MS = 20; // Flush toutes les 20ms
  private retryCount: number = 0; // Compteur de tentatives de reconnexion

  constructor() {
    super();
    this.deepgramService = new DeepgramService();
    this.setupDeepgramListeners();
  }

  public init(): void {
    console.log('[WebRTC] Initializing WebRTC signaling server...');
    this.signalingServer = new WebSocketServer({ 
        port: config.webrtc.signalingPort,
        clientTracking: true
    });

    this.setupSignalingEventListeners();
    console.log(`[WebRTC] Signaling server running on ws://${config.webrtc.host}:${config.webrtc.signalingPort}`);
  }

  private setupSignalingEventListeners(): void {
    if (!this.signalingServer) {
      console.error('[WebRTC] Signaling server not initialized');
      return;
    }

    this.signalingServer.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      this.connections.set(ws, clientId);
      console.log(`[WebRTC] New signaling connection from client ${clientId}`);
      
      this.emit('connection-change', {
        status: 'connected',
        clients: this.connections.size
      });

      ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const message: WebRTCMessage = JSON.parse(data.toString());
          this.handleSignalingMessage(message, ws);
        } catch (error) {
          console.error('[WebRTC] Error processing signaling message:', error);
        }
      });

      ws.on('close', () => {
        const clientId = this.connections.get(ws);
        this.connections.delete(ws);
        console.log(`[WebRTC] Client ${clientId} disconnected from signaling`);
        
        this.emit('connection-change', {
          status: this.connections.size > 0 ? 'connected' : 'disconnected',
          clients: this.connections.size
        });
      });

      ws.on('error', (error: Error) => {
        console.error(`[WebRTC] Signaling error for client ${clientId}:`, error);
      });
    });

    this.signalingServer.on('listening', () => {
      console.log('[WebRTC] Signaling server is listening');
      this.emit('server-listening', { status: 'listening' });
    });

    this.signalingServer.on('error', (error) => {
      console.error('[WebRTC] Signaling server error:', error);
      this.emit('server-error', { error });
    });
  }

  private async handleSignalingMessage(message: WebRTCMessage, ws: WebSocket): Promise<void> {
    console.log('[WebRTC] Received signaling message:', message.type);

    switch (message.type) {
      case 'offer':
        await this.handleOffer(message.data, ws);
        break;
      case 'ice-candidate':
        await this.handleIceCandidate(message.data);
        break;
      case 'control':
        this.handleControlMessage(message.data);
        break;
      default:
        console.warn('[WebRTC] Unknown signaling message type:', message.type);
    }
  }

  private async handleOffer(offer: RTCSessionDescriptionInit, ws: WebSocket): Promise<void> {
    try {
      console.log('[WebRTC] Creating RTCPeerConnection with config:', {
        iceServers: config.webrtc.iceServers,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 10
      });

      // Create RTCPeerConnection with enhanced configuration
      const rtcConfig: any = {
        iceServers: config.webrtc.iceServers,
        // @ts-ignore - iceTransportPolicy is not in the TypeScript definition
        iceTransportPolicy: 'all', // Try both relay and non-relay candidates
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 10,  // Increased pool size
        sdpSemantics: 'unified-plan' as const // Use unified plan SDP
      };
      
      this.peerConnection = new RTCPeerConnection(rtcConfig);

      if (!this.peerConnection) {
        throw new Error('Failed to create RTCPeerConnection');
      }
      
      // Configure connection constraints
      const constraints = {
        optional: [
          { DtlsSrtpKeyAgreement: true },
          { RtpDataChannels: true },
          { googDscp: true },
          { googCpuOveruseDetection: true },
          { googCpuOveruseEncodeUsage: true },
          { googCpuOveruseEnforce: true },
          { googScreencastMinBitrate: 300 },
          { googIPv6: true },
          { googDscp: true },
          { googSuspendBelowMinBitrate: false },
          { googCombinedAudioVideoBwe: true },
          { googScreencastMinBitrate: 300 },
          { googCpuOveruseEncodeUsage: true },
          { googHighBitrate: true },
          { googPayloadPadding: true },
          { googVeryHighBitrate: true },
          { googCpuOveruseEncodeUsage: true },
          { googScreencastMinBitrate: 300 },
          { googHighStartBitrate: 2000 },
          { googPayloadPadding: true },
          { googVeryHighBitrate: true }
        ]
      };
      
      // Configuration avancée du suivi des états ICE
      let lastIceState: RTCIceConnectionState | undefined;
      let iceStateChangeTime = Date.now();
      
      // Gestion unifiée des états de connexion ICE
      this.peerConnection.oniceconnectionstatechange = () => {
        if (!this.peerConnection) return;
        
        const newState = this.peerConnection.iceConnectionState;
        const prevState = lastIceState;
        lastIceState = newState;
        
        const now = Date.now();
        const timeInPrevState = now - iceStateChangeTime;
        iceStateChangeTime = now;
        
        const iceContext = {
          timestamp: new Date().toISOString(),
          previousState: prevState,
          newState: newState,
          timeInPrevStateMs: timeInPrevState,
          signalingState: this.peerConnection.signalingState,
          connectionState: this.peerConnection.connectionState,
          iceGatheringState: this.peerConnection.iceGatheringState,
          hasLocalDescription: !!this.peerConnection.localDescription,
          hasRemoteDescription: !!this.peerConnection.remoteDescription,
          localSdp: this.peerConnection.localDescription?.sdp?.substring(0, 100) + '...',
          remoteSdp: this.peerConnection.remoteDescription?.sdp?.substring(0, 100) + '...'
        };
        
        console.log(`[WebRTC] ICE Connection State: ${prevState || 'none'} -> ${newState} (${timeInPrevState}ms in previous state)`, iceContext);
        
        // Gestion des états de connexion ICE
        switch (newState) {
          case 'connected':
            console.log('[WebRTC] ICE connection established successfully', iceContext);
            this.iceRestartAttempts = 0; // Réinitialiser le compteur de tentatives
            break;
            
          case 'disconnected':
            console.warn('[WebRTC] ICE connection disconnected', iceContext);
            // Tenter de restaurer la connexion après un court délai
            setTimeout(() => {
              if (this.peerConnection?.iceConnectionState === 'disconnected') {
                console.log('[WebRTC] Attempting to restore disconnected ICE connection...');
                this.peerConnection?.restartIce();
              }
            }, 1000);
            break;
            
          case 'failed':
            console.error('[WebRTC] ICE connection failed', iceContext);
            // Tenter de redémarrer ICE avec un nombre limité de tentatives
            if (this.iceRestartAttempts < (config.webrtc.maxIceRestartAttempts || 3)) {
              this.iceRestartAttempts++;
              console.warn(`[WebRTC] Restarting ICE (attempt ${this.iceRestartAttempts})...`);
              this.peerConnection?.restartIce();
            } else {
              console.error('[WebRTC] Max ICE restart attempts reached, giving up');
              // Notifier l'utilisateur de l'échec de la connexion
              this.emit('connection-error', {
                type: 'ice-failed',
                message: 'Échec de la connexion ICE après plusieurs tentatives',
                details: iceContext
              });
            }
            break;
            
          case 'closed':
            console.log('[WebRTC] ICE connection closed', iceContext);
            break;
            
          case 'checking':
            console.log('[WebRTC] ICE connection checking...', iceContext);
            break;
            
          case 'completed':
            console.log('[WebRTC] ICE connection completed', iceContext);
            break;
        }
        
        this.emitConnectionStateChange();
      };
      
      // Gestion unifiée des candidats ICE
      this.peerConnection.onicecandidate = (event) => {
        if (!this.peerConnection) return;
        
        if (event.candidate) {
          const candidateInfo = {
            timestamp: new Date().toISOString(),
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            protocol: event.candidate.protocol,
            address: event.candidate.address,
            port: event.candidate.port,
            type: event.candidate.type,
            tcpType: event.candidate.tcpType,
            relatedAddress: event.candidate.relatedAddress,
            relatedPort: event.candidate.relatedPort,
            usernameFragment: event.candidate.usernameFragment,
            // networkCost: event.candidate.networkCost
          };
          
          console.log('[WebRTC] Generated ICE candidate:', candidateInfo);
          
          // Envoyer le candidat ICE au pair distant
          this.sendSignalingMessage(ws, {
            type: 'ice-candidate',
            data: event.candidate
          });
        } else {
          console.log('[WebRTC] All ICE candidates have been generated');
          console.log('[WebRTC] Final ICE gathering state:', this.peerConnection.iceGatheringState);
          
          // Vérifier si nous avons une description locale
          if (this.peerConnection.localDescription) {
            console.log('[WebRTC] Local SDP (truncated):', 
              this.peerConnection.localDescription.sdp?.substring(0, 200) + '...');
          }
        }
      };
      
      // Gestion des changements d'état de la connexion
      this.peerConnection.onconnectionstatechange = () => {
        if (!this.peerConnection) return;
        
        const state = this.peerConnection.connectionState;
        console.log(`[WebRTC] Connection state changed to: ${state}`, {
          timestamp: new Date().toISOString(),
          iceConnectionState: this.peerConnection.iceConnectionState,
          iceGatheringState: this.peerConnection.iceGatheringState,
          signalingState: this.peerConnection.signalingState
        });
        
        // Gestion des transitions d'état de la connexion
        switch (state) {
          case 'connected':
            console.log('[WebRTC] WebRTC connection established successfully');
            break;
            
          case 'disconnected':
          case 'failed':
            console.warn(`[WebRTC] WebRTC connection ${state}`, {
              iceConnectionState: this.peerConnection.iceConnectionState,
              iceGatheringState: this.peerConnection.iceGatheringState
            });
            break;
            
          case 'closed':
            console.log('[WebRTC] WebRTC connection closed');
            break;
        }
        
        this.emitConnectionStateChange();
      };
      
      // Gestion des changements d'état de signalisation
      this.peerConnection.onsignalingstatechange = () => {
        if (!this.peerConnection) return;
        
        console.log(`[WebRTC] Signaling state changed to: ${this.peerConnection.signalingState}`, {
          timestamp: new Date().toISOString(),
          connectionState: this.peerConnection.connectionState,
          iceConnectionState: this.peerConnection.iceConnectionState
        });
        
        this.emitConnectionStateChange();
      };
      
      // Gestion des changements d'état de collecte ICE
      this.peerConnection.onicegatheringstatechange = () => {
        if (!this.peerConnection) return;
        
        console.log(`[WebRTC] ICE gathering state changed to: ${this.peerConnection.iceGatheringState}`, {
          timestamp: new Date().toISOString(),
          connectionState: this.peerConnection.connectionState,
          iceConnectionState: this.peerConnection.iceConnectionState
        });
      };
      
      // Configuration initiale pour la gestion des erreurs réseau
      this.peerConnection.onicecandidateerror = (event: RTCIceCandidateErrorEvent) => {
        console.error('[WebRTC] ICE candidate error:', {
          timestamp: new Date().toISOString(),
          errorCode: event.errorCode,
          errorText: event.errorText,
          url: event.url,
          address: event.address,
          port: event.port
        });
        
        this.emit('connection-error', {
          type: 'ice-candidate-error',
          message: `Erreur de candidat ICE: ${event.errorText} (${event.errorCode})`,
          details: {
            url: event.url,
            address: event.address,
            port: event.port
          }
        });
      };

      // Handle incoming audio tracks
      this.peerConnection.ontrack = (event) => {
        console.log('[WebRTC] Audio track received via ontrack event');
        this.handleAudioTrack(event.track);
      };
      
      // Also check for existing tracks when connection is established
      this.peerConnection.onconnectionstatechange = () => {
        if (this.peerConnection?.connectionState === 'connected') {
          console.log('[WebRTC] Connection established, checking for existing tracks...');
          const receivers = this.peerConnection.getReceivers();
          receivers.forEach(receiver => {
            if (receiver.track && receiver.track.kind === 'audio' && receiver.track.readyState === 'live') {
              console.log('[WebRTC] Found existing audio track:', receiver.track.id);
              this.handleAudioTrack(receiver.track);
            }
          });
        }
      };
      
      // Track processed audio tracks to avoid duplicates
      this.processedAudioTracks = new Set();
      
      // Monitor for new tracks being added
      setInterval(() => {
        if (this.peerConnection?.connectionState === 'connected') {
          const receivers = this.peerConnection.getReceivers();
          receivers.forEach(receiver => {
            if (receiver.track && receiver.track.kind === 'audio' && 
                receiver.track.readyState === 'live' && 
                !this.processedAudioTracks.has(receiver.track.id)) {
              console.log('[WebRTC] New audio track detected:', receiver.track.id);
              this.processedAudioTracks.add(receiver.track.id);
              this.handleAudioTrack(receiver.track);
            }
          });
        }
      }, 1000); // Check every second

      // Handle data channel
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };

      // Set remote description and create answer
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.sendSignalingMessage(ws, {
        type: 'answer',
        data: answer
      });

    } catch (error) {
      console.error('[WebRTC] Error handling offer:', error);
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[WebRTC] Error adding ICE candidate:', error);
      }
    }
  }

  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('[WebRTC] Data channel opened');
    };

    this.dataChannel.onclose = () => {
      console.log('[WebRTC] Data channel closed');
    };

    this.dataChannel.onerror = (error) => {
      console.error('[WebRTC] Data channel error:', error);
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleControlMessage(message);
      } catch (error) {
        console.error('[WebRTC] Error parsing control message:', error);
      }
    };
  }

  private handleControlMessage(message: any): void {
    // Log message type without the full data to avoid spam
    if (message.type === 'audio-data') {
      // Don't log every audio data message to avoid spam
    } else {
      console.log('[WebRTC] Control message received:', message.type);
    }
    
    switch (message.type) {
      case 'volume':
        this.setVolume(message.volume);
        break;
      case 'mute':
        this.setMute(message.muted);
        break;
      case 'transcription':
        if (message.enabled) {
          this.startTranscription();
        } else {
          this.stopTranscription();
        }
        break;
      case 'sync-state':
        this.handleSyncStateMessage(message);
        break;
      case 'heartbeat':
        this.handleHeartbeatMessage(message);
        break;
      case 'audio-data':
        this.handleAudioDataMessage(message);
        break;
      default:
        console.warn('[WebRTC] Unknown control message type:', message.type);
    }
  }

  private handleAudioTrack(track: MediaStreamTrack): void {
    console.log('[WebRTC] Audio track received, setting up processing...');
    
    // Log detailed audio track information
    console.log('[WebRTC] Audio track details:', {
      kind: track.kind,
      id: track.id,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      // Note: getSettings() and getConstraints() are not available in Node.js wrtc
      // settings: track.getSettings(),
      // constraints: track.getConstraints()
    });

    // Log codec information from the peer connection
    if (this.peerConnection) {
      const receivers = this.peerConnection.getReceivers();
      const audioReceiver = receivers.find(r => r.track && r.track.kind === 'audio');
      if (audioReceiver) {
        const parameters = audioReceiver.getParameters();
        console.log('[WebRTC] Audio receiver parameters:', {
          codecs: parameters.codecs.map(c => ({
            mimeType: c.mimeType,
            clockRate: c.clockRate,
            channels: c.channels,
            sdpFmtpLine: c.sdpFmtpLine
          })),
          // encodings: parameters.encodings,
          headerExtensions: parameters.headerExtensions
        });
      }
    }

    // Set up audio processing
    this.setupAudioProcessing(track);

    // Start playback automatically
    this.startPlayback();

    // Set up transcription if enabled
    if (this.transcriptionEnabled) {
      this.setupTranscription(track);
    }

    // Emit audio track event for UI updates
    this.emit('audio-track-received', {
      trackId: track.id,
      kind: track.kind,
      enabled: track.enabled
    });
    
    console.log('[WebRTC] Audio track processing setup complete');
  }

  private setupAudioProcessing(track: MediaStreamTrack): void {
    console.log('[WebRTC] Setting up audio processing for track:', track.id);
    
    // In Node.js, we can't use AudioContext, so we'll use a different approach
    // We'll start playback and let FFplay handle the audio processing
    console.log('[WebRTC] Audio processing setup complete (Node.js mode)');
    
    // Start playback automatically when audio track is detected
    this.startPlayback();
    
    // For now, we'll just log that we have an audio track
    // The actual audio processing will be handled by the WebRTC connection itself
    console.log('[WebRTC] Audio track ready for processing:', track.id);
  }

  private setupTranscription(track: MediaStreamTrack): void {
    console.log('[WebRTC] Setting up transcription for audio track');
    
    // For now, just log that transcription is enabled
    // In a real implementation, we would process the audio data here
    console.log('[WebRTC] Transcription enabled for track:', track.id);
    
    // Emit transcription event for UI updates
    this.emit('transcription-started', {
      trackId: track.id
    });
  }

  private sendSignalingMessage(ws: WebSocket, message: WebRTCMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public getConnectionState(): WebRTCConnectionState {
    if (!this.peerConnection) {
      return {
        status: 'disconnected',
        iceConnectionState: 'disconnected',
        connectionState: 'disconnected',
        signalingState: 'closed',
        clientId: 'desktop',
        desktopUrl: `ws://${config.webrtc.host}:${config.webrtc.signalingPort}`,
        timestamp: new Date().toISOString()
      };
    }

    // Safe getReceivers with error handling
    let streamInfo: StreamInfo = {
      hasAudio: false,
      hasVideo: false,
      codecs: []
    };

    try {
      const receivers = this.peerConnection.getReceivers();
      streamInfo = {
        hasAudio: receivers.some(r => r.track && r.track.kind === 'audio'),
        hasVideo: receivers.some(r => r.track && r.track.kind === 'video'),
        codecs: receivers
          .filter(r => r.track)
          .map(r => ({
            kind: r.track!.kind,
            codec: r.getParameters().codecs[0]?.mimeType || 'unknown',
            enabled: r.track!.enabled,
            readyState: r.track!.readyState
          }))
      };
    } catch (error) {
      console.warn('[WebRTC] Error getting receivers:', error);
      // Use default streamInfo if getReceivers fails
    }

    return {
      status: this.peerConnection.connectionState === 'connected' ? 'connected' : 
             this.peerConnection.connectionState === 'connecting' ? 'connecting' : 'disconnected',
      iceConnectionState: this.peerConnection.iceConnectionState,
      connectionState: this.peerConnection.connectionState,
      signalingState: this.peerConnection.signalingState,
      clientId: 'desktop',
      desktopUrl: `ws://${config.webrtc.host}:${config.webrtc.signalingPort}`,
      timestamp: new Date().toISOString(),
      streamInfo
    };
  }

  private emitConnectionStateChange(): void {
    const connectionState = this.getConnectionState();
    console.log('[WebRTC] Connection state changed:', connectionState);
    this.emit('connection-state-change', connectionState);
  }

  public async setVolume(volume: number): Promise<boolean> {
    try {
      if (volume < 0 || volume > 1) {
        console.error('[WebRTC] Volume must be between 0 and 1');
        return false;
      }

      this.currentVolume = volume;
      console.log(`[WebRTC] Volume set to ${Math.round(volume * 100)}%`);
      return true;
    } catch (error) {
      console.error('[WebRTC] Error setting volume:', error);
      return false;
    }
  }

  public async setMute(muted: boolean): Promise<boolean> {
    try {
      this.isMuted = muted;
      console.log(`[WebRTC] Mute set to ${muted}`);
      return true;
    } catch (error) {
      console.error('[WebRTC] Error setting mute:', error);
      return false;
    }
  }

  public startTranscription(): void {
    this.transcriptionEnabled = true;
    console.log('[WebRTC] Transcription started');
  }

  public stopTranscription(): void {
    this.transcriptionEnabled = false;
    console.log('[WebRTC] Transcription stopped');
  }

  private setupDeepgramListeners(): void {
    this.deepgramService.on('transcript', (transcriptionData: TranscriptionData) => {
      this.emit('transcription', transcriptionData);
    });

    this.deepgramService.on('connected', () => {
      this.emit('deepgram-connected');
    });

    this.deepgramService.on('disconnected', () => {
      this.emit('deepgram-disconnected');
    });

    this.deepgramService.on('error', (error: any) => {
      this.emit('deepgram-error', error);
    });
  }

  private handleSyncStateMessage(message: any): void {
    try {
      const { state, clientId, timestamp } = message;
      console.log(`[WebRTC] Syncing state with client ${clientId}:`, state);
      
      // Mettre à jour l'état de connexion dans l'UI
      this.emit('connection-change', {
        status: state.status,
        clientId,
        connectionState: state.connectionState,
        iceConnectionState: state.iceConnectionState,
        signalingState: state.signalingState,
        desktopUrl: state.desktopUrl,
        timestamp: new Date(timestamp).toLocaleString()
      });
      
      // Répondre avec l'état actuel du serveur
      if (this.peerConnection && this.connections.size > 0) {
        const currentState = this.getConnectionState();
        const ws = this.connections.keys().next().value;
        if (ws) {
          this.sendSignalingMessage(ws, {
            type: 'control',
            data: {
              type: 'sync-state-ack',
              state: currentState,
              clientId: 'desktop',
              timestamp: Date.now()
            }
          });
        }
      }
    } catch (error) {
      console.error('[WebRTC] Error handling sync state message:', error);
    }
  }

  private handleHeartbeatMessage(message: any): void {
    try {
      const { clientId, timestamp } = message;
      console.log(`[WebRTC] Heartbeat received from client ${clientId} at ${new Date(timestamp).toISOString()}`);
      
      // Mettre à jour le timestamp du dernier heartbeat
      this.emit('heartbeat', { clientId, timestamp });
      
      // Répondre avec un accusé de réception
      if (this.peerConnection && this.connections.size > 0) {
        const ws = this.connections.keys().next().value;
        if (ws) {
          this.sendSignalingMessage(ws, {
            type: 'control',
            data: {
              type: 'heartbeat-ack',
              clientId: 'desktop',
              timestamp: Date.now(),
              serverTime: new Date().toISOString()
            }
          });
        }
      }
    } catch (error) {
      console.error('[WebRTC] Error handling heartbeat message:', error);
    }
  }

  private handleAudioDataMessage(message: any): void {
    try {
      const audioData = message.data;
      
      // Convert Uint8Array back to Int16Array (PCM s16le format)
      const uint8Array = new Uint8Array(audioData);
      const int16Array = new Int16Array(uint8Array.buffer);
      const audioBuffer = Buffer.from(int16Array.buffer);
      
      // Start playback if not already started
      if (!this.isPlaying || !this.audioPlaybackProcess) {
        console.log('[WebRTC] Starting playback for data channel audio...');
        this.startPlayback();
      }
      
      // Add to playback buffer
      this.addToAudioBuffer(audioBuffer);
      
      // Log occasionally to see if data is being processed
      if (Math.random() < 0.001) { // 0.1% of chunks
        console.log('[WebRTC] Audio chunk processed, size:', audioBuffer.length);
      }
      
      // Send to Deepgram if transcription is enabled
      if (this.transcriptionEnabled) {
        this.deepgramService.sendAudioData(audioBuffer);
      }
    } catch (error) {
      console.error('[WebRTC] Error handling audio data message:', error);
    }
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  public close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // AudioContext is not available in Node.js, so we don't need to close it
    // if (this.audioContext) {
    //   this.audioContext.close();
    //   this.audioContext = null;
    // }

    if (this.signalingServer) {
      for (const ws of this.connections.keys()) {
        ws.close();
      }
      this.connections.clear();
      this.signalingServer.close();
      this.signalingServer = null;
    }
  }

  public getAudioStats(): any {
    // This will be updated by the audio processing
    return null;
  }

  public onAudioStats(callback: (stats: any) => void): void {
    this.on('audio-stats', callback);
  }

  public async startPlayback(): Promise<void> {
    if (this._isPlaybackActive && this.audioPlaybackProcess && !this.audioPlaybackProcess.killed) {
      console.log('[WebRTC] Audio playback already running');
      return;
    }

    try {
      const { FFmpegManager } = await import('../utils/ffmpeg-manager');
      const ffmpegManager = FFmpegManager.getInstance();
      
      const { ffmpeg, ffplay, allDependenciesMet } = await ffmpegManager.checkAvailability();
      
      if (!allDependenciesMet) {
        console.error('[WebRTC] FFmpeg not available for playback');
        return;
      }

      // Audio filters for better quality
      const audioFilters = [
        'aresample=async=1000', // Resample with async for better sync
        'volume=1.0' // Normal volume, no distortion
      ].join(',');
      
      this.audioPlaybackProcess = ffmpegManager.spawnFFplay([
        '-f', 's16le',
        '-ar', '48000',
        // '-ch_layout', 'stereo', // Keep stereo for better quality (but after tested, this is causing voice change problems)
        '-i', 'pipe:0',
        '-af', audioFilters,
        '-nodisp',
        '-autoexit',
        '-probesize', '32',
        // '-analyzeduration', '0',
        // '-fflags', 'nobuffer',
        '-loglevel', 'error'
      ]);
      
      this._isPlaybackActive = true;
      this.isPlaying = true;
      
      // Start audio buffering for smooth playback
      this.startAudioBuffering();
      
      console.log('[WebRTC] Playback started successfully');

      this.audioPlaybackProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[FFplay stderr] ${output}`);
        }
      });

      this.audioPlaybackProcess.on('close', (code: number) => {
        console.log(`[FFplay] Process exited with code ${code}`);
        this.audioPlaybackProcess = null;
        this.isPlaying = false;
        this._isPlaybackActive = false;
      });
      
      this.audioPlaybackProcess.on('error', (error: Error) => {
        console.error('[FFplay] Process error:', error);
        this.audioPlaybackProcess = null;
        this.isPlaying = false;
        this._isPlaybackActive = false;
      });
      
      console.log('[WebRTC] Started audio playback process with PID:', this.audioPlaybackProcess.pid);
    } catch (error) {
      console.error('[WebRTC] Failed to start playback:', error);
    }
  }

  private handlePlaybackError(error: Error): void {
    console.error('[WebRTC] Playback error:', error);
    
    // Réinitialiser l'état
    this.audioBuffer = [];
    this.stopAudioBuffering();
    
    // Redémarrer la lecture après un court délai
    if (this._isPlaybackActive) {
      const retryDelay = Math.min(1000, 100 * Math.pow(2, this.retryCount || 0));
      this.retryCount = Math.min((this.retryCount || 0) + 1, 5);
      
      console.log(`[WebRTC] Attempting to restart playback in ${retryDelay}ms...`);
      
      setTimeout(() => {
        if (this._isPlaybackActive) {
          this.startPlayback().catch(err => {
            console.error('[WebRTC] Failed to restart playback:', err);
          });
        }
      }, retryDelay);
    }
  }

  public async stopPlayback(): Promise<void> {
    // Flusher les données restantes
    if (this.audioBuffer.length > 0) {
      try {
        await this.flushAudioBuffer();
      } catch (error) {
        console.error('[WebRTC] Error during final flush:', error);
      }
    }
    
    // Arrêter le buffering
    this.stopAudioBuffering();
    
    // Arrêter le processus de lecture
    if (this.audioPlaybackProcess) {
      if (!this.audioPlaybackProcess.killed) {
        this.audioPlaybackProcess.kill('SIGTERM');
      }
      this.audioPlaybackProcess = null;
    }
    
    // Réinitialiser l'état
    this._isPlaybackActive = false;
    this.isPlaying = false;
    this.audioBuffer = [];
    this.retryCount = 0;
    
    console.log('[WebRTC] Playback stopped');
  }

  public isPlaybackActive(): boolean {
    return this._isPlaybackActive;
  }

  private addToAudioBuffer(audioChunk: Buffer): void {
    // Garder une trace du dernier chunk pour l'overlap
    this.audioBuffer.push(audioChunk);
    
    // Limiter la taille du buffer
    while (this.audioBuffer.length > this.bufferMaxSize) {
      this.audioBuffer.shift();
    }
    
    // Démarrer le buffering si pas déjà en cours
    if (!this.bufferFlushInterval) {
      this.startAudioBuffering();
    }
  }

  private startAudioBuffering(): void {
    this.stopAudioBuffering();
    
    // Premier flush immédiat pour réduire la latence initiale
    this.flushAudioBuffer();
    
    // Poursuivre avec l'intervalle normal
    this.bufferFlushInterval = setInterval(() => {
      if (!this.isFlushing) {
        this.flushAudioBuffer();
      }
    }, this.FLUSH_INTERVAL_MS);
    
    console.log('[WebRTC] Audio buffering started with immediate flush');
  }

  private stopAudioBuffering(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }
  }

  private flushAudioBuffer(): void {
    if (this.isFlushing || this.audioBuffer.length === 0 || !this.audioPlaybackProcess) {
      return;
    }

    this.isFlushing = true;
    
    try {
      // Écrire immédiatement sans attendre
      const bufferToSend = Buffer.concat(this.audioBuffer);
      this.audioBuffer = [];
      
      if (!this.audioPlaybackProcess.killed) {
        // Écrire de manière asynchrone sans attendre la confirmation
        try {
          this.audioPlaybackProcess.stdin.write(bufferToSend, (error: Error | null) => {
            if (error) {
              console.error('[WebRTC] Error writing to FFplay:', error);
              this.handlePlaybackError(error);
            }
          });
        } catch (error) {
          console.error('[WebRTC] Error in write callback:', error);
          this.handlePlaybackError(error as Error);
        }
      }
    } catch (error) {
      console.error('[WebRTC] Error in flushAudioBuffer:', error);
      this.handlePlaybackError(error as Error);
    } finally {
      this.isFlushing = false;
    }
  }
}