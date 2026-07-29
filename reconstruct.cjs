const fs = require('fs');
const disc = fs.readFileSync('src/pages/DisciplinePage.jsx', 'utf8').split('\n');
const orig = fs.readFileSync('original_code.js', 'utf8').split('\n');

const top = disc.slice(0, 150);
const midStartIdx = orig.findIndex(l => l.includes('const [cleanSchedules'));
const midEndIdx = orig.findIndex(l => l.includes('return ('));
const mid = orig.slice(midStartIdx, midEndIdx);

const useEffectIdx = mid.findIndex(l => l.includes('useEffect(() => {') && mid[l+1]?.includes('loadAttendance()'));
const loadConflictsStr = `
  const loadConflictsData = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: events, error: e1 } = await supabase.from('events').select('*').eq('location_category', 'external').gte('date', todayStr);
      if (e1) throw e1;
      
      if (!events || events.length === 0) {
        setConflicts([]);
        return;
      }
      
      const eventIds = events.map(e => e.id);
      const { data: parts, error: e2 } = await supabase.from('event_participants').select('*').in('event_id', eventIds);
      if (e2) throw e2;
      
      const dates = [...new Set(events.map(e => e.date))];
      const { data: schedules, error: e3 } = await supabase.from('schedules').select('*').in('date', dates);
      if (e3) throw e3;
      
      const newConflicts = [];
      
      for (const ev of events) {
        const evParts = parts.filter(p => p.event_id === ev.id);
        const evSchedules = schedules.filter(s => s.date === ev.date);
        
        for (const part of evParts) {
          const userHasSchedule = evSchedules.find(s => String(s.user_id) === String(part.user_id));
          if (userHasSchedule) {
            const u = users.find(x => String(x.id) === String(part.user_id));
            if (u) {
              const dutyLabel = userHasSchedule.type === 'greeting' ? 'เวรยืนไหว้' : (userHasSchedule.type === 'clean_room' ? 'เวรห้องสภา' : userHasSchedule.type);
              newConflicts.push({
                date: ev.date,
                dutyType: userHasSchedule.type,
                originalNickname: u.nickname,
                userFullName: u.name,
                dutyLabel: dutyLabel,
                dayName: new Date(ev.date).toLocaleDateString('th-TH', { weekday: 'long' }),
                eventTitle: ev.title
              });
            }
          }
        }
      }
      
      setConflicts(newConflicts);
    } catch (err) {
      console.error('Error loading conflicts:', err);
    }
  };
`;
mid.splice(useEffectIdx, 0, loadConflictsStr);

const returnIdx = disc.findIndex(l => l.includes('return ('));
const bottom = disc.slice(returnIdx);

const headerIdx = bottom.findIndex(l => l.includes('<div className="page-subtitle">ระบบบันทึกความผิดและการหักเงินสมาชิกสภานักเรียน</div>'));

const btnStr = `        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isAdmin && conflicts.length > 0 && (
            <button className="btn btn-primary" onClick={() => setShowConflictsModal(true)} style={{ background: '#e65100', border: 'none', color: 'white', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold' }}>
              ⚠️ แจ้งเตือนทับซ้อน ({conflicts.length})
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { initForm(); setModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold' }}>
              <Plus size={16}/> บันทึกความผิด
            </button>
          )}
        </div>
`;

let existingHeaderEnd = bottom.findIndex((l, i) => i > headerIdx && l.includes('</div>') && bottom[i-1].includes('บันทึกความผิด'));
if (existingHeaderEnd === -1) {
    existingHeaderEnd = headerIdx + 1;
}

bottom.splice(headerIdx + 1, existingHeaderEnd - headerIdx, btnStr);

const modalStr = `
      {showConflictsModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowConflictsModal(false)} style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ maxWidth: 600, padding: 20 }}>
            <div className="modal-header" style={{ paddingBottom: 15, marginBottom: 15, borderBottom: '1px solid #eee' }}>
              <span style={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                ⚠️ แจ้งเตือนตารางงานทับซ้อน
              </span>
              <button onClick={() => setShowConflictsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {conflicts.length > 0 ? (
                conflicts.map(c => (
                  <div key={\`\${c.date}-\${c.dutyType}-\${c.originalNickname}\`} style={{ background: 'linear-gradient(to right, #fff3e0, #ffe0b2)', borderRadius: 8, padding: '14px 18px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #ffcc80', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#e65100', marginBottom: 4 }}>
                        ⚠️ ตารางงานทับซ้อน
                      </div>
                      <div style={{ fontSize: 12, color: '#bf360c', lineHeight: 1.5 }}>
                        <strong>{c.originalNickname} ({c.userFullName})</strong> มีหน้าที่ <strong>{c.dutyLabel}</strong> วันที่ <strong>{c.dayName}</strong> แต่ไปกิจกรรม <strong>{c.eventTitle}</strong> นอกสถานที่
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#757575' }}>
                  ไม่มีตารางงานทับซ้อน
                </div>
              )}
            </div>
          </div>
        </div>
      )}
`;

const lastDiv = bottom.lastIndexOf('    </div>');
if (lastDiv !== -1) {
    bottom.splice(lastDiv, 0, modalStr);
}

const finalCode = [...top, ...mid, ...bottom].join('\n');
fs.writeFileSync('src/pages/DisciplinePage.jsx', finalCode);
console.log('Done!');
