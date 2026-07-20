import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
env.split('\n').forEach(l => {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim();
  if (l.startsWith('VITE_SUPABASE_ANON_KEY=')) key = l.split('=')[1].trim();
});

async function checkAnnouncements() {
  const cat = encodeURIComponent('ประกาศ');
  const reqUrl = `${url}/rest/v1/web_news?select=id,headline,detail,category,image_url,created_at&category=eq.${cat}&order=created_at.desc`;
  const res = await fetch(reqUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  console.log('Announcements in DB:', JSON.stringify(data, null, 2));
}

checkAnnouncements();
