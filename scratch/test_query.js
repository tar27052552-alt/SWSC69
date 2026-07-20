import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
env.split('\n').forEach(l => {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('VITE_SUPABASE_ANON_KEY=')) key = l.split('=')[1].trim();
});

async function test() {
  const cat1 = encodeURIComponent('ประกาศ');
  const cat2 = encodeURIComponent('ประกาศ_ซ่อน');
  const reqUrl = `${url}/rest/v1/web_news?select=id,headline,detail,image_url,category,created_at,submitted_by&category=not.in.(${cat1},${cat2})&order=created_at.desc&limit=30`;
  console.log('Fetching:', reqUrl);
  const res = await fetch(reqUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  console.log('Result:', data);
}

test();
