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

// สรุปผลการปฏิบัติเวรยืนไหว้ต้อนรับประจำวัน (เวลา 08:20 น.)
function sendGreetingDutySummary() {
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
      console.log("Greeting duty summary skipped today (holiday).");
      return;
    }
    
    // 2. ดึงตารางเวรยืนไหว้ต้อนรับวันนี้
    var schedules = fetchFromSupabase("schedules", "type=eq.greeting&day=eq." + encodeURIComponent(todayDayName));
    if (!schedules || schedules.length === 0) {
      console.log("No greeting duty schedule for today.");
      return;
    }
    
    var dataObj = {};
    if (schedules[0].data) {
      try {
        dataObj = (typeof schedules[0].data === "string") ? JSON.parse(schedules[0].data) : schedules[0].data;
      } catch(e) {}
    }
    
    // 3. ดึงสลับเวรวันนี้
    var swaps = [];
    try {
      swaps = fetchFromSupabase("duty_swaps", "date=eq." + todayStr);
    } catch(e) {}
    
    var applySwaps = function(membersList, dutyTypeKey) {
      if (!membersList || membersList.length === 0) return [];
      var result = [];
      for (var i = 0; i < membersList.length; i++) {
        var member = membersList[i];
        if (member === "–" || !member) continue;
        var swapped = false;
        for (var j = 0; j < swaps.length; j++) {
          if (swaps[j].duty_type === dutyTypeKey && swaps[j].original_nickname === member) {
            result.push(swaps[j].substitute_nickname);
            swapped = true;
            break;
          }
        }
        if (!swapped) {
          result.push(member);
        }
      }
      return result;
    };
    
    var gate1Expected = applySwaps(dataObj.gate1 || [], "greeting_gate1");
    var gate2Expected = applySwaps(dataObj.gate2 || [], "greeting_gate2");
    var gate3Expected = applySwaps(dataObj.gate3 || [], "greeting_gate3");
    
    if (gate1Expected.length === 0 && gate2Expected.length === 0 && gate3Expected.length === 0) {
      console.log("No greeting duty members today.");
      return;
    }
    
    // 4. ดึงข้อมูลรายงานผลการส่งเวรวันนี้
    var checks = fetchFromSupabase("greeting_duty_checks", "date=eq." + todayStr);
    var doneMap = {};
    var lastPhoto = "";
    for (var i = 0; i < checks.length; i++) {
      doneMap[checks[i].nickname] = checks[i];
      if (checks[i].photo) {
        lastPhoto = checks[i].photo;
      }
    }
    
    var formatGateStatus = function(expectedList) {
      var lines = [];
      for (var i = 0; i < expectedList.length; i++) {
        var m = expectedList[i];
        var cleanName = m.split(" ")[0]; // ดึงชื่อเล่นจริง
        var checkRecord = doneMap[cleanName];
        if (checkRecord) {
          lines.push("🟢 " + m + " (" + checkRecord.time + " น.)");
        } else {
          lines.push("❌ " + m + " (ยังไม่รายงานตัว)");
        }
      }
      return lines.length > 0 ? lines.join("\n") : "(ไม่มีเวร)";
    };
    
    var gate1Status = formatGateStatus(gate1Expected);
    var gate2Status = formatGateStatus(gate2Expected);
    var gate3Status = formatGateStatus(gate3Expected);
    
    var fields = [
      { name: "🚪 ประตูไหมไทย", value: gate1Status, inline: false },
      { name: "🚪 ประตูอำเภอ", value: gate2Status, inline: false },
      { name: "🚪 ประตูหน้า รร.", value: gate3Status, inline: false }
    ];
    
    // ตรวจสอบว่ามีคนขาดส่งหรือไม่
    var hasMissing = false;
    var allLists = [gate1Expected, gate2Expected, gate3Expected];
    for (var g = 0; g < allLists.length; g++) {
      for (var mIdx = 0; mIdx < allLists[g].length; mIdx++) {
        var cleanName = allLists[g][mIdx].split(" ")[0];
        if (!doneMap[cleanName]) {
          hasMissing = true;
          break;
        }
      }
    }
    
    var color = hasMissing ? 15158332 : 3066993; // สีแดงถ้าขาดรายงาน, สีเขียวถ้าส่งครบ
    
    sendDiscordEmbed(
      "📊 สรุปการปฏิบัติหน้าที่เวรยืนไหว้ต้อนรับ",
      "วัน" + todayDayName + "ที่ " + now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) + " (สรุปข้อมูลเวลา 08:20 น.)",
      color,
      fields,
      lastPhoto || null,
      "daily_summary"
    );
    
  } catch(err) {
    console.error("Error sending greeting duty summary:", err);
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
// 9.5. ระบบการแจ้งเตือนเพิ่มเติม (Check-in, Clean Duty, PR News & Meetings Reminders)
// ----------------------------------------------------------------------------

// แจ้งเตือนเช็คชื่อ ปฏิบัติเวร และการประชุมตอนเช้า (เวลา 06:30 น.)
function sendCheckInReminder() {
  var now = new Date();
  var todayStr = getGregorianStr(now);
  var daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
  var todayDayName = daysTh[now.getDay()];
  
  try {
    // 1. ดึงการตั้งค่าเช็คชื่อวันนี้เพื่อข้ามวันหยุด
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
      console.log("Morning reminder skipped today (holiday or disabled day).");
      return;
    }
    
    // 2. ดึงตารางเวรทั้งหมดของวันนี้
    var schedules = fetchFromSupabase("schedules", "day=eq." + encodeURIComponent(todayDayName));
    var schedulesMap = {};
    for (var i = 0; i < schedules.length; i++) {
      var row = schedules[i];
      var dataObj = {};
      if (row.data) {
        try {
          dataObj = (typeof row.data === "string") ? JSON.parse(row.data) : row.data;
        } catch(e) {
          console.warn("Could not parse schedule data:", e.toString());
        }
      }
      schedulesMap[row.type] = dataObj;
    }
    
    // 3. ดึงข้อมูลสลับเวรของวันนี้
    var swaps = [];
    try {
      swaps = fetchFromSupabase("duty_swaps", "date=eq." + todayStr);
    } catch(e) {
      console.warn("Could not fetch duty_swaps:", e.toString());
    }
    
    var applySwaps = function(membersList, dutyTypeKey) {
      if (!membersList || membersList.length === 0) return [];
      var result = [];
      for (var i = 0; i < membersList.length; i++) {
        var member = membersList[i];
        if (member === "–" || !member) continue;
        var swapped = false;
        for (var j = 0; j < swaps.length; j++) {
          if (swaps[j].duty_type === dutyTypeKey && swaps[j].original_nickname === member) {
            result.push(swaps[j].substitute_nickname + " (แทน " + member + ")");
            swapped = true;
            break;
          }
        }
        if (!swapped) {
          result.push(member);
        }
      }
      return result;
    };
    
    var fields = [];
    
    // - เวรยืนไหว้ต้อนรับ
    var greetingData = schedulesMap["greeting"] || {};
    var gate1 = applySwaps(greetingData.gate1 || [], "greeting_gate1");
    var gate2 = applySwaps(greetingData.gate2 || [], "greeting_gate2");
    var gate3 = applySwaps(greetingData.gate3 || [], "greeting_gate3");
    
    if (gate1.length > 0 || gate2.length > 0 || gate3.length > 0) {
      var greetingLines = [];
      if (gate1.length > 0) greetingLines.push("• **ประตูไหมไทย**: " + gate1.join(", "));
      if (gate2.length > 0) greetingLines.push("• **ประตูอำเภอ**: " + gate2.join(", "));
      if (gate3.length > 0) greetingLines.push("• **ประตูหน้า รร.**: " + gate3.join(", "));
      
      fields.push({
        "name": "🙏 เวรยืนไหว้ต้อนรับ (เข้าจุดก่อน 07:10 น.)",
        "value": greetingLines.join("\n"),
        "inline": false
      });
    }
    
    // - เวรทำความสะอาดห้องสภา
    var cleanRoomData = schedulesMap["clean_room"] || {};
    var cleanMembers = applySwaps(cleanRoomData.members || [], "clean_room");
    if (cleanMembers.length > 0) {
      fields.push({
        "name": "🧹 เวรทำความสะอาดห้องสภา",
        "value": "- " + cleanMembers.join("\n- "),
        "inline": true
      });
    }
    
    // - เวรเชิญธงชาติ/ธงสี
    var nationalFlagData = schedulesMap["national_flag"] || {};
    var nationalMembers = applySwaps(nationalFlagData.members || [], "national_flag");
    var colorFlagData = schedulesMap["color_flag"] || {};
    var colorMembers = applySwaps(colorFlagData.members || [], "color_flag");
    
    if (nationalMembers.length > 0 || colorMembers.length > 0) {
      var flagLines = [];
      if (nationalMembers.length > 0) flagLines.push("• **เชิญธงชาติ**: " + nationalMembers.join(", "));
      if (colorMembers.length > 0) flagLines.push("• **เชิญธงสี**: " + colorMembers.join(", "));
      
      fields.push({
        "name": "🚩 เวรเชิญธงเคารพธงชาติ",
        "value": flagLines.join("\n"),
        "inline": true
      });
    }
    
    // 4. ดึงข้อมูลประชุมสภานักเรียนวันนี้จาก Google Sheet
    var meetings = [];
    try {
      meetings = readFromSheet("Secretary_Meetings");
    } catch(e) {
      console.warn("Could not read meetings sheet:", e.toString());
    }
    
    var todayMeetings = [];
    for (var m = 0; m < meetings.length; m++) {
      var mt = meetings[m];
      if (mt.date && mt.status !== "cancelled") {
        var normalizedMeetingDate = "";
        if (typeof mt.date === "string") {
          normalizedMeetingDate = mt.date.split("T")[0];
        } else if (mt.date instanceof Date) {
          normalizedMeetingDate = getGregorianStr(mt.date);
        }
        
        if (normalizedMeetingDate === todayStr) {
          todayMeetings.push(mt);
        }
      }
    }
    
    if (todayMeetings.length > 0) {
      var meetingLines = [];
      for (var n = 0; n < todayMeetings.length; n++) {
        var mt = todayMeetings[n];
        meetingLines.push("• 📝 **" + mt.title + "**\n  ⏱️ เวลา: " + (mt.time || "ระบุภายหลัง") + " น. | 📍 สถานที่: " + (mt.location || "ห้องสภา"));
      }
      fields.push({
        "name": "📅 นัดหมายการประชุมสภานักเรียนในวันนี้",
        "value": meetingLines.join("\n"),
        "inline": false
      });
    }
    
    // ส่งการ์ดแจ้งเตือนเช็คชื่อและเวรเข้า Discord
    sendDiscordEmbed(
      "⏰ แจ้งเตือนเช็คชื่อและปฏิบัติหน้าที่เวรประจำวัน",
      "อรุณสวัสดิ์ครับสมาชิกสภานักเรียนทุกท่าน 🏫\nอย่าลืมเช็คชื่อเข้าแถวโรงเรียนปกติให้เรียบร้อยด้วยนะครับ!",
      15105570, // สีส้มทอง
      fields,
      null,
      "attendance_alerts"
    );
    
    // ส่งแจ้งเตือน Push Notification เข้ามือถือ
    sendOneSignalPush(
      "⏰ อย่าลืมเช็คชื่อและปฏิบัติเวรประจำวัน",
      "อรุณสวัสดิ์ครับ อย่าลืมลงชื่อเข้าโรงเรียนปกติ และตรวจสอบรายชื่อเวรประจำวันของคุณในหน้าพอร์ทัลนะครับ"
    );
    
  } catch (err) {
    console.error("Error sending morning reminder:", err);
  }
}

// แจ้งเตือนติดตามทำความสะอาดห้องสภาตอนบ่าย (เวลา 16:00 น.)
function sendCleanDutyReminder() {
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
      console.log("Clean duty afternoon reminder skipped (holiday).");
      return;
    }
    
    // 2. ดึงรายชื่อเวรห้องสภาวันนี้
    var schedules = fetchFromSupabase("schedules", "type=eq.clean_room&day=eq." + encodeURIComponent(todayDayName));
    if (!schedules || schedules.length === 0) {
      console.log("No clean duty schedule for today.");
      return;
    }
    
    var dataObj = {};
    if (schedules[0].data) {
      try {
        dataObj = (typeof schedules[0].data === "string") ? JSON.parse(schedules[0].data) : schedules[0].data;
      } catch(e) {}
    }
    var members = dataObj.members || [];
    if (members.length === 0 || members[0] === "–") {
      console.log("No clean duty members today.");
      return;
    }
    
    // 3. ดึงสถานะรายงานเวรวันนี้
    var checks = fetchFromSupabase("clean_duty_checks", "date=eq." + todayStr);
    var doneMap = {};
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].status === "done") {
        doneMap[checks[i].nickname] = true;
      }
    }
    
    var pendingMembers = [];
    for (var j = 0; j < members.length; j++) {
      var name = members[j];
      if (name === "–" || !name) continue;
      if (!doneMap[name]) {
        pendingMembers.push(name);
      }
    }
    
    // ถ้าทุกคนส่งหมดแล้ว ไม่ต้องแจ้งเตือน
    if (pendingMembers.length === 0) {
      console.log("All members have completed clean duty today.");
      return;
    }
    
    // แจ้งเตือนคนที่ยังไม่ได้ส่ง
    sendDiscordEmbed(
      "🧹 แจ้งเตือนทำความสะอาดห้องสภาและส่งเวรเย็นนี้",
      "กรุณาเข้าทำความสะอาดห้องสภานักเรียน ถ่ายรูปส่งรายงานในหน้าพอร์ทัลก่อนเวลา 18:00 น. ด้วยครับ 🏫",
      15158332, // สีแดงส้มเตือนภัย
      [{ name: "⏳ สมาชิกที่ยังไม่ได้ส่งรายงานเวร", value: "- " + pendingMembers.join("\n- "), inline: false }],
      null,
      "attendance_alerts"
    );
    
    sendOneSignalPush(
      "🧹 แจ้งเตือนทำเวรห้องสภาและส่งรายงาน",
      "คุณมีหน้าที่เวรห้องสภาเย็นนี้ที่ยังไม่ได้ส่งรายงาน กรุณาปฏิบัติหน้าที่และอัปโหลดรูปให้เสร็จก่อน 18:00 น. ครับ"
    );
    
  } catch (err) {
    console.error("Error sending clean duty afternoon reminder:", err);
  }
}

// แจ้งเตือนเวรหาข่าวประชาสัมพันธ์วันพรุ่งนี้ (เวลา 20:00 น.)
function sendTomorrowPRNewsDuty() {
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tomorrowStr = getGregorianStr(tomorrow);
  var daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
  var tomorrowDayName = daysTh[tomorrow.getDay()];
  
  try {
    // 1. ดึงการตั้งค่าเพื่อข้ามวันหยุด
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
    
    if (!enabledDays.includes(tomorrowDayName) || disabledDates.includes(tomorrowStr)) {
      console.log("PR news duty reminder skipped for tomorrow (holiday).");
      return;
    }
    
    // 2. ดึงตารางเวรหาข่าวประชาสัมพันธ์สำหรับวันพรุ่งนี้
    var schedules = fetchFromSupabase("schedules", "type=eq.pr_news&day=eq." + encodeURIComponent(tomorrowDayName));
    if (!schedules || schedules.length === 0) {
      console.log("No PR news duty schedule for tomorrow.");
      return;
    }
    
    var dataObj = {};
    if (schedules[0].data) {
      try {
        dataObj = (typeof schedules[0].data === "string") ? JSON.parse(schedules[0].data) : schedules[0].data;
      } catch(e) {}
    }
    
    var originalMembers = dataObj.members || [];
    if (originalMembers.length === 0 || originalMembers[0] === "–") {
      console.log("No PR news members assigned for tomorrow.");
      return;
    }
    
    // 3. ดึงสลับเวรวันพรุ่งนี้
    var swaps = [];
    try {
      swaps = fetchFromSupabase("duty_swaps", "date=eq." + tomorrowStr);
    } catch(e) {}
    
    var finalMembers = [];
    for (var k = 0; k < originalMembers.length; k++) {
      var member = originalMembers[k];
      if (member === "–" || !member) continue;
      var swapped = false;
      for (var j = 0; j < swaps.length; j++) {
        if (swaps[j].duty_type === "pr_news" && swaps[j].original_nickname === member) {
          finalMembers.push(swaps[j].substitute_nickname + " (แทน " + member + ")");
          swapped = true;
          break;
        }
      }
      if (!swapped) {
        finalMembers.push(member);
      }
    }
    
    if (finalMembers.length === 0) return;
    
    sendDiscordEmbed(
      "📣 แจ้งเตือนเวรหาข่าวประชาสัมพันธ์วันพรุ่งนี้",
      "วัน" + tomorrowDayName + "ที่ " + tomorrow.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) + "\nกรุณาจัดเตรียมหรือจัดหาข่าวประชาสัมพันธ์สำหรับวันพรุ่งนี้ด้วยนะครับ 🏫",
      3447003, // สีน้ำเงิน
      [{ name: "👥 ผู้ปฏิบัติหน้าที่เวรหาข่าว", value: "- " + finalMembers.join("\n- "), inline: false }],
      null,
      "pr"
    );
    
    sendOneSignalPush(
      "📣 แจ้งเตือนเวรหาข่าวประชาสัมพันธ์วันพรุ่งนี้",
      "คุณมีเวรหาข่าวประชาสัมพันธ์ในวันพรุ่งนี้ (" + tomorrowDayName + ") กรุณาจัดเตรียมข่าวสารให้เรียบร้อยครับ"
    );
    
  } catch (err) {
    console.error("Error sending tomorrow PR news duty reminder:", err);
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
        handlerName === "sendTomorrowActivities" ||
        handlerName === "sendCheckInReminder" ||
        handlerName === "sendCleanDutyReminder" ||
        handlerName === "sendTomorrowPRNewsDuty" ||
        handlerName === "sendGreetingDutySummary") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 1. แจ้งเตือนเช็คชื่อและเวรประจำวัน (06:30 น.)
  var time630 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 6, 30, 0);
  if (time630 > new Date()) {
    ScriptApp.newTrigger("sendCheckInReminder")
             .timeBased()
             .at(time630)
             .create();
  }
  
  // 2. สรุปยอดเช็คชื่อเข้าแถวเช้า และ สรุปเวรยืนไหว้ต้อนรับ (08:20 น.)
  var time820 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 20, 0);
  if (time820 > new Date()) {
    ScriptApp.newTrigger("sendAttendanceSummary")
             .timeBased()
             .at(time820)
             .create();
             
    ScriptApp.newTrigger("sendGreetingDutySummary")
             .timeBased()
             .at(time820)
             .create();
  }
  
  // 3. เตือนส่งเวรทำความสะอาดห้องสภา (16:00 น.)
  var time1600 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16, 0, 0);
  if (time1600 > new Date()) {
    ScriptApp.newTrigger("sendCleanDutyReminder")
             .timeBased()
             .at(time1600)
             .create();
  }
  
  // 4. สรุปการส่งเวรห้องสภา (18:00 น.)
  var time1800 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0, 0);
  if (time1800 > new Date()) {
    ScriptApp.newTrigger("sendCleanDutySummary")
             .timeBased()
             .at(time1800)
             .create();
  }
  
  // 5. แจ้งเตือนกิจกรรม และเวรหาข่าวประชาสัมพันธ์วันพรุ่งนี้ (20:00 น.)
  var time2000 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 20, 0, 0);
  if (time2000 > new Date()) {
    ScriptApp.newTrigger("sendTomorrowActivities")
             .timeBased()
             .at(time2000)
             .create();
             
    ScriptApp.newTrigger("sendTomorrowPRNewsDuty")
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
