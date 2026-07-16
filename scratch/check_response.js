async function check() {
  const url = 'https://lh3.googleusercontent.com/d/1xpPDKppojJeZ6-eHtRfK-5pcH30WNEwc?w=400';
  try {
    const res = await fetch(url);
    console.log(`Status: ${res.status} | Content-Type: ${res.headers.get('content-type')} | Size: ${res.headers.get('content-length')} bytes`);
  } catch (e) {
    console.error(e);
  }
}
check();
