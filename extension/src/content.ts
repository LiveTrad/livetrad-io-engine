// Créer un script dynamiquement pour charger le module
const script = document.createElement('script');
script.type = 'module';
script.src = chrome.runtime.getURL('generated/content-module.js');
(document.head || document.documentElement).appendChild(script);

console.log('LiveTrad: Content script loaded');

// Communication avec le module via des événements personnalisés
window.addEventListener('livetrad-status', ((event: Event) => {
  const customEvent = event as CustomEvent<string>;
  console.log('LiveTrad status:', customEvent.detail);
}) as EventListener);
