# LiveTrad Technical Stack 🛠️

## Architecture Globale

### Architecture Client-Serveur
```
Client (Extension Chrome)
├── Capture Audio (WebRTC)
├── Interface Utilisateur (React)
└── Gestion des flux audio (MediaStream API)

Cloud Server
├── Modèles ML
│   ├── Speech-to-Text (Whisper)
│   ├── Traduction
│   └── Text-to-Speech (Coqui TTS)
├── Gestion des Sessions
└── Scaling Automatique
```

## Technology Stack by Version

### Version 1.0 - Basic Translation Layer

#### Frontend (Extension)
- **Framework**: React + TypeScript
- **Build Tool**: Vite
- **Extension Framework**: Chrome Extension Manifest V3
- **Audio Capture**: WebRTC + MediaStream API
- **State Management**: Redux Toolkit
- **UI Components**: Material-UI
- **WebSocket Client**: Socket.io-client
- **Rôle**: Capture et lecture audio uniquement

#### Backend Cloud
- **Infrastructure**: AWS/GCP
- **Runtime**: Python 3.11+
- **Framework**: FastAPI
- **WebSocket**: WebSocket for FastAPI
- **Speech-to-Text**: Whisper
- **Translation**: Custom NMT model
- **Text-to-Speech**: Coqui TTS
- **Scaling**: Kubernetes
- **Load Balancing**: nginx
- **Monitoring**: Prometheus + Grafana

#### Development Tools
- ESLint/Prettier
- Jest for testing
- GitHub Actions for CI/CD
- Docker Compose

### Version 2.1 - Gender-Based Voice Attribution

#### Cloud Components
- **Voice Analysis**: pyannote.audio
- **Voice Library**: Coqui TTS voices
- **Gender Detection**: Custom ML model
- **Audio Processing**: librosa
- **Stream Processing**: RxPY

#### Performance Optimization
- GPU Acceleration
- Stream Processing
- Caching Strategy
- Load Distribution

### Version 2.2 - Custom Voice Profiles

#### Voice Processing (Cloud)
- **Voice Analysis**: OpenVoice (analysis mode)
- **Profile Storage**: Redis Cluster
- **Audio Processing**: PyDub
- **Stream Management**: Apache Kafka
- **Memory Management**: Distributed Cache

#### Performance Tools
- Distributed Processing
- Auto-scaling
- Load balancing
- Performance monitoring

### Version 3.0 - Bidirectional Communication

#### Audio Flow Process
```
1. Capture Audio (Client)
   └── Intercepte le flux audio avant Meet/Zoom

2. Preprocessing (Client)
   ├── Compression audio
   └── Streaming vers le cloud

3. Cloud Processing
   ├── STT (Speech-to-Text)
   ├── Translation
   ├── Voice Cloning (OpenVoice)
   └── TTS avec voix clonée

4. Return Flow
   ├── Streaming audio traduit
   └── Injection dans le flux Meet/Zoom
```

#### Technologies Clés
- **Voice Cloning**: OpenVoice
- **Audio Manipulation**: Virtual Audio Device
- **Stream Management**: WebRTC + MediaStream
- **Security**: End-to-end encryption
- **Profile Storage**: Distributed Database

## System Requirements

### Client (Minimal)
- Chrome/Firefox/Edge récent
- 2GB RAM disponible
- Connexion Internet stable (>2Mbps)
- Processeur double cœur

### Cloud Infrastructure
- Serveurs haute performance
- GPUs pour ML
- Load balancers
- Distributed cache
- Monitoring system
- Backup system

## Performance Targets

### Latency Targets
- Version 1.0: < 500ms
- Version 2.x: < 750ms
- Version 3.0: < 1000ms

### Bandwidth Usage
- Audio Upload: ~50KB/s
- Audio Download: ~50KB/s
- Total: ~100KB/s par utilisateur

## Security Architecture

### Client Security
- Chiffrement local
- Secure WebSocket
- Pas de stockage local sensible

### Cloud Security
- End-to-end encryption
- Token-based auth
- Rate limiting
- DDoS protection
- GDPR compliance

## Deployment Strategy

### CI/CD Pipeline
```
Code Push → Tests → Build → Security Scan → Deploy
```

### Monitoring
- Real-time metrics
- Error tracking
- Usage analytics
- Performance monitoring
- Security alerts
