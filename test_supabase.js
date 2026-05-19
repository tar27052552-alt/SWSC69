const supabaseUrl = 'https://pzlcxctnnhjqpbhwcxqx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bGN4Y3RubmhqcXBiaHdjeHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjA0ODgsImV4cCI6MjA5NDY5NjQ4OH0.LsofMV8YVlqFxir2o76Mbw4fNOHljVrealsew4XXQkY';

console.log('Testing connection to:', supabaseUrl);

async function test() {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/login_student`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_student_id: '00000', p_password: 'admin' }),
    });
    
    console.log('Status:', res.status);
    console.log('Status Text:', res.statusText);
    const text = await res.text();
    console.log('Response Body:', text);
  } catch (err) {
    console.error('Error during fetch:', err);
  }
}

test();
