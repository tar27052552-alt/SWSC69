const url = "https://script.google.com/macros/s/AKfycbzzjkdNczg7aw2p9CU53I58NMzm1oFP-CiiyfAgFdBSQZ7kA9tZ71oFw-N6Q1xles1rxA/exec";
fetch(url, {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify({ action: "read_sheet", sheetName: "Academic_Docs" }),
  redirect: "follow"
})
.then(async res => {
  const text = await res.text();
  console.log(text);
})
.catch(err => console.error(err));
