async function check() {
  const urls = [
    { name: 'lh3 raw', url: 'https://lh3.googleusercontent.com/d/1xpPDKppojJeZ6-eHtRfK-5pcH30WNEwc' },
    { name: 'lh3 with w600', url: 'https://lh3.googleusercontent.com/d/1xpPDKppojJeZ6-eHtRfK-5pcH30WNEwc=w600' },
    { name: 'thumbnail api', url: 'https://drive.google.com/thumbnail?id=1xpPDKppojJeZ6-eHtRfK-5pcH30WNEwc&sz=w600' }
  ];

  for (const item of urls) {
    try {
      const res = await fetch(item.url);
      console.log(`--- ${item.name} ---`);
      console.log(`Status: ${res.status}`);
      console.log(`Content-Type: ${res.headers.get('content-type')}`);
      console.log(`Content-Length: ${res.headers.get('content-length')}`);
      console.log(`Content-Disposition: ${res.headers.get('content-disposition')}`);
    } catch (e) {
      console.error(`${item.name} failed:`, e.message);
    }
  }
}
check();
