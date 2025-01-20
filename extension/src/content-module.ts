console.log('LiveTrad: Content script loaded');

console.log('LiveTrad: Module initializing');

// Écouter les messages du popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('LiveTrad: Received message in content script:', message);
  if (message.type === 'getStatus') {
    sendResponse({ status: 'idle' });
  }
});

// Nettoyer lors de la fermeture de la page
window.addEventListener('unload', async () => {
});