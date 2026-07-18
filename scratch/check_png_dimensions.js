import fs from 'fs';

function getPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  // PNG signature check
  if (buffer.readUInt32BE(0) !== 0x89504E47) {
    throw new Error('Not a valid PNG file');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

try {
  const size = getPngSize('C:/Users/papu/.gemini/antigravity/brain/fcce3588-b14b-4dc9-b1dc-64fec8fb3684/media__1784375334394.png');
  console.log('New PNG dimensions:', size);
} catch (err) {
  console.error(err);
}
