import fs from 'fs';

function getPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.readUInt32BE(0) !== 0x89504E47) {
    throw new Error('Not a valid PNG file');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

try {
  const size = getPngSize('public/structure.png');
  console.log('Downloaded PNG dimensions:', size);
} catch (err) {
  console.error(err);
}
