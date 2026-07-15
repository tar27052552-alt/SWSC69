import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://pzlcxctnnhjqpbhwcxqx.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bGN4Y3RubmhqcXBiaHdjeHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjA0ODgsImV4cCI6MjA5NDY5NjQ4OH0.LsofMV8YVlqFxir2o76Mbw4fNOHljVrealsew4XXQkY');

async function run() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, nickname, student_id, role');

  if (error) {
    console.error('Error fetching users:', error);
  } else {
    console.log('--- USER LIST ---');
    users.forEach(u => {
      console.log(`ID: ${u.id} | Name: ${u.name} | Nickname: ${u.nickname} | StudentId: ${u.student_id} | Role: ${u.role}`);
    });
  }
}

run();
