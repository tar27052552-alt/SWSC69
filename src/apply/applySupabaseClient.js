import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Dedicated auth storage key so student Google Sign-In on /apply/ is completely isolated
// from the council admin session on /admin/ (prevents cross-tab AuthContext auto sign-out).
export const applySupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'swsc-apply-auth-token',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
