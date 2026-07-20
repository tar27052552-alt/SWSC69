import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
env.split('\n').forEach(l => {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('VITE_SUPABASE_ANON_KEY=')) key = l.split('=')[1].trim();
});

async function testCount() {
  const cat1 = encodeURIComponent('ประกาศ');
  const cat2 = encodeURIComponent('ประกาศ_ซ่อน');
  const reqUrl = `${url}/rest/v1/web_news?select=id&category=not.in.(${cat1},${cat2})`;
  const start = Date.now();
  const res = await fetch(reqUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  console.log('Count:', data.length, 'Time:', Date.now() - start, 'ms');
}

testCount();
