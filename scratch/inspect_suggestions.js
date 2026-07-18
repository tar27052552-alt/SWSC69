const supabaseUrl = 'https://pzlcxctnnhjqpbhwcxqx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bGN4Y3RubmhqcXBiaHdjeHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjA0ODgsImV4cCI6MjA5NDY5NjQ4OH0.LsofMV8YVlqFxir2o76Mbw4fNOHljVrealsew4XXQkY';

async function check() {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }
    });
    const data = await res.json();
    console.log('API Response:', data);
  } catch (err) {
    console.error(err);
  }
}

check();
