import { supabase } from '../supabaseClient';
import { normalizeUploadFileName } from './uploadFileName';
import { assertBase64UploadSize } from './uploadLimits';
import { fetchWithDeadline } from './requestDeadline';

const gasUrl = import.meta.env.VITE_GAS_URL;

const pendingGasRequests = new Map();
export async function callGAS(action, payload) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งานส่วนนี้');
  const key = JSON.stringify([session.user.id, action, payload]);
  if (pendingGasRequests.has(key)) return pendingGasRequests.get(key);
  const request = performGAS(action, payload, session).finally(() => pendingGasRequests.delete(key));
  pendingGasRequests.set(key, request);
  return request;
}
async function performGAS(action, payload, session) {
  if (!gasUrl) {
    console.warn("⚠️ [GAS Helper] Missing VITE_GAS_URL in your environment!");
    throw new Error("Missing VITE_GAS_URL environment variable.");
  }
  
  try {

    const readOnly = ['read_sheet', 'read_public_documents', 'search_certificates'].includes(action);
    const { response, text } = await fetchWithDeadline(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({ action, ...payload, accessToken: session.access_token }),
    }, action === 'upload_file' ? 90000 : 30000, !readOnly);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const result = JSON.parse(text);
    if (!result.success) {
      throw new Error(result.error || "Unknown Apps Script Backend Error");
    }
    
    return result.data;
  } catch (error) {
    console.error("❌ Google Apps Script Request failed:", error);
    throw error;
  }
}

/**
 * อัปโหลดไฟล์รูปภาพหรือเอกสารไปยัง Google Drive ผ่าน Apps Script
 * @param {string} fileBase64 - ไฟล์ที่เข้ารหัสเป็น Base64 (เช่น "data:image/png;base64,iVBORw...")
 * @param {string} fileName - ชื่อไฟล์ที่ต้องการบันทึก เช่น "selfie.png"
 * @param {string} folderCategory - หมวดหมู่โฟลเดอร์ ('selfies', 'duties', 'slips', 'secretary', 'academic', 'pr', 'obec')
 * @param {string} subFolderName - (เลือกได้) ชื่อโฟลเดอร์ย่อยในหมวดหมู่หลัก เช่น หัวข้อข่าว
 * @returns {Promise<{fileId: string, url: string, fileName: string}>} ข้อมูลไฟล์ที่อัปโหลดและลิงก์ตรง
 */
export async function uploadFileToDrive(fileBase64, fileName, folderCategory, subFolderName = null) {
  assertBase64UploadSize(fileBase64);
  return callGAS("upload_file", { fileBase64, fileName: normalizeUploadFileName(fileName), folderCategory, subFolderName });
}

export async function verifySlipViaGAS(fileBase64, amount) {
  return callGAS("verify_slip", { fileBase64, amount });
}

export async function syncDriveFolder(folderId, eventName, uploadedBy) {
  return callGAS('sync_folder', { folderId, eventName, uploadedBy });
}

export async function renameCertGroup(oldName, newName) {
  return callGAS('rename_cert_group', { oldName, newName });
}

export async function deleteCertGroup(eventName) {
  return callGAS('delete_cert_group', { eventName });
}

/**
 * ดึงข้อมูลทั้งหมดจาก Google Sheet ที่กำหนด
 * @param {string} sheetName - ชื่อแผ่นงาน เช่น "Secretary_Meetings"
 * @returns {Promise<Array<Object>>} ข้อมูลแถวทั้งหมดในรูปแอบเจกต์
 */
export async function readSheet(sheetName) {
  return callGAS("read_sheet", { sheetName });
}

/**
 * บันทึกข้อมูลแถวใหม่ลงใน Google Sheet
 * @param {string} sheetName - ชื่อแผ่นงาน
 * @param {Object} rowData - ข้อมูลคีย์และค่าของแถวที่ต้องการบันทึก
 * @returns {Promise<Object>} ข้อมูลที่บันทึกสำเร็จพร้อม id
 */
export async function writeSheet(sheetName, rowData) {
  return callGAS("write_sheet", { sheetName, rowData });
}

/**
 * อัปเดตข้อมูลแถวเดิมใน Google Sheet ตาม ID
 * @param {string} sheetName - ชื่อแผ่นงาน
 * @param {string} id - ไอดีแถวที่ต้องการแก้ไข
 * @param {Object} rowData - ข้อมูลเฉพาะฟิลด์ที่ต้องการอัปเดต
 * @returns {Promise<Object>} ผลลัพธ์การอัปเดต
 */
export async function updateSheet(sheetName, id, rowData) {
  return callGAS("update_sheet", { sheetName, id, rowData });
}

/**
 * ลบแถวข้อมูลออกจาก Google Sheet ตาม ID
 * @param {string} sheetName - ชื่อแผ่นงาน
 * @param {string} id - ไอดีแถวที่ต้องการลบ
 * @returns {Promise<Object>} ผลลัพธ์การลบ
 */
export async function deleteSheet(sheetName, id) {
  return callGAS("delete_sheet", { sheetName, id });
}

/**
 * แปลงลิงก์ Google Drive ในรูปแบบต่างๆ ให้เป็นลิงก์ตรง lh3.googleusercontent.com/d/FILE_ID
 * เพื่อให้สามารถนำไปแสดงผลในแท็ก <img> ของเว็บบราวเซอร์ได้ทันทีโดยไม่ติด CORS
 * @param {string} url - ลิงก์ดั้งเดิมจาก Google Drive
 * @returns {string} ลิงก์ตรงที่ผ่านการแปลงแล้ว หรือ URL ดั้งเดิมถ้าไม่สามารถแปลงได้
 */
export function transformGoogleDriveUrl(url) {
  if (!url) return "";
  if (typeof url !== "string") return url;
  
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  
  let fileId = "";
  let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) fileId = match[1];
  
  if (!fileId) {
    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) fileId = match[1];
  }

  if (!fileId) {
    match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) fileId = match[1];
  }

  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  }
  
  return url;
}

export function getGoogleDriveViewUrl(url) {
  if (!url || typeof url !== "string") return url;
  let fileId = "";
  let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) fileId = match[1];
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }
  return url;
}

