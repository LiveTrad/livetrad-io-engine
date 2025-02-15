// Update connection status
function updateStatus(isConnected) {
    const statusElement = document.getElementById('status');
    if (isConnected) {
        statusElement.className = 'status connected';
        statusElement.textContent = 'Connected to extension';
    } else {
        statusElement.className = 'status disconnected';
        statusElement.textContent = 'Waiting for connection...';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const status = await window.api.getConnectionStatus();
        updateStatus(status);
    } catch (error) {
        console.error('Error getting connection status:', error);
    }
});
