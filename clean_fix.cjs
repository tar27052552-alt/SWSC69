const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'DisciplinePage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix duty_schedules to schedules
content = content.replace(
  /supabase\.from\('duty_schedules'\)\.select\('\*'\),/g,
  "supabase.from('schedules').select('*'),"
);

// 2. Fix useEffect dependencies
content = content.replace(
  /}, \[selectedDate, checkInState, users\]\);/g,
  "}, [selectedDate, checkInState, users, user, isAdmin]);"
);

// 3. Add handleSaveSwap, conflictModal, selectedSub
content = content.replace(
  /const \[conflicts, setConflicts\] = useState\(\[\]\);/,
  "const [conflicts, setConflicts] = useState([]);\n  const [conflictModal, setConflictModal] = useState(null);\n  const [selectedSub, setSelectedSub] = useState('');"
);

const handleSaveStr = `
  const handleSaveSwap = async () => {
    if (!conflictModal || !selectedSub) return;
    try {
      const newSwap = {
        date: conflictModal.date,
        duty_type: conflictModal.dutyType,
        original_nickname: conflictModal.originalNickname,
        substitute_nickname: selectedSub,
        created_at: new Date().toISOString()
      };
      
      const { error } = await supabase.from('duty_swaps').insert(newSwap);
      if (error) throw error;
      
      alert('บันทึกการเปลี่ยนเวรสำเร็จ!');
      setConflictModal(null);
      setSelectedSub('');
      loadExemptionsAndSwaps();
      loadConflictsData();
    } catch (err) {
      console.error('Error swapping duty:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    }
  };
`;

content = content.replace(
  /(const loadExemptionsAndSwaps = async \(\) => \{)/,
  handleSaveStr + '\n  $1'
);

// 4. Inject UI before {/* Tabs */}
const uiBlock = `      {/* Duty Conflict Alerts */}
      {conflicts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {conflicts.map(c => (
            <div key={\`\${c.date}-\${c.dutyType}\`} style={{ background: 'linear-gradient(to right, #fff3e0, #ffe0b2)', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #ffcc80' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e65100', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠️ ตารางงานทับซ้อน (เวรทับซ้อนกิจกรรมภายนอก)
                </div>
                <div style={{ fontSize: 13, color: '#e65100', marginTop: 4 }}>
                  <span><strong>{c.originalNickname} ({c.userFullName})</strong> มีหน้าที่ <strong>{c.dutyLabel}</strong></span>
                  ในวันที่ <strong>{new Date(c.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} ({c.dayName})</strong> ซึ่งตรงกับวันที่เดินทางไปกิจกรรม <strong>{c.eventTitle}</strong> นอกสถานที่
                </div>
              </div>
              <button className="btn btn-warning" onClick={() => { setConflictModal(c); setSelectedSub(''); }} style={{ background: '#e65100', border: 'none', color: 'white', cursor: 'pointer', padding: '8px 16px', borderRadius: 6, fontWeight: 600 }}>
                🔄 สลับเปลี่ยนเวร
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}`;

content = content.replace(/\{\/\* Tabs \*\/\}/, uiBlock);

// 5. Inject modal at the end before final </div></div>
const modalBlock = `
      {/* Conflict Modal */}
      {conflictModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '90%', maxWidth: 500, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#e65100' }}>
                <AlertTriangle size={24} /> สลับเปลี่ยนเวรชั่วคราว
              </h3>
              <button onClick={()=>setConflictModal(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color: '#9e9e9e' }}>&times;</button>
            </div>
            <div style={{ background: '#fff3e0', padding: 12, borderRadius: 8, fontSize: 14, color: '#e65100', marginBottom: 20 }}>
              ระบบจะทำการเปลี่ยนผู้รับผิดชอบเวร <strong>{conflictModal.dutyLabel}</strong> ประจำวันที่ <strong>{conflictModal.date}</strong> แทน <strong>{conflictModal.originalNickname}</strong> ชั่วคราว
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#424242' }}>
                เลือกผู้รับผิดชอบแทน (สมาชิกปกติ)
              </label>
              <select 
                className="input"
                value={selectedSub}
                onChange={(e)=>setSelectedSub(e.target.value)}
              >
                <option value="">-- เลือกผู้รับผิดชอบแทน --</option>
                {users
                    .filter(u => u.nickname !== conflictModal.originalNickname && u.nickname !== 'แอดมิน')
                    .map(u => (
                      <option key={u.id} value={u.nickname}>
                        {u.nickname} ({u.name})
                      </option>
                    ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-gray" onClick={()=>setConflictModal(null)}>ยกเลิก</button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveSwap}
                disabled={!selectedSub}
                style={{ opacity: !selectedSub ? 0.5 : 1, background: '#e65100', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: selectedSub ? 'pointer' : 'not-allowed' }}
              >
                ยืนยันการสลับเวร
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}`;

content = content.replace(/    <\/div>\s*<\/div>\s*<\/div>\s*\);\s*\}/, `    </div>\n      </div>\n${modalBlock}`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully cleanly injected code into DisciplinePage.jsx');
