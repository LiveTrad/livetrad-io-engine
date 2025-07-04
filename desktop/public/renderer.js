// Audio monitoring state
let audioChunksCount = 0;
let lastAudioLevel = 0;
let isPlaying = false;

// Update connection status
function updateStatus(isConnected, details = {}) {
    const statusElement = document.getElementById('status');
    const statsElement = document.getElementById('stats');

    if (isConnected) {
        statusElement.className = 'status connected';
        statusElement.textContent = 'Connected to extension';
        
        // Update stats
        statsElement.innerHTML = `
            <h3>Connection Details</h3>
            <div class="stat-item">
                <strong>Client ID:</strong> ${details.clientId || 'Unknown'}
            </div>
            <div class="stat-item">
                <strong>Connected Since:</strong> ${new Date().toLocaleTimeString()}
            </div>
            <div class="stat-item">
                <strong>Status:</strong> Active
            </div>
        `;
        statsElement.style.display = 'block';
    } else {
        statusElement.className = 'status disconnected';
        statusElement.textContent = 'Waiting for connection...';
        statsElement.style.display = 'none';
        resetAudioMonitor();
    }
}

// Update audio level visualization
function updateAudioLevel(audioData) {
    const levelBar = document.getElementById('audioLevelBar');
    const chunksElement = document.getElementById('audioChunksReceived');
    const averageElement = document.getElementById('averageLevel');
    const statusElement = document.getElementById('streamingStatus');

    // Calculate audio level
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
        sum += Math.abs(audioData[i]);
    }
    const averageLevel = sum / audioData.length;
    const normalizedLevel = Math.min(Math.max(averageLevel * 100, 0), 100);

    // Update UI
    levelBar.style.width = `${normalizedLevel}%`;
    audioChunksCount++;
    chunksElement.textContent = `Chunks received: ${audioChunksCount}`;
    averageElement.textContent = `Average level: ${normalizedLevel.toFixed(2)} dB`;
    statusElement.textContent = 'Streaming active';

    lastAudioLevel = normalizedLevel;
}

// Reset audio monitor
function resetAudioMonitor() {
    const levelBar = document.getElementById('audioLevelBar');
    const chunksElement = document.getElementById('audioChunksReceived');
    const averageElement = document.getElementById('averageLevel');
    const statusElement = document.getElementById('streamingStatus');

    levelBar.style.width = '0%';
    audioChunksCount = 0;
    chunksElement.textContent = 'Chunks received: 0';
    averageElement.textContent = 'Average level: 0 dB';
    statusElement.textContent = 'No audio streaming';
}

// Listen for connection changes
window.api.onConnectionChange((status, details) => {
    console.log('Connection status changed:', status, 'details:', details);
    updateStatus(status, details);
});

// Listen for audio data
window.api.onAudioData((audioData) => {
    console.log('Received audio chunk:', audioData.length, 'samples');
    updateAudioLevel(audioData);
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { status, details } = await window.api.getConnectionStatus();
        updateStatus(status, details);
    } catch (error) {
        console.error('Error getting connection status:', error);
        updateStatus(false);
    }
});

// Check for audio inactivity
setInterval(() => {
    const statusElement = document.getElementById('streamingStatus');
    if (audioChunksCount > 0 && Date.now() - lastAudioUpdate > 5000) {
        statusElement.textContent = 'No audio data received for 5 seconds';
    }
}, 1000);

// Éléments DOM
const togglePlaybackCheckbox = document.getElementById('togglePlaybackCheckbox');
const playbackStatus = document.getElementById('playbackStatus');

// Gestionnaire d'événements pour la checkbox
togglePlaybackCheckbox.addEventListener('change', async () => {
    try {
        const result = await window.electron.ipcRenderer.invoke('toggle-playback');
        if (result.success) {
            isPlaying = result.isPlaying;
            togglePlaybackCheckbox.checked = isPlaying;
            playbackStatus.textContent = `Playback: ${isPlaying ? 'ON' : 'OFF'}`;
            playbackStatus.style.color = isPlaying ? '#4CAF50' : '#F44336';
            console.log(`Playback ${isPlaying ? 'started' : 'stopped'}`);
        } else {
            console.error('Failed to toggle playback:', result.error);
        }
    } catch (error) {
        console.error('Error toggling playback:', error);
    }
});

// Mettre à jour l'état de la checkbox au démarrage
async function updatePlaybackCheckboxState() {
    try {
        const status = await window.electron.ipcRenderer.invoke('get-playback-status');
        isPlaying = status.isPlaying;
        togglePlaybackCheckbox.checked = isPlaying;
        playbackStatus.textContent = `Playback: ${isPlaying ? 'ON' : 'OFF'}`;
        playbackStatus.style.color = isPlaying ? '#4CAF50' : '#F44336';
    } catch (error) {
        console.error('Error getting playback status:', error);
    }
}

// Appeler au démarrage
updatePlaybackCheckboxState();
