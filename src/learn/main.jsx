import React from 'react';
import { createRoot } from 'react-dom/client';
import LearnApp from './LearnApp';
import './learn.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><LearnApp /></React.StrictMode>
);
