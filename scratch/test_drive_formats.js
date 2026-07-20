async function testIdFormats(id) {
  const formats = [
    `https://lh3.googleusercontent.com/d/${id}`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
    `https://drive.google.com/uc?export=view&id=${id}`
  ];

  for (const url of formats) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      console.log(url);
      console.log('  Status:', res.status, 'Type:', res.headers.get('content-type'));
    } catch(e) {
      console.log(url, 'Error:', e.message);
    }
  }
}

testIdFormats('1NMGnVpvQpwzZufS0iIE0vOykpbK2bV61');
