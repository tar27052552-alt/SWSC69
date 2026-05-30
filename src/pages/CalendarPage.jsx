import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DAYS_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];
const TYPE_COLORS = { meeting:'#5c6bc0', event:'#43a047', deadline:'#f9a825' };
const TYPE_LABELS = { meeting:'ประชุม', event:'กิจกรรม', deadline:'กำหนดส่ง' };
const TYPE_BADGE  = { meeting:'badge-purple', event:'badge-green', deadline:'badge-yellow' };

export default function CalendarPage() {
  const { user, isPresident, isAdmin } = useAuth();
  const today = new Date();
  const [yr, setYr] = useState(today.getFullYear());
  const [mo, setMo] = useState(today.getMonth());
  const [sel, setSel] = useState(null);
  
  const [events, setEvents] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  
  const [isAdding, setIsAdding] = useState(false);
  const [newEv, setNewEv] = useState({ title: '', date: todayStr, endDate: todayStr, type: 'event', locationCategory: 'internal', desc: '' });

  // อนุญาตให้ แอดมิน, ประธาน (deptId: 1 หรือ isPresident), หรือ เลขานุการ (deptId: 7) สามารถจัดการปฏิทินได้
  const canManage = isAdmin || isPresident || user?.deptId === 1 || user?.deptId === 7;

  const handleSaveEvent = async () => {
    if (!newEv.title || !newEv.date) return alert('กรุณากรอกข้อมูลให้ครบถ้วน');
    
    try {
      const color = TYPE_COLORS[newEv.type] || '#43a047';
      
      const { data: insertedEvent, error } = await supabase
        .from('events')
        .insert([{
          title: newEv.title,
          date: newEv.date,
          end_date: newEv.endDate || newEv.date,
          location_category: newEv.locationCategory || 'internal',
          type: newEv.type,
          color: color,
          description: newEv.desc
        }])
        .select()
        .single();
        
      if (error) throw error;

      if (selectedParticipants.length > 0 && insertedEvent) {
        const participantRecords = selectedParticipants.map(userId => ({
          event_id: insertedEvent.id,
          user_id: userId
        }));
        const { error: partErr } = await supabase
          .from('event_participants')
          .insert(participantRecords);
        if (partErr) throw partErr;
      }

      // Notify Discord (pr channel)
      const typeLabel = TYPE_LABELS[newEv.type] || 'กิจกรรม';
      const embedTitle = `📅 มีการเพิ่มกิจกรรมลงในปฏิทินสภาใหม่`;
      const embedDesc = `หัวข้อ: **${newEv.title}** (${typeLabel})`;
      const locLabel = newEv.locationCategory === 'external' ? 'ภายนอกโรงเรียน (นอกสถานที่)' : 'ภายในโรงเรียน';
      const fields = [
        { name: "📆 วันที่จัดกิจกรรม", value: newEv.date === (newEv.endDate || newEv.date) 
            ? new Date(newEv.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : `${new Date(newEv.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} - ${new Date(newEv.endDate || newEv.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`, inline: true },
        { name: "📍 สถานที่จัดกิจกรรม", value: locLabel, inline: true },
        { name: "📝 รายละเอียดเพิ่มเติม", value: newEv.desc || "ไม่มี", inline: false }
      ];
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'calendar');
      
      setIsAdding(false);
      setNewEv({ title: '', date: todayStr, endDate: todayStr, type: 'event', locationCategory: 'internal', desc: '' });
      setSelectedParticipants([]);
      
      const { data } = await supabase.from('events').select('*').order('date', { ascending: true });
      setEvents((data || []).map(e => ({ ...e, desc: e.description || e.desc })));

      const { data: pData } = await supabase.from('event_participants').select('*');
      setParticipants(pData || []);
      
    } catch (err) {
      console.error('Error adding event:', err);
      alert('ไม่สามารถเพิ่มกิจกรรมได้: ' + err.message);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('คุณต้องการลบกิจกรรมนี้ออกจากปฏิทินใช่หรือไม่?')) return;
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);
      if (error) throw error;
      
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setParticipants(prev => prev.filter(p => p.event_id !== eventId));
      alert('ลบกิจกรรมเรียบร้อยแล้ว!');
    } catch (err) {
      console.error('Error deleting event:', err);
      alert('เกิดข้อผิดพลาดในการลบกิจกรรม: ' + err.message);
    }
  };

  useEffect(() => {
    async function loadEvents() {
      try {
        const { data, error } = await supabase
          .from('events')
          .select('*')
          .order('date', { ascending: true });
        if (error) throw error;
        
        const mapped = (data || []).map(e => ({
          ...e,
          desc: e.description || e.desc
        }));
        setEvents(mapped);
      } catch (err) {
        console.error('Error loading events:', err);
      }
    }
    async function loadUsersAndParticipants() {
      try {
        const { data: uData } = await supabase
          .from('users')
          .select('id, name, nickname')
          .order('name');
        setUsersList(uData || []);

        const { data: pData } = await supabase
          .from('event_participants')
          .select('*');
        setParticipants(pData || []);
      } catch (err) {
        console.error('Error loading users/participants:', err);
      }
    }
    loadEvents();
    loadUsersAndParticipants();
  }, []);

  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();

  const prevMonth = () => { if (mo===0){setMo(11);setYr(y=>y-1);}else setMo(m=>m-1); };
  const nextMonth = () => { if (mo===11){setMo(0);setYr(y=>y+1);}else setMo(m=>m+1); };

  const getEvents = (day) => {
    const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return events.filter(e => {
      const start = e.date;
      const end = e.end_date || e.date;
      return ds >= start && ds <= end;
    });
  };

  const getEventParticipants = (eventId) => {
    const eventParts = participants.filter(p => p.event_id === eventId);
    return eventParts.map(p => {
      const u = usersList.find(usr => String(usr.id) === String(p.user_id));
      return u ? u.nickname : null;
    }).filter(Boolean);
  };

  const selEvents = sel ? getEvents(sel) : [];

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div className="page-title">📅 ปฏิทินกิจกรรม</div>
          <div className="page-subtitle">โครงการ กิจกรรม และวันสำคัญของสภานักเรียน</div>
        </div>
        {canManage && <button className="btn btn-primary" onClick={() => setIsAdding(true)}><Plus size={14}/> เพิ่มกิจกรรม</button>}
      </div>

      <div className="grid-layout" style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>
        {/* Calendar */}
        <div className="card">
          {/* Nav header */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button className="btn btn-gray btn-sm" onClick={prevMonth}>← ก่อนหน้า</button>
            <span style={{ fontWeight:700, fontSize:15, color:'#00bcd4' }}>
              {MONTHS[mo]} {yr + 543}
            </span>
            <button className="btn btn-gray btn-sm" onClick={nextMonth}>ถัดไป →</button>
          </div>

          <div style={{ padding:'12px' }}>
            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
              {DAYS_TH.map(d => (
                <div key={d} style={{ textAlign:'center', fontSize:12, fontWeight:700, color:'#9e9e9e', padding:'4px 0' }}>{d}</div>
              ))}
            </div>

            {/* Cells */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
              {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
              {Array.from({length:daysInMonth}).map((_,i)=>{
                const day = i+1;
                const evs = getEvents(day);
                const ds  = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isToday = ds === todayStr;
                const isSel   = sel === day;
                return (
                  <div key={day} onClick={()=>setSel(day)} style={{
                    minHeight:52, padding:'4px', borderRadius:4, cursor:'pointer',
                    border:`1px solid ${isSel?'#00bcd4': isToday?'#80deea':'#f0f0f0'}`,
                    background: isSel?'#e0f7fa': isToday?'#f3f4ff':'white',
                  }}>
                    <div style={{
                      fontSize:12, fontWeight: isToday?700:400,
                      color: isToday?'#00bcd4':'#212121',
                      width:22, height:22, borderRadius:'50%',
                      background: isToday?'#00bcd4':'transparent',
                      color: isToday?'white':'#212121',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>{day}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:1, marginTop:2 }}>
                      {evs.slice(0,2).map(ev=>(
                        <div key={ev.id} style={{ fontSize:10, background: ev.color+'22', color: ev.color, borderRadius:2, padding:'1px 4px', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
                          {ev.title}
                        </div>
                      ))}
                      {evs.length>2 && <div style={{fontSize:10,color:'#9e9e9e'}}>+{evs.length-2}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Legend */}
          <div className="card">
            <div className="card-header"><span className="card-title">ประเภทกิจกรรม</span></div>
            <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
              {Object.entries(TYPE_LABELS).map(([k,v])=>(
                <div key={k} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:10, height:10, borderRadius:2, background:TYPE_COLORS[k], flexShrink:0 }}/>
                  <span style={{ fontSize:13 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Selected day */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                {sel ? `${sel} ${MONTHS[mo]} ${yr+543}` : 'คลิกวันเพื่อดูรายละเอียด'}
              </span>
            </div>
            <div style={{ padding:'12px 16px' }}>
              {selEvents.length>0 ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {selEvents.map(ev=>(
                    <div key={ev.id} style={{ padding:'10px 12px', borderRadius:4, background:ev.color+'11', borderLeft:`3px solid ${ev.color}` }}>
                      <div style={{ fontSize:13, fontWeight:700, color:ev.color }}>{ev.title}</div>
                      {ev.end_date && ev.end_date !== ev.date && (
                        <div style={{ fontSize:11, color:'#757575', marginTop:2 }}>📅 {new Date(ev.date).toLocaleDateString('th-TH', {day:'numeric',month:'short'})} - {new Date(ev.end_date).toLocaleDateString('th-TH', {day:'numeric',month:'short',year:'2-digit'})}</div>
                      )}
                      <div style={{ fontSize:12, color:'#757575', marginTop:4 }}>{ev.desc}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        <span className={`badge ${TYPE_BADGE[ev.type]}`}>{TYPE_LABELS[ev.type]}</span>
                        <span className="badge" style={{ background: ev.location_category === 'external' ? '#e0f7fa' : '#f5f5f5', color: ev.location_category === 'external' ? '#00838f' : '#757575' }}>
                          {ev.location_category === 'external' ? '🎒 นอกสถานที่' : '🏫 ภายในโรงเรียน'}
                        </span>
                      </div>
                      
                      {/* Participants list */}
                      {(() => {
                        const parts = getEventParticipants(ev.id);
                        if (parts.length === 0) return null;
                        return (
                          <div style={{ marginTop: 8, borderTop: '1px dashed #e0e0e0', paddingTop: 6 }}>
                            <div style={{ fontSize: 11, color: '#9e9e9e', fontWeight: 600 }}>ผู้เข้าร่วม ({parts.length} คน):</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                              {parts.map(p => (
                                <span key={p} style={{ fontSize: 10, background: '#f5f5f5', padding: '1px 6px', borderRadius: 4, color: '#616161' }}>{p}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {canManage && (
                        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteEvent(ev.id)} style={{ fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}>
                            ลบกิจกรรม
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : sel ? (
                <div style={{ textAlign:'center', color:'#9e9e9e', fontSize:13, padding:'16px 0' }}>ไม่มีกิจกรรมในวันนี้</div>
              ) : null}
            </div>
          </div>

          {/* All events */}
          <div className="card">
            <div className="card-header"><span className="card-title">กิจกรรมทั้งหมด</span></div>
            <div>
              {events.map((ev,i)=>(
                <div key={ev.id} style={{ display:'flex', gap:10, padding:'9px 16px', borderBottom: i<events.length-1?'1px solid #f0f0f0':'none', alignItems:'flex-start' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:ev.color, flexShrink:0, marginTop:4 }}/>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600 }}>{ev.title}</div>
                    <div style={{ fontSize:11, color:'#9e9e9e' }}>
                      {new Date(ev.date).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'})}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {isAdding && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
          <div className="card" style={{ width:'100%', maxWidth:440, padding: 20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
              <span style={{ fontWeight:700, fontSize:16 }}>เพิ่มกิจกรรมใหม่</span>
              <button onClick={()=>setIsAdding(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color: '#9e9e9e' }}>&times;</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ fontSize:13, fontWeight:600 }}>ชื่อกิจกรรม</label>
                <input type="text" className="input-field" placeholder="เช่น ประชุมสภาประจำเดือน" value={newEv.title} onChange={e=>setNewEv({...newEv,title:e.target.value})} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize:13, fontWeight:600 }}>วันที่เริ่ม</label>
                  <input type="date" className="input-field" value={newEv.date} onChange={e=>setNewEv({...newEv,date:e.target.value, endDate: e.target.value})} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:13, fontWeight:600 }}>วันที่สิ้นสุด</label>
                  <input type="date" className="input-field" value={newEv.endDate || newEv.date} onChange={e=>setNewEv({...newEv,endDate:e.target.value})} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:13, fontWeight:600 }}>สถานที่จัดกิจกรรม</label>
                <select className="select-field" value={newEv.locationCategory || 'internal'} onChange={e=>setNewEv({...newEv,locationCategory:e.target.value})} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }}>
                  <option value="internal">🏫 ภายในโรงเรียน</option>
                  <option value="external">🎒 ภายนอกโรงเรียน (นอกสถานที่)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:13, fontWeight:600 }}>ประเภท</label>
                <select className="select-field" value={newEv.type} onChange={e=>setNewEv({...newEv,type:e.target.value})} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }}>
                  <option value="event">กิจกรรม (สีเขียว)</option>
                  <option value="meeting">ประชุม (สีม่วง)</option>
                  <option value="deadline">กำหนดส่ง (สีส้ม)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:13, fontWeight:600 }}>สมาชิกที่เข้าร่วมกิจกรรม</label>
                <div style={{ maxHeight: 110, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 6, padding: '6px 10px', marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {usersList
                    .filter(u => u.nickname !== 'แอดมิน')
                    .map(u => (
                      <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedParticipants.includes(u.id)}
                          onChange={() => {
                            if (selectedParticipants.includes(u.id)) {
                              setSelectedParticipants(prev => prev.filter(id => id !== u.id));
                            } else {
                              setSelectedParticipants(prev => [...prev, u.id]);
                            }
                          }}
                        />
                        {u.name} ({u.nickname})
                      </label>
                    ))
                  }
                </div>
              </div>
              <div>
                <label style={{ fontSize:13, fontWeight:600 }}>รายละเอียดเพิ่มเติม</label>
                <textarea className="input-field" rows="2" placeholder="ระบุรายละเอียด..." value={newEv.desc} onChange={e=>setNewEv({...newEv,desc:e.target.value})} style={{ width: '100%', marginTop: 4, boxSizing: 'border-box' }}></textarea>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
              <button className="btn btn-gray" onClick={()=>setIsAdding(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSaveEvent}>บันทึกกิจกรรม</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
