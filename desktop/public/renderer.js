// État de l'application
let audioChunksCount = 0;
let isAuthenticated = false;

// Éléments du DOM
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const loginBtn = document.getElementById('loginBtn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('loginError');

// Récupérer ipcRenderer
const { ipcRenderer } = window.require('electron');

// Gestion de la connexion
async function handleLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const loginBtn = document.getElementById('loginBtn');
    
    if (!username || !password) {
        showError('Veuillez remplir tous les champs');
        return;
    }
    
    try {
        // Désactiver le bouton pendant la tentative de connexion
        loginBtn.disabled = true;
        loginBtn.textContent = 'Connexion...';
        
        // Utiliser ipcRenderer directement
        const result = await ipcRenderer.invoke('authenticate', { username, password });
        if (result.success) {
            isAuthenticated = true;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'block';
            
            // Réinitialiser les champs
            usernameInput.value = '';
            passwordInput.value = '';
        } else {
            showError('Identifiants incorrects');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Se connecter';
        }
    } catch (error) {
        console.error('Erreur de connexion:', error);
        showError('Erreur de connexion au serveur');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Se connecter';
    }
}

// Afficher un message d'erreur
function showError(message) {
    loginError.textContent = message;
    setTimeout(() => {
        loginError.textContent = '';
    }, 3000);
}

// Écouteurs d'événements
if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
}

// Permettre la soumission avec Entrée
if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
}

// Transcription state
let isTranscriptionActive = false;
let transcriptionHistory = [];
const MAX_TRANSCRIPTION_HISTORY = 50;
let currentInterimText = '';
let detectedLanguage = 'Auto';

// Format date for display
function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp);
        return date.toLocaleString();
    } catch (e) {
        console.error('Error formatting date:', e);
        return 'N/A';
    }
}

// Fonction pour activer/désactiver les contrôles de l'application
function enableAppControls(enabled) {
    const controls = document.querySelectorAll('.control');
    controls.forEach(control => {
        if (enabled) {
            control.removeAttribute('disabled');
        } else {
            control.setAttribute('disabled', 'disabled');
        }
    });
}

function updateStatus(status, details = {}) {
    const connectionStatus = document.getElementById('connectionStatus');
    if (!connectionStatus) return;

    // Supprimer toutes les classes d'état
    connectionStatus.classList.remove('connected', 'disconnected', 'connecting');
    
    // Mettre à jour l'état en fonction du statut reçu
    if (status === 'connected') {
        connectionStatus.classList.add('connected');
        const statusText = connectionStatus.querySelector('span');
        if (statusText) statusText.textContent = 'Connected';
    } 
    else if (status === 'connecting') {
        connectionStatus.classList.add('connecting');
        const statusText = connectionStatus.querySelector('span');
        if (statusText) statusText.textContent = 'Connecting';
    }
    else {
        // Pour 'disconnected' ou tout autre état
        connectionStatus.classList.add('disconnected');
        const statusText = connectionStatus.querySelector('span');
        if (statusText) statusText.textContent = 'Disconnected';
    }

    // Mettre à jour les détails de connexion si disponibles
    if (details) {
        console.log('Connection details:', details);
        // Vous pouvez ajouter ici la logique pour afficher plus de détails si nécessaire
    }
}

// Function to handle audio data (if needed)
function handleAudioData(audioData) {
    // Simple counter for received audio chunks
    audioChunksCount++;
    const chunksElement = document.getElementById('audioChunksReceived');
    if (chunksElement) {
        chunksElement.textContent = `Chunks received: ${audioChunksCount}`;
    }
}

// Listen for connection changes
ipcRenderer.on('connection-change', (_event, data) => {
    const status = data?.status;
    const details = data?.details || {};
    const isConnected = status || details.connectedState === 'connected';
    console.log('Connection status changed:', status, 'details:', details);
    updateStatus(isConnected, details);
});

// Listen for audio data
ipcRenderer.on('audio-stats', (_event, stats) => {
    // We only need to count updates for UI feedback
    audioChunksCount++;
    const chunksElement = document.getElementById('audioChunksReceived');
    if (chunksElement) {
        chunksElement.textContent = `Chunks received: ${audioChunksCount}`;
    }
});

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Application initialized');

    updateStatus(false, {});
    
    // Check initial connection status
    ipcRenderer.invoke('get-connection-status')
        .then(({ status, details }) => {
            console.log('Initial connection status:', status, 'details:', details);
            updateStatus(status, details);
        })
        .catch(error => {
            console.error('Error getting connection status:', error);
            updateStatus(false);
        });

    // Transcription elements (simplified)
    const toggleTranscriptionCheckbox = document.getElementById('toggleTranscriptionCheckbox');
    
    // Initialize transcription if elements exist
    if (toggleTranscriptionCheckbox) {
        toggleTranscriptionCheckbox.checked = isTranscriptionActive;
        
        toggleTranscriptionCheckbox.addEventListener('change', () => {
            isTranscriptionActive = toggleTranscriptionCheckbox.checked;
            console.log('Transcription toggled:', isTranscriptionActive);
            // Add any additional transcription handling here
        });
    }
});

// Update transcription status
function updateTranscriptionStatus() {
    if (isTranscriptionActive) {
        transcriptionStatus.textContent = 'Transcription: ACTIVE';
        transcriptionStatus.style.color = '#4CAF50';
    } else {
        transcriptionStatus.textContent = 'Transcription: DÉSACTIVÉE';
        transcriptionStatus.style.color = '#666';
    }
}

// Add transcription to display (YouTube style)
function addTranscriptionToDisplay(transcriptionData) {
    const currentTranscription = document.getElementById('currentTranscription');
    const completedTranscriptions = document.getElementById('completedTranscriptions');
    
    if (transcriptionData.isFinal) {
        // Transcription finale - ajouter à l'historique
        const completedItem = document.createElement('div');
        completedItem.className = 'completed-transcript';
        
        const transcriptText = document.createElement('span');
        transcriptText.textContent = transcriptionData.transcript;
        
        const confidenceText = document.createElement('span');
        confidenceText.className = 'transcript-confidence';
        confidenceText.textContent = ` (${(transcriptionData.confidence * 100).toFixed(1)}%)`;
        
        const languageBadge = document.createElement('span');
        languageBadge.className = 'language-indicator';
        languageBadge.textContent = detectedLanguage;
        
        const timestamp = document.createElement('div');
        timestamp.style.fontSize = '0.8em';
        timestamp.style.color = '#999';
        timestamp.style.marginTop = '2px';
        timestamp.textContent = transcriptionData.timestamp.toLocaleTimeString();
        
        completedItem.appendChild(transcriptText);
        completedItem.appendChild(confidenceText);
        completedItem.appendChild(languageBadge);
        completedItem.appendChild(timestamp);
        
        completedTranscriptions.appendChild(completedItem);
        
        // Vider la transcription courante
        currentTranscription.innerHTML = '<span style="color: #666; font-style: italic;">En attente...</span>';
        currentInterimText = '';
        
        // Scroll to bottom
        completedTranscriptions.scrollTop = completedTranscriptions.scrollHeight;
        
    } else {
        // Transcription intermédiaire - mettre à jour la ligne courante
        currentInterimText = transcriptionData.transcript;
        currentTranscription.innerHTML = `
            <span>${transcriptionData.transcript}</span>
            <span class="transcript-confidence">(${(transcriptionData.confidence * 100).toFixed(1)}%)</span>
            <span class="language-indicator">${detectedLanguage}</span>
        `;
    }
}

// Update transcription display
function updateTranscriptionDisplay() {
    transcriptionDisplay.innerHTML = '';
    
    if (transcriptionHistory.length === 0) {
        transcriptionDisplay.innerHTML = '<div style="color: #666; font-style: italic;">En attente de transcription...</div>';
        return;
    }
    
    transcriptionHistory.forEach(item => {
        transcriptionDisplay.appendChild(item.cloneNode(true));
    });
    
    // Scroll to bottom
    transcriptionDisplay.scrollTop = transcriptionDisplay.scrollHeight;
}

// Show transcription error
function showTranscriptionError(message) {
    transcriptionError.textContent = message;
    transcriptionError.style.display = 'block';
}

// Hide transcription error
function hideTranscriptionError() {
    transcriptionError.style.display = 'none';
}

// Initialize transcription status
async function updateTranscriptionCheckboxState() {
    try {
        const status = await ipcRenderer.invoke('get-transcription-status');
        isTranscriptionActive = status.isActive || status.active;
        const toggleCheckbox = document.getElementById('toggleTranscription');
        if (toggleCheckbox) {
            toggleCheckbox.checked = isTranscriptionActive;
        }
        updateTranscriptionStatus();
    } catch (error) {
        console.error('Error getting transcription status:', error);
    }
}

// Call on startup
updateTranscriptionCheckboxState();
