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
    }
}

// Listen for connection changes
window.api.onConnectionChange((status) => {
    console.log('Connection status changed:', status);
    updateStatus(status);
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const status = await window.api.getConnectionStatus();
        updateStatus(status);
    } catch (error) {
        console.error('Error getting connection status:', error);
        updateStatus(false);
    }
});
