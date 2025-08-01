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
    // Serveurs STUN publics
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.voipbuster.com:3478' },
    
    // Configuration pour les serveurs TURN (à remplacer par vos propres identifiants si nécessaire)
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'username',
    //   credential: 'password',
    //   urls: 'turn:your-turn-server.com:3478?transport=tcp',
    //   urls: 'turn:your-turn-server.com:3478?transport=udp'
    // }
    
    // Configuration pour les tests locaux
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  maxReconnectAttempts: 10, // Augmenter le nombre de tentatives de reconnexion
  initialReconnectDelay: 1000,
  maxReconnectDelay: 10000 // Réduire le délai maximum entre les tentatives
};