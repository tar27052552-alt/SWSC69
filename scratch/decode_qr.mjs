import fs from 'fs';
import https from 'https';

const imgBuf = fs.readFileSync('d:/โปรเจคสภา/src/assets/promptpay_qr.png');
const boundary = '--------------------------' + Date.now().toString(16);

const header = '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="qr.png"\r\nContent-Type: image/png\r\n\r\n';
const footer = '\r\n--' + boundary + '--\r\n';

const body = Buffer.concat([
  Buffer.from(header, 'utf8'),
  imgBuf,
  Buffer.from(footer, 'utf8')
]);

const req = https.request({
  hostname: 'api.qrserver.com',
  path: '/v1/read-qr-code/',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': body.length
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('API_RESPONSE:', data);
  });
});

req.on('error', e => console.error(e));
req.write(body);
req.end();
