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

export interface WebRTCConnectionState {
  status: 'connected' | 'connecting' | 'disconnected';
  iceConnectionState: RTCIceConnectionState;
  connectionState: RTCPeerConnectionState;
  signalingState: RTCSignalingState;
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
  private audioContext: AudioContext | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;

  constructor() {
    super();
    this.deepgramService = new DeepgramService();
    this.setupDeepgramListeners();
  }

  public init(): void {
    console.log('[WebRTC] Initializing WebRTC signaling server...');
    this.signalingServer = new WebSocketServer({ 
      port: config.webrtc.signalingPort 
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
      // Create RTCPeerConnection
      this.peerConnection = new RTCPeerConnection({
        iceServers: config.webrtc.iceServers,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      if (!this.peerConnection) {
        throw new Error('Failed to create RTCPeerConnection');
      }

      // Set up event listeners
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignalingMessage(ws, {
            type: 'ice-candidate',
            data: event.candidate
          });
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

      // Handle incoming audio tracks
      this.peerConnection.ontrack = (event) => {
        console.log('[WebRTC] Audio track received');
        this.handleAudioTrack(event.track);
      };

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
    console.log('[WebRTC] Control message received:', message);
    
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
      default:
        console.warn('[WebRTC] Unknown control message type:', message.type);
    }
  }

  private handleAudioTrack(track: MediaStreamTrack): void {
    console.log('[WebRTC] Audio track received, setting up processing...');
    
    // For now, just log that we received audio data
    // In a real implementation, we would process the audio data here
    console.log('[WebRTC] Audio track details:', {
      kind: track.kind,
      id: track.id,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState
    });

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

  private emitConnectionStateChange(): void {
    const state = this.getConnectionState();
    this.emit('connection-change', state);
  }

  public getConnectionState(): WebRTCConnectionState {
    return {
      status: this.peerConnection?.connectionState === 'connected' ? 'connected' : 
             this.peerConnection ? 'connecting' : 'disconnected',
      iceConnectionState: this.peerConnection?.iceConnectionState || 'new',
      connectionState: this.peerConnection?.connectionState || 'new',
      signalingState: this.peerConnection?.signalingState || 'stable'
    };
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

  private generateClientId(): string {
    return Math.random().toString(36).substr(2, 9);
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

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.signalingServer) {
      for (const ws of this.connections.keys()) {
        ws.close();
      }
      this.connections.clear();
      this.signalingServer.close();
      this.signalingServer = null;
    }
  }
} 