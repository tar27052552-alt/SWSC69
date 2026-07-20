async function testImg() {
  const ids = [
    '1XaoJbbVOQOGMJycChlgTMb3lgXclsjwR',
    '1lRw2GTf-U9YViIglQryiZMuhFuiZnFGv',
    '1NMGnVpvQpwzZufS0iIE0vOykpbK2bV61'
  ];
  for (const id of ids) {
    const url = `https://lh3.googleusercontent.com/d/${id}`;
    const res = await fetch(url);
    console.log(id, res.status, res.headers.get('content-type'));
  }
}
testImg();
