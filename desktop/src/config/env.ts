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
        host: getEnvVar('WEBRTC_HOST', 'localhost'),
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
        ]
    },
    deepgram: {
        apiKey: getEnvVar('DEEPGRAM_API_KEY', ''),
        language: getEnvVar('DEEPGRAM_LANGUAGE', 'fr'),
        model: getEnvVar('DEEPGRAM_MODEL', 'nova'),
        transcriptionPort: getEnvNumber('DEEPGRAM_TRANSCRIPTION_PORT', 3000)
    },
    isDevelopment: getEnvVar('NODE_ENV', 'production') === 'development'
};
