import { callGAS } from './googleDriveUpload';

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
  try {
    const result = await callGAS('send_discord_message', {
      title,
      description,
      color: colorDecimal,
      fields,
      imageUrl,
      channel,
      targetUserIds,
    });
    if (result?.discord?.success === false) {
      console.warn("⚠️ Discord webhook failed to send:", result.discord.error);
      return false;
    }
    return Boolean(result?.discord);
  } catch (error) {
    console.error("❌ Failed to send Discord embed via GAS:", error);
    return false;
  }
}
