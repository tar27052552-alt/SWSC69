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

function transformGoogleDriveUrl(url) {
  if (!url) return "";
  let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

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
    const directUrl = transformGoogleDriveUrl(item.image_url);
    try {
      const res = await fetch(directUrl);
      console.log(`Title: ${item.title} | Status: ${res.status} | Content-Type: ${res.headers.get('content-type')} | Size: ${res.headers.get('content-length')} bytes`);
    } catch (e) {
      console.log(`Title: ${item.title} failed:`, e.message);
    }
  }
}
check();
