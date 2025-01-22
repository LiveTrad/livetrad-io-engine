import { AudioCapture } from './core/audioCapture';

console.log('LiveTrad Offscreen: Script loaded');

const audioCapture = new AudioCapture();

// Handle messages from the background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('LiveTrad Offscreen: Received message:', message);

  if (message.type === 'START_CAPTURE') {
    audioCapture.start().then(sendResponse);
    return true;
  }

  if (message.type === 'STOP_CAPTURE') {
    audioCapture.stop();
    sendResponse({ success: true });
  }
});

// Clean up when the page is unloaded
window.addEventListener('unload', () => {
  console.log('LiveTrad Offscreen: Page unloading');
  audioCapture.stop();
});
