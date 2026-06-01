/**
 * Google Apps Script for Student Council Portal (SWSC69)
 * ทำหน้าที่เป็น API Gateway รับ-ส่งข้อมูล, ระบบเก็บไฟล์ใน Google Drive,
 * และตัวตั้งเวลาแจ้งเตือนรายวันผ่าน Discord Webhook (Rich Embeds)
 * 
 * การตั้งค่าใน Apps Script Project Settings (Script Properties):
 * 1. DISCORD_WEBHOOK_URL : ลิงก์ Discord Webhook URL (ฟรี ไม่จำกัด)
 * 2. SUPABASE_URL : URL ของโครงการ Supabase
 * 3. SUPABASE_KEY : Anon Key ของโครงการ Supabase
 * 
 * การติดตั้งระบบแจ้งเตือนอัตโนมัติ:
 * - รันฟังก์ชัน `setDailyTriggers` ในตัวเลือกด้านบน 1 ครั้งเพื่อเปิดระบบตั้งเวลาอัตโนมัติ
 */

// ชื่อโฟลเดอร์หลักสำหรับเก็บไฟล์สภา
const MAIN_FOLDER_NAME = "คลังเก็บไฟล์สภานักเรียน";

// โฟลเดอร์ย่อยตามหมวดหมู่
const SUB_FOLDERS = {
  selfies: "รูปเช็คชื่อเข้าแถว",
  duties: "รูปตรวจเวรห้องสภา",
  slips: "สลิปการเงิน",
  secretary: "เอกสารฝ่ายเลขา",
  academic: "เอกสารฝ่ายวิชาการ"
};

// ฟังก์ชันหลักรับ POST Request จากแอป React
function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    var result;

    if (!action) {
      throw new Error("Missing 'action' parameter.");
    }

    // แยกแยะตาม Action ที่ได้รับ
    switch (action) {
      case "upload_file":
        result = uploadFileToDrive(requestData.fileBase64, requestData.fileName, requestData.folderCategory);
        break;
      case "read_sheet":
        result = readFromSheet(requestData.sheetName);
        break;
      case "write_sheet":
        result = writeToSheet(requestData.sheetName, requestData.rowData);
        break;
      case "update_sheet":
        result = updateSheetRow(requestData.sheetName, requestData.id, requestData.rowData);
        break;
      case "delete_sheet":
        result = deleteSheetRow(requestData.sheetName, requestData.id);
        break;
      case "verify_slip":
        result = verifySlipWithSlipOK(requestData.branchId, requestData.apiKey, requestData.fileBase64, requestData.amount);
        break;
      case "send_discord_message":
        result = sendDiscordEmbed(
          requestData.title,
          requestData.description,
          requestData.color,
          requestData.fields,
          requestData.imageUrl,
          requestData.channel
        );
        // ส่ง Push Notification เข้ามือถือผ่าน OneSignal ไปพร้อมกัน
        sendOneSignalPush(requestData.title, requestData.description);
        break;
      default:
        throw new Error("Unknown action: " + action);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ฟังก์ชันดึง/สร้างโฟลเดอร์ใน Google Drive
function getOrCreateFolder(folderName, parentFolder) {
  var folders;
  if (parentFolder) {
    folders = parentFolder.getFoldersByName(folderName);
  } else {
    folders = DriveApp.getFoldersByName(folderName);
  }
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    if (parentFolder) {
      return parentFolder.createFolder(folderName);
    } else {
      return DriveApp.createFolder(folderName);
    }
  }
}

// 1. ฟังก์ชันบันทึกไฟล์ภาพ/เอกสารลง Google Drive
function uploadFileToDrive(fileBase64, fileName, folderCategory) {
  var parts = fileBase64.split(";base64,");
  var contentType = parts[0].split(":")[1];
  var rawData = parts[1];
  
  var decodedData = Utilities.base64Decode(rawData);
  var blob = Utilities.newBlob(decodedData, contentType, fileName);
  
  var mainFolder = getOrCreateFolder(MAIN_FOLDER_NAME);
  var targetSubFolderName = SUB_FOLDERS[folderCategory] || "เอกสารทั่วไป";
  var categoryFolder = getOrCreateFolder(targetSubFolderName, mainFolder);
  
  var targetFolder = categoryFolder;
  
  // สำหรับหมวดหมู่รูปภาพรายวัน (เช็คชื่อ, เวรห้องสภา, สลิปการเงิน) ให้แยกเก็บในโฟลเดอร์ ปี-เดือน และวันที่
  if (folderCategory === "selfies" || folderCategory === "duties" || folderCategory === "slips") {
    var now = new Date();
    var monthFolderName = Utilities.formatDate(now, "GMT+7", "yyyy-MM");
    var dayFolderName = "วันที่ " + Utilities.formatDate(now, "GMT+7", "dd");
    
    var monthFolder = getOrCreateFolder(monthFolderName, categoryFolder);
    targetFolder = getOrCreateFolder(dayFolderName, monthFolder);
  }
  
  var file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  var fileId = file.getId();
  var driveViewUrl = "https://drive.google.com/file/d/" + fileId + "/view?usp=drivesdk";
  
  return {
    fileId: fileId,
    url: driveViewUrl,
    fileName: fileName
  };
}

// ตารางและหัวตารางเริ่มต้น สำหรับระบบ Google Sheets
const SHEET_SCHEMAS = {
  "Secretary_Meetings": ["id", "title", "date", "time", "location", "agenda", "resolutions", "attendees", "absent", "status", "created_at"],
  "Secretary_Docs": ["id", "title", "type", "size", "uploaded_by", "date", "file_url", "created_at"],
  "Academic_Projects": ["id", "title", "category", "owner", "budget", "due_date", "status", "description", "created_at"],
  "Academic_Docs": ["id", "title", "type", "size", "uploaded_by", "date", "file_url", "created_at"]
};

function getSheetAndInit(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = SHEET_SCHEMAS[sheetName];
    if (headers) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

function readFromSheet(sheetName) {
  var sheet = getSheetAndInit(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  var range = sheet.getRange(1, 1, lastRow, sheet.getLastColumn());
  var values = range.getValues();
  var headers = values[0];
  var list = [];
  
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      var val = row[j];
      
      if (typeof val === "string" && (val.indexOf("[") === 0 || val.indexOf("{") === 0)) {
        try {
          val = JSON.parse(val);
        } catch(e) {}
      }
      obj[header] = val;
    }
    list.push(obj);
  }
  return list;
}

function writeToSheet(sheetName, rowData) {
  var sheet = getSheetAndInit(sheetName);
  var headers = SHEET_SCHEMAS[sheetName] || [];
  
  if (!rowData.id) {
    rowData.id = Utilities.getUuid();
  }
  rowData.created_at = new Date().toISOString();

  var rowValues = [];
  for (var j = 0; j < headers.length; j++) {
    var header = headers[j];
    var val = rowData[header] || "";
    
    if (typeof val === "object") {
      val = JSON.stringify(val);
    }
    rowValues.push(val);
  }
  
  sheet.appendRow(rowValues);
  return rowData;
}

function updateSheetRow(sheetName, id, rowData) {
  var sheet = getSheetAndInit(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) throw new Error("No data found to update.");
  
  var headers = SHEET_SCHEMAS[sheetName] || [];
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var targetRowIndex = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      targetRowIndex = i + 2;
      break;
    }
  }
  
  if (targetRowIndex === -1) {
    throw new Error("Row not found with ID: " + id);
  }
  
  for (var j = 0; j < headers.length; j++) {
    var header = headers[j];
    if (header === "id" || header === "created_at") continue;
    
    if (rowData[header] !== undefined) {
      var val = rowData[header];
      if (typeof val === "object") {
        val = JSON.stringify(val);
      }
      sheet.getRange(targetRowIndex, j + 1).setValue(val);
    }
  }
  
  return { id: id, updatedFields: rowData };
}

function deleteSheetRow(sheetName, id) {
  var sheet = getSheetAndInit(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) throw new Error("No data found to delete.");
  
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var targetRowIndex = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      targetRowIndex = i + 2;
      break;
    }
  }
  
  if (targetRowIndex === -1) {
    throw new Error("Row not found with ID: " + id);
  }
  
  sheet.deleteRow(targetRowIndex);
  return { id: id, deleted: true };
}

function verifySlipWithSlipOK(branchId, apiKey, fileBase64, amount) {
  var url = "https://api.slipok.com/api/line/apikey/" + branchId;
  
  var parts = fileBase64.split(";base64,");
  var contentType = parts[0].split(":")[1];
  var rawData = parts[1];
  var decodedData = Utilities.base64Decode(rawData);
  var blob = Utilities.newBlob(decodedData, contentType, "slip.jpg");
  
  var payload = {
    "files": blob,
    "amount": String(amount)
  };
  
  var options = {
    "method": "POST",
    "headers": {
      "x-authorization": apiKey
    },
    "payload": payload,
    "muteHttpExceptions": true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseText = response.getContentText();
    return JSON.parse(responseText);
  } catch(e) {
    throw new Error("Failed to call SlipOK API: " + e.toString());
  }
}

// ----------------------------------------------------------------------------
// 7. ระบบแจ้งเตือนทาง Discord Webhook (Rich Embed Format)
// ----------------------------------------------------------------------------

function sendDiscordEmbed(title, description, colorDecimal, fields, imageUrl, channelKey) {
  var properties = PropertiesService.getScriptProperties();
  var webhookUrl = null;
  
  if (channelKey) {
    var propName = "DISCORD_WEBHOOK_" + channelKey.toUpperCase();
    webhookUrl = properties.getProperty(propName);
  }
  
  if (!webhookUrl) {
    webhookUrl = properties.getProperty("DISCORD_WEBHOOK_URL");
  }
  
  if (!webhookUrl) {
    console.warn("Discord Webhook URL is not configured in Script Properties.");
    return { success: false, error: "Missing config" };
  }
  
  var embedObj = {
    "title": title || "",
    "description": description || "",
    "color": colorDecimal || 3066993 // สีเขียว default
  };
  
  if (fields && fields.length > 0) {
    embedObj.fields = fields;
  }
  
  if (imageUrl) {
    // แปลง Google Drive link เป็น Direct Download url เพื่อให้ดิสคอร์ดแสดงพรีวิวภาพได้
    var directUrl = imageUrl;
    if (imageUrl.includes("drive.google.com")) {
      var fileId = "";
      var match1 = imageUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match1 && match1[1]) {
        fileId = match1[1];
      } else {
        var match2 = imageUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (match2 && match2[1]) {
          fileId = match2[1];
        }
      }
      if (fileId) {
        directUrl = "https://lh3.googleusercontent.com/d/" + fileId;
      }
    }
    embedObj.image = { "url": directUrl };
  }
  
  var payload = {
    "username": "SWSC69",
    "avatar_url": "https://tar27052552-alt.github.io/SWSC69/logo.png",
    "embeds": [embedObj]
  };
  
  var options = {
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    var response = UrlFetchApp.fetch(webhookUrl, options);
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      return { success: true };
    } else {
      console.error("Discord Webhook Error " + code + ": " + response.getContentText());
      return { success: false, error: "Status " + code };
    }
  } catch (e) {
    console.error("Failed to send Discord embed:", e);
    return { success: false, error: e.toString() };
  }
}

// ----------------------------------------------------------------------------
// 8. ดึงข้อมูลจาก Supabase REST API
// ----------------------------------------------------------------------------

function fetchFromSupabase(table, queryParams) {
  var properties = PropertiesService.getScriptProperties();
  var supabaseUrl = properties.getProperty("SUPABASE_URL");
  var supabaseKey = properties.getProperty("SUPABASE_KEY");
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL or SUPABASE_KEY is not configured in Script Properties.");
  }
  
  var url = supabaseUrl + "/rest/v1/" + table + "?" + queryParams;
  var options = {
    "method": "GET",
    "headers": {
      "apikey": supabaseKey,
      "Authorization": "Bearer " + supabaseKey,
      "Accept": "application/json"
    },
    "muteHttpExceptions": true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("Supabase API Error (" + code + "): " + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function getGregorianStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
}

// ฟังก์ชันช่วยแปลงค่าอาเรย์จากฐานข้อมูลที่อาจถูกเก็บเป็น string หรือ array
function parseArrayOrString(val) {
  if (!val) return [];
  if (typeof val === 'object') return val;
  try {
    var parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') {
      return parsed.split(',').map(function(s) { return s.trim(); });
    }
  } catch (e) {
    if (typeof val === 'string') {
      var cleanVal = val;
      if (val.indexOf('{') === 0 && val.indexOf('}') === val.length - 1) {
        cleanVal = val.slice(1, -1);
      }
      return cleanVal.split(',').map(function(s) { return s.trim(); });
    }
  }
  return [];
}

// ----------------------------------------------------------------------------
// 9. ระบบสรุปรายงานส่งอัตโนมัติ (Trigger Tasks)
// ----------------------------------------------------------------------------

// สรุปการเช็คชื่อสภา (เวลา 08:20 น.)
function sendAttendanceSummary() {
  var now = new Date();
  var todayStr = getGregorianStr(now);
  var daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
  var todayDayName = daysTh[now.getDay()];
  
  try {
    // 1. ดึงการตั้งค่าเช็คชื่อวันนี้
    var settings = fetchFromSupabase("attendance_settings", "select=key,value");
    var enabledDays = [];
    var disabledDates = [];
    
    for (var i = 0; i < settings.length; i++) {
      if (settings[i].key === "enabled_days") {
        enabledDays = parseArrayOrString(settings[i].value);
      } else if (settings[i].key === "disabled_dates") {
        disabledDates = parseArrayOrString(settings[i].value);
      }
    }
    
    if (!enabledDays.includes(todayDayName) || disabledDates.includes(todayStr)) {
      console.log("Attendance summary skipped today (holiday or disabled day).");
      return;
    }
    
    // 2. ดึงสมาชิกทั้งหมดยกเว้นแอดมิน
    var users = fetchFromSupabase("users", "select=id,name,nickname,role,position&role=neq.admin");
    
    // 3. ดึงประวัติเช็คชื่อวันนี้
    var attendance = fetchFromSupabase("student_attendance", "date=eq." + todayStr);
    
    var checkedMap = {};
    for (var j = 0; j < attendance.length; j++) {
      checkedMap[attendance[j].user_id] = attendance[j];
    }
    
    var onTimeList = [];
    var lateList = [];
    var leaveList = [];
    var missingList = [];
    
    for (var k = 0; k < users.length; k++) {
      var u = users[k];
      var record = checkedMap[String(u.id)];
      if (record) {
        if (record.status === "on_time") {
          onTimeList.push(u.nickname + " (" + record.time + ")");
        } else if (record.status === "late") {
          lateList.push(u.nickname + " (" + record.time + ")");
        } else if (record.status === "leave") {
          leaveList.push(u.nickname);
        } else if (record.status === "missing") {
          missingList.push(u.nickname);
        }
      } else {
        missingList.push(u.nickname);
      }
    }
    
    var fields = [
      { "name": "🟢 ตรงเวลา (" + onTimeList.length + " คน)", "value": onTimeList.length ? "- " + onTimeList.join("\n- ") : "(ไม่มี)", "inline": true },
      { "name": "🟡 สาย (" + lateList.length + " คน)", "value": lateList.length ? "- " + lateList.join("\n- ") : "(ไม่มี)", "inline": true },
      { "name": "🟠 ลา (" + leaveList.length + " คน)", "value": leaveList.length ? "- " + leaveList.join("\n- ") : "(ไม่มี)", "inline": false },
      { "name": "🔴 ขาดแถว (" + missingList.length + " คน)", "value": missingList.length ? "- " + missingList.join("\n- ") : "(ไม่มี)", "inline": false }
    ];
    
    var color = missingList.length > 0 ? 15158332 : (lateList.length > 0 ? 15105570 : 3066993); // แดง / ส้ม / เขียว
    
    sendDiscordEmbed(
      "📊 สรุปยอดเช็คชื่อสภานักเรียนประจำวัน",
      "วัน" + todayDayName + "ที่ " + now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) + " (สรุปข้อมูลเวลา 08:20 น.)",
      color,
      fields,
      null,
      "daily_summary"
    );
  } catch (err) {
    console.error("Error sending attendance summary:", err);
  }
}

// สรุปเวรห้องสภาสภานักเรียน (เวลา 18:00 น.)
function sendCleanDutySummary() {
  var now = new Date();
  var todayStr = getGregorianStr(now);
  var daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
  var todayDayName = daysTh[now.getDay()];
  
  try {
    var schedules = fetchFromSupabase("schedules", "type=eq.clean_room&day=eq." + todayDayName);
    if (!schedules || schedules.length === 0) {
      console.log("No clean duty schedule for today.");
      return;
    }
    
    var data = JSON.parse(schedules[0].data);
    var members = data.members || [];
    if (members.length === 0 || members[0] === "–") {
      console.log("No duty members assigned for today.");
      return;
    }
    
    var checks = fetchFromSupabase("clean_duty_checks", "date=eq." + todayStr);
    var doneMap = {};
    var lastPhoto = "";
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].status === "done") {
        doneMap[checks[i].nickname] = true;
        if (checks[i].photo) {
          lastPhoto = checks[i].photo; // ดึงรูปถ่ายเวรของสมาชิกสภามารายงาน
        }
      }
    }
    
    var doneList = [];
    var missingList = [];
    
    for (var j = 0; j < members.length; j++) {
      var mName = members[j];
      if (doneMap[mName]) {
        doneList.push(mName);
      } else {
        missingList.push(mName);
      }
    }
    
    var fields = [
      { "name": "✅ ทำเวรเรียบร้อยแล้ว (" + doneList.length + " คน)", "value": doneList.length ? "- " + doneList.join("\n- ") : "(ไม่มี)", "inline": true },
      { "name": "❌ ขาดเวร/ยังไม่ส่งเวร (" + missingList.length + " คน)", "value": missingList.length ? "- " + missingList.join("\n- ") : "(ไม่มี)", "inline": true }
    ];
    
    var color = missingList.length > 0 ? 15158332 : 3066993; // สีแดงถ้ามีคนขาดเวร สีเขียวถ้าส่งครบ
    
    sendDiscordEmbed(
      "🧹 รายงานผลเวรทำความสะอาดห้องสภา",
      "วัน" + todayDayName + "ที่ " + now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) + " (เวลาสรุป 18:00 น.)",
      color,
      fields,
      lastPhoto || null,
      "daily_summary"
    );
  } catch (err) {
    console.error("Error sending clean duty summary:", err);
  }
}

// แจ้งเตือนตารางกิจกรรมของวันพรุ่งนี้ (เวลา 20:00 น.)
function sendTomorrowActivities() {
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tomorrowStr = getGregorianStr(tomorrow);
  var daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
  var tomorrowDayName = daysTh[tomorrow.getDay()];
  
  try {
    var events = fetchFromSupabase("events", "date=eq." + tomorrowStr);
    if (!events || events.length === 0) {
      console.log("No events tomorrow, skipping notification.");
      return;
    }
    
    var fields = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      fields.push({
        "name": (i + 1) + ". 📌 " + ev.title + " (" + ev.type + ")",
        "value": ev.description || "ไม่มีคำอธิบายเพิ่มเติม",
        "inline": false
      });
    }
    
    sendDiscordEmbed(
      "📅 แจ้งเตือนตารางกิจกรรมวันพรุ่งนี้",
      "วัน" + tomorrowDayName + "ที่ " + tomorrow.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) + "\nกรุณาตรวจสอบหน้าที่ของท่านตามตารางกิจกรรมครับ 🏫",
      3447003, // สีน้ำเงิน
      fields,
      null,
      "calendar"
    );
  } catch (err) {
    console.error("Error sending tomorrow activities:", err);
  }
}

// ----------------------------------------------------------------------------
// 10. ระบบตั้งค่าและกำหนดรัน Trigger
// ----------------------------------------------------------------------------

function setDailyTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  ScriptApp.newTrigger("scheduleForToday")
           .timeBased()
           .everyDays(1)
           .atHour(1)
           .nearMinute(0)
           .create();
}

function scheduleForToday() {
  var today = new Date();
  
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var handlerName = triggers[i].getHandlerFunction();
    if (handlerName === "sendAttendanceSummary" || 
        handlerName === "sendCleanDutySummary" || 
        handlerName === "sendTomorrowActivities") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  var time820 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 20, 0);
  if (time820 > new Date()) {
    ScriptApp.newTrigger("sendAttendanceSummary")
             .timeBased()
             .at(time820)
             .create();
  }
  
  var time1800 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0, 0);
  if (time1800 > new Date()) {
    ScriptApp.newTrigger("sendCleanDutySummary")
             .timeBased()
             .at(time1800)
             .create();
  }
  
  var time2000 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20, 0, 0);
  if (time2000 > new Date()) {
    ScriptApp.newTrigger("sendTomorrowActivities")
             .timeBased()
             .at(time2000)
             .create();
  }
}

// ฟังก์ชันสำหรับทดสอบการยิง Webhook ของการเช็คชื่อเข้า Discord โดยตรง
function testAttendanceWebhook() {
  var result = sendDiscordEmbed(
    "🟢 [เช็คชื่อทดสอบ] ทดสอบระบบเช็คชื่อ",
    "หากคุณเห็นข้อความการ์ดนี้ใน Discord แสดงว่าระบบ Webhook และสิทธิ์การใช้งานใน Apps Script ถูกต้องแล้ว!",
    3066993,
    [{ name: "ผลทดสอบ", value: "บอทส่งข้อความสำเร็จ! 🎉", inline: true }],
    null,
    "attendance_alerts"
  );
  console.log("ผลการรัน: " + JSON.stringify(result));
}

// ฟังก์ชันส่งการแจ้งเตือน Push Notification ผ่าน OneSignal
function sendOneSignalPush(title, message) {
  var properties = PropertiesService.getScriptProperties();
  var appId = properties.getProperty("ONESIGNAL_APP_ID");
  var restApiKey = properties.getProperty("ONESIGNAL_REST_API_KEY");
  
  if (!appId || !restApiKey) {
    console.warn("ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY is not configured in Script Properties. Skipping push notification.");
    return { success: false, error: "Missing config" };
  }
  
  var payload = {
    "app_id": appId,
    "included_segments": ["All"], // ส่งหาผู้ลงทะเบียนทั้งหมด
    "headings": { "en": title, "th": title },
    "contents": { "en": message, "th": message },
    "url": "https://tar27052552-alt.github.io/SWSC69/" // เปิดเข้าหน้าเว็บพอร์ทัลเมื่อกดคลิก
  };
  
  var options = {
    "method": "POST",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Basic " + restApiKey
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    var response = UrlFetchApp.fetch("https://onesignal.com/api/v1/notifications", options);
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      console.log("OneSignal push notification sent successfully: " + response.getContentText());
      return { success: true };
    } else {
      console.error("OneSignal push notification error: " + response.getContentText());
      return { success: false, error: "Status " + code };
    }
  } catch (e) {
    console.error("Failed to send OneSignal push notification:", e);
    return { success: false, error: e.toString() };
  }
}
