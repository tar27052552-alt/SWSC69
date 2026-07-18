import fs from 'fs';

function getJpgSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  let i = 2; // skip SOI marker (0xFFD8)
  while (i < buffer.length) {
    if (buffer[i] === 0xFF) {
      const marker = buffer[i + 1];
      // SOF0 (Start of Frame 0) marker is 0xC0, SOF2 is 0xC2
      if (marker === 0xC0 || marker === 0xC2) {
        const height = buffer.readUInt16BE(i + 5);
        const width = buffer.readUInt16BE(i + 7);
        return { width, height };
      }
      i += 2 + buffer.readUInt16BE(i + 2);
    } else {
      i++;
    }
  }
  return null;
}

try {
  const size = getJpgSize('public/structure.jpg');
  console.log('Image dimensions:', size);
} catch (err) {
  console.error(err);
}
