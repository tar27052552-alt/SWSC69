const gasUrl = import.meta.env.VITE_GAS_URL;

/**
 * ส่งการแจ้งเตือน Rich Embed ไปยัง Discord ผ่านทาง Google Apps Script API Gateway
 * @param {string} title - หัวข้อการ์ดแจ้งเตือน
 * @param {string} description - รายละเอียด
 * @param {number} colorDecimal - สีการ์ดในรูปแบบเลขฐานสิบ (เช่น 15158332 สำหรับสีแดง, 3066993 สำหรับสีเขียว)
 * @param {Array<Object>} fields - คอลัมน์ย่อย [{ name, value, inline }] (ถ้ามี)
 * @param {string} imageUrl - ลิงก์รูปภาพประกอบ (ถ้ามี)
 * @returns {Promise<boolean>} ผลการยิงข้อความ
 */
export async function sendDiscordEmbedViaGAS(title, description, colorDecimal = 3066993, fields = [], imageUrl = null, channel = 'general', targetUserIds = null) {
  if (!gasUrl) {
    console.warn("⚠️ [Discord Webhook Helper] Missing VITE_GAS_URL in environment.");
    return false;
  }
  
  try {
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "send_discord_message",
        title: title,
        description: description,
        color: colorDecimal,
        fields: fields,
        imageUrl: imageUrl,
        channel: channel,
        targetUserIds: targetUserIds
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error("❌ Failed to send Discord embed via GAS:", error);
    return false;
  }
}
