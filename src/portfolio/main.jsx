import React from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import PortfolioPublic from './PortfolioPublic';
import '../styles/portfolio.css';
// Public browsing never inherits the admin session or exposes drafts.
const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
createRoot(document.getElementById('root')).render(<React.StrictMode><PortfolioPublic client={client} /></React.StrictMode>);
