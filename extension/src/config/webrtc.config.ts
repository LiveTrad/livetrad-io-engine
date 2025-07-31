export interface WebRTCConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  maxReconnectAttempts: number;
  initialReconnectDelay: number;
  maxReconnectDelay: number;
}

export const defaultWebRTCConfig: WebRTCConfig = {
  signalingUrl: 'ws://localhost:8081',
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    },
    {
      urls: [
        'stun:stun.stunprotocol.org:3478'
      ]
    }
  ],
  maxReconnectAttempts: 5,
  initialReconnectDelay: 1000,
  maxReconnectDelay: 30000
}; 