import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ApplyApp from './ApplyApp';
import './apply.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApplyApp />
  </StrictMode>,
);
