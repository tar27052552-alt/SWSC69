const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function compressImage(filePath, maxWidth = 1920, quality = 80) {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`Processing: ${filePath} (${sizeMB} MB)...`);

  const tempPath = filePath + '.tmp';
  try {
    const metadata = await sharp(filePath).metadata();
    let transform = sharp(filePath);
    if (metadata.width > maxWidth) {
      transform = transform.resize({ width: maxWidth });
    }

    if (filePath.endsWith('.png')) {
      await transform
        .png({ quality, compressionLevel: 9, palette: true })
        .toFile(tempPath);
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      await transform
        .jpeg({ quality, mozjpeg: true })
        .toFile(tempPath);
    }

    const newStat = fs.statSync(tempPath);
    const newSizeMB = (newStat.size / (1024 * 1024)).toFixed(2);
    fs.renameSync(tempPath, filePath);
    console.log(`Success: ${filePath} reduced from ${sizeMB} MB to ${newSizeMB} MB`);
  } catch (err) {
    console.error(`Failed to compress ${filePath}:`, err);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

async function main() {
  const targets = [
    'advisor-structure-2569.png',
    'sap-model.png',
    'org-structure.jpg',
    'public/advisor-structure-2569.png',
    'public/sap-model.png',
    'public/org-structure.jpg',
    'public/hero-group.png',
    'public/all-logos.png',
    'public/structure.png',
    'public/structure-2567.png',
    'public/structure-2568.png',
  ];

  for (const t of targets) {
    const fullPath = path.resolve(__dirname, '..', t);
    await compressImage(fullPath);
  }
}

main();
