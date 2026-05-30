import { createClient } from '@supabase/supabase-js';

const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bGN4Y3RubmhqcXBiaHdjeHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjA0ODgsImV4cCI6MjA5NDY5NjQ4OH0.LsofMV8YVlqFxir2o76Mbw4fNOHljVrealsew4XXQkY';

async function run() {
  console.log('--- Fetching Server Date from Headers ---');
  try {
    const res = await fetch('https://pzlcxctnnhjqpbhwcxqx.supabase.co/rest/v1/', {
      method: 'HEAD', // HEAD request is lightweight
      headers: { apikey: supabaseAnonKey }
    });
    
    const serverDateStr = res.headers.get('date');
    console.log('Server Date Header:', serverDateStr);
    
    const serverDate = new Date(serverDateStr);
    console.log('Parsed Server Date:', serverDate.toString());
    console.log('Parsed Server ISO:', serverDate.toISOString());
  } catch (err) {
    console.error('Error fetching server date:', err);
  }
}

run();
