import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const getEnvVar = (key: string, defaultValue: string = ''): string => {
    return process.env[key] || defaultValue;
};

const getEnvNumber = (key: string, defaultValue: number): number => {
    const value = process.env[key];
    return value ? parseInt(value, 10) : defaultValue;
};

export const config = {
    app: {
        name: getEnvVar('APP_NAME', 'LiveTrad Desktop'),
        version: getEnvVar('APP_VERSION', '1.0.0')
    },
    window: {
        width: getEnvNumber('WINDOW_WIDTH', 800),
        height: getEnvNumber('WINDOW_HEIGHT', 600),
        title: getEnvVar('WINDOW_TITLE', 'LiveTrad Desktop')
    },
    websocket: {
        port: getEnvNumber('WS_PORT', 8080),
        host: getEnvVar('WS_HOST', 'localhost')
    },
    webrtc: {
        signalingPort: getEnvNumber('WEBRTC_SIGNALING_PORT', 8081),
        host: getEnvVar('WEBRTC_HOST', '0.0.0.0'), // Écouter sur toutes les interfaces
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
            //   credential: 'password'
            // }
            
            // Configuration pour les tests locaux
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ],
        iceTransportPolicy: 'all', // Essayer à la fois relay et non-relay
        iceCandidatePoolSize: 10,  // Augmenter le pool de candidats
        iceServersConfig: {
            transportPolicy: 'all',
            iceCandidatePoolSize: 10
        },
        maxIceRestartAttempts: 3 // Nombre maximum de tentatives de redémarrage ICE
    },
    deepgram: {
        apiKey: getEnvVar('DEEPGRAM_API_KEY', ''),
        language: getEnvVar('DEEPGRAM_LANGUAGE', 'fr'),
        model: getEnvVar('DEEPGRAM_MODEL', 'nova'),
        transcriptionPort: getEnvNumber('DEEPGRAM_TRANSCRIPTION_PORT', 3000)
    },
    isDevelopment: getEnvVar('NODE_ENV', 'production') === 'development'
};
