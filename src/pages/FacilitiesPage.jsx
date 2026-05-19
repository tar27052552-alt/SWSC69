import { useState, useEffect } from 'react';
import { Plus, X, Save } from 'lucide-react';
import { supabase } from '../supabaseClient';

const MOCK_REQUESTS = [];

export default function FacilitiesPage() {
  const [requests, setRequests] = useState(MOCK_REQUESTS);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: '', requester: '', eventDate: '', time: '', chairs: '', tables: '', other: '' });

  useEffect(() => {
    async function loadFacilitiesData() {
      try {
        // โหลด คำขอจัดสถานที่
        const { data: rData, error: rErr } = await supabase
          .from('facilities_requests')
          .select('*')
          .order('created_at', { ascending: false });
        if (!rErr && rData) {
          setRequests(rData.map(d => ({
            id: d.id,
            title: d.title,
            requester: d.requester,
            eventDate: d.event_date,
            time: d.time,
            chairs: d.chairs,
            tables: d.tables,
            other: d.other,
            status: d.status
          })));
        }
      } catch (err) {
        console.error('Error loading facilities data:', err);
      }
    }
    loadFacilitiesData();
  }, []);

  const changeStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('facilities_requests')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      setRequests(p => p.map(x => x.id === id ? { ...x, status } : x));
    } catch (err) {
      console.error('Error updating facility request status:', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ: ' + err.message);
    }
  };

  const handleSave = async () => {
    const cCount = parseInt(form.chairs) || 0;
    const tCount = parseInt(form.tables) || 0;
    const newReq = {
      title: form.title,
      requester: form.requester,
      event_date: form.eventDate,
      time: form.time,
      chairs: cCount,
      tables: tCount,
      other: form.other,
      status: 'pending'
    };

    try {
      const { data, error } = await supabase
        .from('facilities_requests')
        .insert([newReq])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        const inserted = {
          id: data[0].id,
          title: data[0].title,
          requester: data[0].requester,
          eventDate: data[0].event_date,
          time: data[0].time,
          chairs: data[0].chairs,
          tables: data[0].tables,
          other: data[0].other,
          status: data[0].status
        };
        setRequests(prev => [inserted, ...prev]);
      }
    } catch (err) {
      console.error('Error inserting facility request:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกคำขอ: ' + err.message);
    }
    setModal(false);
    setForm({ title: '', requester: '', eventDate: '', time: '', chairs: '', tables: '', other: '' });
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">🏗️ ฝ่ายอาคารสถานที่</div>
          <div className="page-subtitle">รับคำขอจัดเตรียมสถานที่ของสภานักเรียน</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={14} /> ส่งคำขอจัดสถานที่</button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">คำขอจัดสถานที่ ({requests.length} รายการ)</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="simple-table">
            <thead>
              <tr>
                <th>#</th>
                <th>กิจกรรม</th>
                <th>ผู้ขอ</th>
                <th>วันที่</th>
                <th>เวลา</th>
                <th>เก้าอี้</th>
                <th>โต๊ะ</th>
                <th>อื่นๆ</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</td>
                  <td style={{ fontSize: 13 }}>{r.requester}</td>
                  <td style={{ fontSize: 12 }}>{new Date(r.eventDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</td>
                  <td style={{ fontSize: 12 }}>{r.time}</td>
                  <td style={{ textAlign: 'center' }}>{r.chairs}</td>
                  <td style={{ textAlign: 'center' }}>{r.tables}</td>
                  <td style={{ fontSize: 12, color: '#757575' }}>{r.other || '–'}</td>
                  <td>
                    <span className={`badge ${r.status === 'approved' ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize: 11 }}>
                      {r.status === 'approved' ? '✅ อนุมัติ' : '⏳ รอดำเนินการ'}
                    </span>
                  </td>
                  <td>
                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => changeStatus(r.id, 'approved')} className="btn btn-success btn-sm" style={{ fontSize: 11 }}>✓ รับงาน</button>
                        <button onClick={() => setRequests(p => p.filter(x => x.id !== r.id))} className="btn btn-danger btn-sm"><X size={12} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>🏗️ ส่งคำขอจัดสถานที่</span>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ชื่อกิจกรรม *</label>
                <input className="input-field" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="เช่น พิธีไหว้ครู 2568" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">ผู้ขอ *</label>
                  <input className="input-field" value={form.requester} onChange={e => setForm(p => ({ ...p, requester: e.target.value }))} placeholder="ชื่อเล่น / ฝ่าย" />
                </div>
                <div>
                  <label className="form-label">วันที่จัดงาน *</label>
                  <input className="input-field" type="date" value={form.eventDate} onChange={e => setForm(p => ({ ...p, eventDate: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">ช่วงเวลา</label>
                  <input className="input-field" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} placeholder="08:00-12:00" />
                </div>
                <div>
                  <label className="form-label">จำนวนเก้าอี้</label>
                  <input className="input-field" type="number" value={form.chairs} onChange={e => setForm(p => ({ ...p, chairs: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">จำนวนโต๊ะ</label>
                  <input className="input-field" type="number" value={form.tables} onChange={e => setForm(p => ({ ...p, tables: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="form-label">อุปกรณ์อื่นๆ</label>
                <input className="input-field" value={form.other} onChange={e => setForm(p => ({ ...p, other: e.target.value }))} placeholder="เช่น ไมโครโฟน, โพเดียม" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.title || !form.eventDate}><Save size={14} /> ส่งคำขอ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
