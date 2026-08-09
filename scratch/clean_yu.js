import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
const lines = env.split('\n');
const envVars = {};
lines.forEach(l => {
  const [k, v] = l.split('=');
  if (k && v) envVars[k.trim()] = v.trim();
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function clean() {
  const targetUserId = 'eeeac987-28ce-4e7c-a1d4-3730e22f7cb8';

  console.log('1. Deleting discipline_fines for Yu...');
  const { data: dFines, error: e1 } = await supabase
    .from('discipline_fines')
    .delete()
    .eq('nickname', 'ยู');
  console.log('Deleted fines by nickname:', e1 || 'OK');

  const { error: e1b } = await supabase
    .from('discipline_fines')
    .delete()
    .eq('user_id', targetUserId);
  console.log('Deleted fines by user_id:', e1b || 'OK');

  // 2. Delete student_attendance for Yu
  await supabase.from('student_attendance').delete().eq('nickname', 'ยู');
  await supabase.from('student_attendance').delete().eq('user_id', targetUserId);

  // 3. Delete greeting_duty_checks & clean_duty_checks
  await supabase.from('greeting_duty_checks').delete().eq('nickname', 'ยู');
  await supabase.from('clean_duty_checks').delete().eq('nickname', 'ยู');
  await supabase.from('notifications').delete().eq('user_id', targetUserId);
  await supabase.from('event_participants').delete().eq('user_id', targetUserId);

  // 4. Clean up finance_fees.payments
  const { data: fees } = await supabase.from('finance_fees').select('id, payments');
  if (fees) {
    for (const f of fees) {
      if (f.payments && f.payments[targetUserId]) {
        const updated = { ...f.payments };
        delete updated[targetUserId];
        await supabase.from('finance_fees').update({ payments: updated }).eq('id', f.id);
        console.log('Cleaned fee payment for fee:', f.id);
      }
    }
  }

  // 5. Clean ALL orphaned discipline_fines (users no longer in users table)
  const { data: users } = await supabase.from('users').select('id, nickname');
  const validIds = new Set((users || []).map(u => String(u.id)));
  const validNicknames = new Set((users || []).map(u => u.nickname).filter(Boolean));

  const { data: allFines } = await supabase.from('discipline_fines').select('id, user_id, nickname');
  let deletedCount = 0;
  if (allFines) {
    for (const fine of allFines) {
      const idValid = fine.user_id && validIds.has(String(fine.user_id));
      const nickValid = fine.nickname && validNicknames.has(fine.nickname);
      if (!idValid && !nickValid) {
        await supabase.from('discipline_fines').delete().eq('id', fine.id);
        deletedCount++;
      }
    }
  }

  console.log(`CLEANUP COMPLETE! Deleted ${deletedCount} orphaned fines.`);
}
clean();
