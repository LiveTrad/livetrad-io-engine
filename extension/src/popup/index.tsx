import React from 'react';
import ReactDOM from 'react-dom/client';
import { config } from '../core/config';

function Popup() {
  return (
    <div className="p-4">
      <h1 className="text-lg font-bold mb-4">LiveTrad</h1>
      <div className="text-sm">
        <p>Version: {config.app.version}</p>
        <p>Status: Ready to translate</p>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}
