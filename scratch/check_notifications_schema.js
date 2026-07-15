import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://pzlcxctnnhjqpbhwcxqx.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bGN4Y3RubmhqcXBiaHdjeHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjA0ODgsImV4cCI6MjA5NDY5NjQ4OH0.LsofMV8YVlqFxir2o76Mbw4fNOHljVrealsew4XXQkY');

async function run() {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching notifications schema:', error);
  } else {
    console.log('Notification schema keys:', data.length > 0 ? Object.keys(data[0]) : 'Empty table');
    console.log('Sample data:', data);
  }
}

run();
