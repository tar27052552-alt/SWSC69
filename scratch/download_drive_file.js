import fs from 'fs';
import https from 'https';

const fileId = '1m-h3LOAmM9Yo-CgeWD8eB2_VPgH0Anin';
const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      // Handle all 3xx redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        let redirectUrl = response.headers.location;
        // If redirectUrl is relative, resolve it (not needed for Google Drive but good practice)
        if (redirectUrl.startsWith('/')) {
          const parsedUrl = new URL(url);
          redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
        }
        console.log(`Redirecting (${response.statusCode}) to: ${redirectUrl}`);
        downloadFile(redirectUrl, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      const contentType = response.headers['content-type'] || '';
      console.log('Content-Type:', contentType);

      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve({ contentType });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

console.log('Starting download from Google Drive...');
downloadFile(downloadUrl, 'public/structure_new')
  .then(({ contentType }) => {
    console.log('Download complete!');
    let extension = 'jpg';
    if (contentType.includes('png')) {
      extension = 'png';
    } else if (contentType.includes('pdf')) {
      extension = 'pdf';
    }
    
    const finalDest = `public/structure.${extension}`;
    fs.renameSync('public/structure_new', finalDest);
    console.log(`Saved file to: ${finalDest}`);
  })
  .catch((err) => {
    console.error('Download failed:', err);
  });
