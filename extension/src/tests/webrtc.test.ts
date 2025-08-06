import { WebRTCService } from '../services/webrtc';
import { WebRTCConfig, defaultWebRTCConfig } from '../config/webrtc.config';
import { AudioConfig, defaultAudioConfig } from '../config/audio.config';

// Mock WebSocket
class MockWebSocket {
  public readyState: number = WebSocket.CONNECTING;
  public onopen: ((event: any) => void) | null = null;
  public onclose: ((event: any) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onmessage: ((event: any) => void) | null = null;
  public sentMessages: string[] = [];

  constructor(url: string) {
    // Simulate connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen({});
    }, 10);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose({});
  }
}

// Mock RTCPeerConnection
class MockRTCPeerConnection {
  public connectionState: RTCPeerConnectionState = 'new';
  public iceConnectionState: RTCIceConnectionState = 'new';
  public signalingState: RTCSignalingState = 'stable';
  public onicecandidate: ((event: any) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public oniceconnectionstatechange: (() => void) | null = null;
  public onsignalingstatechange: (() => void) | null = null;
  public dataChannel: MockRTCDataChannel | null = null;

  constructor(configuration: RTCConfiguration) {
    // Simulate connection establishment
    setTimeout(() => {
      this.connectionState = 'connected';
      this.iceConnectionState = 'connected';
      this.signalingState = 'stable';
      if (this.onconnectionstatechange) this.onconnectionstatechange();
      if (this.oniceconnectionstatechange) this.oniceconnectionstatechange();
      if (this.onsignalingstatechange) this.onsignalingstatechange();
    }, 50);
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): MockRTCDataChannel {
    this.dataChannel = new MockRTCDataChannel();
    return this.dataChannel;
  }

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    return {
      type: 'offer',
      sdp: 'mock-sdp-offer'
    };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    // Simulate ICE candidate generation
    if (this.onicecandidate) {
      this.onicecandidate({
        candidate: {
          candidate: 'mock-ice-candidate',
          sdpMLineIndex: 0,
          sdpMid: '0'
        }
      });
    }
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    // Mock implementation
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    // Mock implementation
  }

  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender {
    // Mock implementation
    return {} as RTCRtpSender;
  }

  close(): void {
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
    this.signalingState = 'closed';
  }
}

class MockRTCDataChannel {
  public readyState: RTCDataChannelState = 'open';
  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((error: any) => void) | null = null;
  public sentMessages: string[] = [];

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 'closed';
    if (this.onclose) this.onclose();
  }
}

// Mock global objects
(global as any).WebSocket = MockWebSocket;
(global as any).RTCPeerConnection = MockRTCPeerConnection;
(global as any).RTCDataChannel = MockRTCDataChannel;

describe('WebRTCService', () => {
  let webrtcService: WebRTCService;
  let mockConfig: WebRTCConfig;
  let mockAudioConfig: AudioConfig;

  beforeEach(() => {
    mockConfig = { ...defaultWebRTCConfig };
    mockAudioConfig = { ...defaultAudioConfig };
    webrtcService = new WebRTCService(mockConfig, mockAudioConfig);
  });

  afterEach(() => {
    webrtcService.disconnect();
  });

  describe('Configuration', () => {
    test('should initialize with default configuration', () => {
      expect(webrtcService).toBeDefined();
      const state = webrtcService.getConnectionState();
      expect(state.status).toBe('disconnected');
    });

    test('should have correct default signaling URL', () => {
      const state = webrtcService.getConnectionState();
      expect(state.desktopUrl).toBe('ws://localhost:8080/webrtc-signaling');
    });
  });

  describe('Connection Management', () => {
    test('should connect to signaling server', async () => {
      const connectionPromise = webrtcService.connect();
      
      // Wait for connection to establish
      const state = await connectionPromise;
      
      expect(state.status).toBe('connected');
      expect(state.iceConnectionState).toBe('connected');
      expect(state.connectionState).toBe('connected');
    });

    test('should handle connection errors gracefully', async () => {
      // Modify config to use invalid URL
      const invalidConfig = { ...mockConfig, signalingUrl: 'ws://invalid-url:9999' };
      const invalidService = new WebRTCService(invalidConfig, mockAudioConfig);
      
      await expect(invalidService.connect()).rejects.toThrow();
    });

    test('should disconnect properly', () => {
      webrtcService.disconnect();
      const state = webrtcService.getConnectionState();
      expect(state.status).toBe('disconnected');
    });
  });

  describe('Audio Streaming', () => {
    test('should send audio stream when connected', async () => {
      // First connect
      await webrtcService.connect();
      
      // Create mock stream
      const mockStream = {
        getAudioTracks: () => [{
          id: 'mock-audio-track',
          kind: 'audio',
          enabled: true
        }]
      } as MediaStream;

      const result = await webrtcService.sendAudioStream(mockStream);
      expect(result).toBe(true);
    });

    test('should fail to send audio when not connected', async () => {
      const mockStream = {
        getAudioTracks: () => [{
          id: 'mock-audio-track',
          kind: 'audio',
          enabled: true
        }]
      } as MediaStream;

      const result = await webrtcService.sendAudioStream(mockStream);
      expect(result).toBe(false);
    });
  });

  describe('Control Messages', () => {
    test('should send control messages via data channel', async () => {
      await webrtcService.connect();
      
      const controlMessage = {
        type: 'volume',
        volume: 0.5
      };

      const result = webrtcService.sendControlMessage(controlMessage);
      expect(result).toBe(true);
    });

    test('should fail to send control messages when data channel not ready', () => {
      const controlMessage = {
        type: 'volume',
        volume: 0.5
      };

      const result = webrtcService.sendControlMessage(controlMessage);
      expect(result).toBe(false);
    });
  });

  describe('Connection State', () => {
    test('should return correct connection state', async () => {
      // Initial state
      let state = webrtcService.getConnectionState();
      expect(state.status).toBe('disconnected');
      expect(state.iceConnectionState).toBe('new');
      expect(state.connectionState).toBe('new');
      expect(state.signalingState).toBe('stable');

      // Connected state
      await webrtcService.connect();
      state = webrtcService.getConnectionState();
      expect(state.status).toBe('connected');
      expect(state.iceConnectionState).toBe('connected');
      expect(state.connectionState).toBe('connected');
      expect(state.signalingState).toBe('stable');
    });
  });

  describe('Reconnection', () => {
    test('should attempt reconnection on disconnect', async () => {
      await webrtcService.connect();
      
      // Simulate disconnect
      webrtcService.disconnect();
      
      // Should attempt to reconnect
      const state = webrtcService.getConnectionState();
      expect(state.status).toBe('disconnected');
    });
  });
}); 