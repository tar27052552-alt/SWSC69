const supabaseUrl = 'https://pzlcxctnnhjqpbhwcxqx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bGN4Y3RubmhqcXBiaHdjeHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjA0ODgsImV4cCI6MjA5NDY5NjQ4OH0.LsofMV8YVlqFxir2o76Mbw4fNOHljVrealsew4XXQkY';

async function check() {
  try {
    const res29 = await fetch(`${supabaseUrl}/rest/v1/student_attendance?date=eq.2026-05-29&nickname=eq.โต๋`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }
    });
    console.log('Attendance 29:', await res29.json());

    const res30 = await fetch(`${supabaseUrl}/rest/v1/student_attendance?date=eq.2026-05-30&nickname=eq.โต๋`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` }
    });
    console.log('Attendance 30:', await res30.json());
  } catch (err) {
    console.error(err);
  }
}

check();
