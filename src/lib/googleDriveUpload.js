const gasUrl = import.meta.env.VITE_GAS_URL;

async function callGAS(action, payload) {
  if (!gasUrl) {
    console.warn("⚠️ [GAS Helper] Missing VITE_GAS_URL in your .env file!");
    // If no URL is provided, we can simulate a mock behavior or alert the user
    alert("ยังไม่ได้ตั้งค่า VITE_GAS_URL ในไฟล์ .env ของคุณ! โปรดนำโค้ดในโฟลเดอร์ scratch/google_apps_script.js ไปติดตั้งใน Google Apps Script และระบุ URL ของเว็บแอปในไฟล์ .env เพื่อเปิดใช้งานฟังก์ชันนี้");
    throw new Error("Missing VITE_GAS_URL environment variable.");
  }
  
  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8", // Using text/plain to avoid preflight OPTIONS check if possible, though doPost handles it too
      },
      body: JSON.stringify({ action, ...payload }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Unknown Apps Script Backend Error");
    }
    
    return result.data;
  } catch (error) {
    console.error("❌ Google Apps Script Request failed:", error);
    alert(`เกิดข้อผิดพลาดในการเชื่อมต่อ Google Apps Script: ${error.message}`);
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
  return callGAS("upload_file", { fileBase64, fileName, folderCategory, subFolderName });
}

export async function verifySlipViaGAS(branchId, apiKey, fileBase64, amount) {
  return callGAS("verify_slip", { branchId, apiKey, fileBase64, amount });
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
  
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("https://drive.google.com/thumbnail")) {
    return url;
  }
  
  if (url.startsWith("https://lh3.googleusercontent.com/d/")) {
    const id = url.split('/').pop().split('?')[0];
    return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
  }
  
  if (!url.includes("drive.google.com")) {
    return url;
  }

  // 1. ตรวจสอบรูปแบบ /file/d/FILE_ID/view
  let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }
  
  // 2. ตรวจสอบรูปแบบ uc?id=FILE_ID หรือ open?id=FILE_ID
  match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
  }
  
  return url;
}

