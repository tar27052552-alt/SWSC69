const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const regex = /<input type="text" class="form-ctrl" id="sugName" placeholder="ระบุชื่อหรือนามแฝง" \/>\s*<\/div>\s*<\/div>\s*<!-- PAGE: POLICIES -->/;

const replacement = `<input type="text" class="form-ctrl" id="sugName" placeholder="ระบุชื่อหรือนามแฝง" />
                </div>
                <div class="form-group">
                  <label class="form-lbl">ประเภทเรื่องที่ต้องการเสนอ</label>
                  <select class="form-ctrl" id="sugType">
                    <option value="ทั่วไป">💬 ทั่วไป / อื่นๆ</option>
                    <option value="กิจกรรม">🎉 การจัดกิจกรรมในโรงเรียน</option>
                    <option value="สิ่งอำนวยความสะดวก">🏫 สิ่งอำนวยความสะดวก</option>
                    <option value="ร้องเรียน">📣 เรื่องร้องเรียน</option>
                    <option value="ชมเชย">⭐ ชมเชยคณะทำงาน</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-lbl">รายละเอียด <span style="color:#ef4444">*</span></label>
                  <textarea class="form-ctrl" id="sugMessage" placeholder="เขียนข้อความของคุณอย่างสุภาพ..."></textarea>
                </div>
                <button class="form-submit" id="sugSubmit" onclick="submitSug()">ส่งข้อเสนอแนะสภา</button>
              </div>
              <div class="form-success-view" id="successView">
                <div class="success-icon">🎉</div>
                <div class="success-title">ส่งเรียบร้อยแล้ว!</div>
                <p style="color:var(--gray-500);font-size:14px;margin:8px 0 20px">ขอบคุณสำหรับการมีส่วนร่วม สภานักเรียนจะนำฟีดแบ็คของคุณเข้าพิจารณาในการประชุมครั้งถัดไป</p>
                <button class="form-submit" onclick="resetForm()" style="max-width:180px">ส่งเรื่องเพิ่มเติม</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- PAGE: POLICIES -->`;

if (code.match(regex)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('index.html', code, 'utf8');
    console.log('Fixed suggestions HTML structure!');
} else {
    // If exact regex fails, try a broader one
    const regex2 = /<input type="text" class="form-ctrl" id="sugName"[^>]*>[\s\S]*?(?=<!-- PAGE: POLICIES -->)/;
    if (code.match(regex2)) {
        code = code.replace(regex2, replacement.replace('<!-- PAGE: POLICIES -->', ''));
        fs.writeFileSync('index.html', code, 'utf8');
        console.log('Fixed suggestions HTML structure with broader regex!');
    } else {
        console.log('Could not find the broken section.');
    }
}
