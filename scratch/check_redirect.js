async function checkRedirect() {
  const res = await fetch('https://drive.google.com/file/d/1NMGnVpvQpwzZufS0iIE0vOykpbK2bV61/view', { redirect: 'manual' });
  console.log('Status:', res.status);
  console.log('Location:', res.headers.get('location'));
}
checkRedirect();
