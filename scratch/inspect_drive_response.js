async function inspectHtmlContent(id) {
  const url = `https://lh3.googleusercontent.com/d/${id}`;
  const res = await fetch(url);
  const text = await res.text();
  console.log('HTML Title/Body sample:');
  console.log(text.substring(0, 500));
}

inspectHtmlContent('1NMGnVpvQpwzZufS0iIE0vOykpbK2bV61');
