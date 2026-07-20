import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
env.split('\n').forEach(l => {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('VITE_SUPABASE_ANON_KEY=')) key = l.split('=')[1].trim();
});

async function test() {
  const reqUrl = `${url}/rest/v1/web_news?select=*&limit=1`;
  const res = await fetch(reqUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  console.log('Sample row:', data[0] ? Object.keys(data[0]) : data);
}

test();
