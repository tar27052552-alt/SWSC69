import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabase = createClient(
  env.VITE_SUPABASE_URL || '',
  env.VITE_SUPABASE_ANON_KEY || ''
);

async function check() {
  const { data, error } = await supabase
    .from('obec_line')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    console.error('Error fetching:', error);
    return;
  }
  
  for (const item of data) {
    let match = item.image_url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      match = item.image_url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    }
    if (match && match[1]) {
      const id = match[1];
      const thumbUrl = `https://drive.google.com/thumbnail?id=${id}`;
      try {
        const res = await fetch(thumbUrl);
        console.log(`Title: ${item.title} | Thumbnail Status: ${res.status} | Content-Type: ${res.headers.get('content-type')}`);
      } catch (e) {
        console.log(`Title: ${item.title} failed:`, e.message);
      }
    }
  }
}
check();
