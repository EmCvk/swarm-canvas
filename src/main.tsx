import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'dockview-react/dist/styles/dockview.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);