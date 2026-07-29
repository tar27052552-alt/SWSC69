const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const missingContent = `                <div class="form-group">
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
        </div>`;

const searchFor = `                  <label class="form-lbl">ชื่อผู้เสนอแนะ (ไม่ระบุก็ได้)</label>
                  <input type="text" class="form-ctrl" id="sugName" placeholder="ระบุชื่อหรือนามแฝง" />
                </div>
      </div>

      <!-- PAGE: POLICIES -->`;

const replaceWith = `                  <label class="form-lbl">ชื่อผู้เสนอแนะ (ไม่ระบุก็ได้)</label>
                  <input type="text" class="form-ctrl" id="sugName" placeholder="ระบุชื่อหรือนามแฝง" />
                </div>
${missingContent}
      </div>

      <!-- PAGE: POLICIES -->`;

code = code.replace(searchFor, replaceWith);

fs.writeFileSync('index.html', code, 'utf8');
console.log('Restored suggestions form');
