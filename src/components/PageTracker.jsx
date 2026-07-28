import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function PageTracker() {
  const location = useLocation();

  useEffect(() => {
    // Record page view on route change
    const recordView = async () => {
      try {
        await supabase.rpc('increment_page_view', { page_path: location.pathname });
      } catch (err) {
        // Silently fail if RPC is not set up yet or errors occur
        console.error('Failed to record page view:', err);
      }
    };

    recordView();
  }, [location.pathname]);

  return null;
}
