import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function PageTracker() {
  const location = useLocation();

  useEffect(() => {
    // Record page view on route change
    const recordView = async () => {
      try {
        const now = Date.now();
        const storageKey = `last_visit_${location.pathname}`;
        const lastVisit = localStorage.getItem(storageKey);
        const timeLimit = 20 * 60 * 1000; // 20 minutes in ms

        if (!lastVisit || (now - parseInt(lastVisit, 10) > timeLimit)) {
          await supabase.rpc('increment_page_view', { page_path: location.pathname });
          localStorage.setItem(storageKey, now.toString());
        }
      } catch (err) {
        // Silently fail if RPC is not set up yet or errors occur
        console.error('Failed to record page view:', err);
      }
    };

    recordView();
  }, [location.pathname]);

  return null;
}
