// Configuration de base compatible avec RTCConfiguration
interface BaseRTCConfig extends Omit<RTCConfiguration, 'iceServers' | 'iceTransportPolicy' | 'sdpSemantics'> {
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  // Note: sdpSemantics n'est pas inclus ici car il n'est pas dans le type standard RTCConfiguration
}

// Configuration étendue pour WebRTC
export interface WebRTCConfig extends BaseRTCConfig {
  // URL du serveur de signalisation (propriété personnalisée)
  signalingUrl: string;
  
  // Configuration de reconnexion (propriétés personnalisées)
  maxReconnectAttempts: number;
  initialReconnectDelay: number;
  maxReconnectDelay: number;
  
  // Délai avant échec de la connexion (en millisecondes)
  iceConnectionTimeout?: number;
  
  // Sémantique SDP (propriété non standard mais largement supportée)
  // Utilisée lors de la création de la connexion RTCPeerConnection
  sdpSemantics?: 'unified-plan' | 'plan-b';
}

export const defaultWebRTCConfig: WebRTCConfig = {
  // URL du serveur de signalisation
  signalingUrl: 'ws://localhost:8081',
  
  // Configuration des serveurs ICE
  iceServers: [
    // Serveurs STUN publics (essentiels pour la découverte des pairs)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    
    // Configuration pour les serveurs TURN (nécessaires derrière des NATs restrictifs)
    // Remplacez par vos propres identifiants pour la production
    // {
    //   urls: [
    //     'turn:your-turn-server.com:3478',
    //     'turns:your-turn-server.com:5349'
    //   ],
    //   username: 'your-username',
    //   credential: 'your-credential',
    //   credentialType: 'password'
    // }
  ],
  
  // Configuration de la connexion WebRTC
  iceTransportPolicy: 'all', // 'relay' pour forcer TURN si nécessaire
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 10, // Taille du pool de candidats ICE
  // Note: sdpSemantics est défini séparément car ce n'est pas une propriété standard de RTCConfiguration
  sdpSemantics: 'unified-plan' as const, // Format SDP moderne
  
  // Configuration de reconnexion
  maxReconnectAttempts: 10, // Nombre maximum de tentatives de reconnexion
  initialReconnectDelay: 1000, // Délai initial de 1 seconde
  maxReconnectDelay: 10000, // Délai maximum de 10 secondes
  
  // Délai avant échec de la connexion (en millisecondes)
  iceConnectionTimeout: 10000
};