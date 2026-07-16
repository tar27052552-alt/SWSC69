async function check() {
  const id = '1xpPDKppojJeZ6-eHtRfK-5pcH30WNEwc';
  const urls = [
    `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
    `https://lh3.googleusercontent.com/d/${id}`,
  ];
  for (const url of urls) {
    const res = await fetch(url);
    const location = res.headers.get('location');
    console.log(`URL: ${url.slice(0, 60)}...`);
    console.log(`  Status: ${res.status} | Type: ${res.headers.get('content-type')} | Redirected: ${res.redirected} | Redirect-to: ${location}`);
  }
}
check();
