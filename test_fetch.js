import { readSheet, deleteSheet } from './src/lib/googleDriveUpload.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const docs = await readSheet('Academic_Docs');
    console.log("Academic_Docs IDs:", docs.map(d => d.id));
  } catch (e) {
    console.error(e);
  }
}
run();
