import { ConnectionState } from '../types';
import { WebRTCConfig, defaultWebRTCConfig } from '../config/webrtc.config';
import { AudioConfig, defaultAudioConfig } from '../config/audio.config';

export interface WebRTCConnectionState extends ConnectionState {
  iceConnectionState: RTCIceConnectionState;
  connectionState: RTCPeerConnectionState;
  signalingState: RTCSignalingState;
}

export interface WebRTCMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'control';
  data: any;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private config: WebRTCConfig;
  private audioConfig: AudioConfig;
  private signalingWebSocket: WebSocket | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(config: WebRTCConfig = defaultWebRTCConfig, audioConfig: AudioConfig = defaultAudioConfig) {
    this.config = config;
    this.audioConfig = audioConfig;
  }

  public async connect(): Promise<WebRTCConnectionState> {
    return new Promise((resolve, reject) => {
      try {
        this.isConnecting = true;
        console.log('[WebRTC] Attempting to connect to signaling server:', this.config.signalingUrl);
        
        // Connect to signaling server first
        this.signalingWebSocket = new WebSocket(this.config.signalingUrl);
        
        this.signalingWebSocket.onopen = async () => {
          console.log('[WebRTC] Signaling connection established');
          await this.initializePeerConnection();
          resolve(this.getConnectionState());
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
      // Create RTCPeerConnection with optimized configuration
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all'
      });

      // Set up event listeners
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignalingMessage({
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

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(
        this.config.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
        this.config.maxReconnectDelay
      );
      
      this.reconnectTimeout = setTimeout(() => {
        console.log(`[WebRTC] Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
        this.connect();
      }, delay);
    }
  }
} 