import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { ShieldCheck, Trash2, Edit2, X, Plus, Save, Sparkles, Target, CheckCircle2 } from 'lucide-react';

const DEFAULT_POLICIES = [
  {
    title: 'โครงการขยะแลกแต้ม & SWSC Zero Waste',
    category: 'สิ่งแวดล้อม & สวัสดิการ',
    icon: '♻️',
    progress: 100,
    status: 'ดำเนินการสำเร็จ',
    status_color: '#10b981',
    description: 'รณรงค์คัดแยกขยะในโรงเรียน และนำขยะรีไซเคิลมาแลกเป็นแต้มเพื่อนำไปแลกของรางวัลหรือสิทธิพิเศษต่างๆ',
    highlights: JSON.stringify(['จัดตั้งจุดรับขยะแลกแต้มประจำโรงเรียน', 'เชื่อมโยงระบบฐานข้อมูลแต้มสะสมออนไลน์', 'สร้างจิตสำนึกด้านสิ่งแวดล้อมให้แก่นักเรียน']),
    target: 'นักเรียนทุกระดับชั้น'
  },
  {
    title: 'Voice of SWSC: สภาฯ เปิดรับฟังเสียงนักเรียน 24 ชม.',
    category: 'การมีส่วนร่วม & สิทธิ',
    icon: '💬',
    progress: 100,
    status: 'เปิดใช้งานแล้ว',
    status_color: '#10b981',
    description: 'เปิดช่องทางออนไลน์รับฟังความคิดเห็น ปัญหา และข้อเสนอแนะนโยบายจากนักเรียนโดยตรงแบบเรียลไทม์',
    highlights: JSON.stringify(['ระบบส่งข้อเสนอแนะแบบระบุหรือไม่ระบุตัวตน', 'คณะกรรมการสภาฯ นำเข้าประชุมเพื่อหาทางแก้ไข', 'ติดตามสถานะการดำเนินการได้ตลอดเวลา']),
    target: 'นักเรียนและบุคลากรในโรงเรียน'
  },
  {
    title: 'SWSC Open Space & สวัสดิการพื้นที่พักผ่อน',
    category: 'สวัสดิการ & พักผ่อน',
    icon: '🛋️',
    progress: 85,
    status: 'กำลังดำเนินการ',
    status_color: '#8b5cf6',
    description: 'พัฒนาและปรับปรุงพื้นที่พักผ่อนสำหรับนักเรียน จุดบริการชาร์จแบตเตอรี่ และอุปกรณ์นันทนาการช่วงพักกลางวัน',
    highlights: JSON.stringify(['สำรวจความต้องการพื้นที่พักผ่อนของนักเรียน', 'ปรับปรุงจุดชาร์จแบตเตอรี่และโต๊ะม้านั่ง', 'จัดสรรอุปกรณ์กีฬาและเกมกระดานสำหรับพักผ่อน']),
    target: 'นักเรียนทุกระดับชั้น'
  },
  {
    title: 'Academic Hub & คลังเกียรติบัตรออนไลน์',
    category: 'วิชาการ & พัฒนาตนเอง',
    icon: '📚',
    progress: 100,
    status: 'ดำเนินการสำเร็จ',
    status_color: '#10b981',
    description: 'คลังรวบรวมเอกสารวิชาการ ชีทสรุปความรู้ และระบบค้นหาเกียรติบัตรกิจกรรมของนักเรียนผ่านเว็บสภาฯ',
    highlights: JSON.stringify(['ระบบค้นหาเกียรติบัตรกิจกรรมสภาฯ ออนไลน์', 'ดาวน์โหลดเอกสารวิชาการและคู่มือสายเรียน', 'สนับสนุนการเตรียมตัวสอบเข้ามหาวิทยาลัย']),
    target: 'นักเรียนชั้น ม.1 - ม.6'
  },
  {
    title: 'Clean & Positive Discipline (วินัยสร้างสรรค์ สังคมอบอุ่น)',
    category: 'งานวินัย & ระเบียบ',
    icon: '🛡️',
    progress: 90,
    status: 'กำลังดำเนินการ',
    status_color: '#3b82f6',
    description: 'ส่งเสริมระเบียบวินัยเชิงบวก ปรับปรุงระบบปฏิบัติหน้าที่เวรประจำวันของคณะกรรมการสภาฯ ให้มีความโปร่งใส',
    highlights: JSON.stringify(['ระบบสแกนเช็กชื่อปฏิบัติหน้าที่เวรประจำวัน', 'การรณรงค์เคารพกฎระเบียบแบบมิตรภาพพี่ดูแลน้อง', 'การประเมินผลและสรุปสถิติจำนวนผู้ปฏิบัติหน้าที่']),
    target: 'คณะกรรมการสภานักเรียน & นักเรียน'
  },
  {
    title: 'SWSC Creative Festival & กิจกรรมสร้างสรรค์',
    category: 'กิจกรรม & ศิลปวัฒนธรรม',
    icon: '🎉',
    progress: 70,
    status: 'เตรียมจัดกิจกรรม',
    status_color: '#f59e0b',
    description: 'สนับสนุนพื้นที่ให้นักเรียนได้แสดงออกทางด้านดนตรี ศิลปะ และความสามารถพิเศษตลอดปีการศึกษา',
    highlights: JSON.stringify(['งานแสดงดนตรีและเวทีแสดงความสามารถช่วงพักกลางวัน', 'กิจกรรมวันสำคัญและนิทรรศการวิชาการ', 'การประกวดคลิปสร้างสรรค์ส่งเสริมภาพลักษณ์โรงเรียน']),
    target: 'นักเรียนทุกคนและชมรมต่างๆ'
  }
];

export default function ManagePoliciesPage() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    title: '',
    category: 'สิ่งแวดล้อม & สวัสดิการ',
    icon: '🎯',
    progress: 100,
    status: 'ดำเนินการสำเร็จ',
    status_color: '#10b981',
    description: '',
    highlightsText: '',
    target: 'นักเรียนทุกระดับชั้น'
  });

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('web_policies')
        .select('*')
        .order('id', { ascending: true });

      if (error && error.code === '42P01') {
        console.warn('Table web_policies does not exist yet.');
        setPolicies([]);
      } else if (error) {
        throw error;
      } else {
        setPolicies(data || []);
      }
    } catch (err) {
      console.error('Failed to load policies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  const handleSeedData = async () => {
    if (!confirm('ต้องการนำเข้าข้อมูลนโยบายเริ่มต้น 6 รายการเข้าฐานข้อมูลหรือไม่?')) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('web_policies')
        .insert(DEFAULT_POLICIES);

      if (error) throw error;
      alert('นำเข้าข้อมูลนโยบายเริ่มต้นเข้าสู่ฐานข้อมูลสำเร็จ!');
      loadPolicies();
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message + '\n\nหากยังไม่มีตาราง web_policies ใน Supabase โปรดสร้างตารางชื่อ web_policies ก่อนครับ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('กรุณากรอกชื่อนโยบาย');
      return;
    }

    const highlightsArr = form.highlightsText
      ? form.highlightsText.split('\n').map(s => s.trim()).filter(Boolean)
      : [];

    const payload = {
      title: form.title.trim(),
      category: form.category.trim(),
      icon: form.icon.trim() || '🎯',
      progress: parseInt(form.progress) || 0,
      status: form.status.trim(),
      status_color: form.status_color,
      description: form.description.trim(),
      highlights: JSON.stringify(highlightsArr),
      target: form.target.trim() || 'นักเรียนทุกคน'
    };

    setSubmitting(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('web_policies')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        alert('แก้ไขนโยบายสำเร็จ!');
      } else {
        const { error } = await supabase
          .from('web_policies')
          .insert([payload]);
        if (error) throw error;
        alert('เพิ่มนโยบายสำเร็จ!');
      }

      resetForm();
      loadPolicies();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      title: '',
      category: 'สิ่งแวดล้อม & สวัสดิการ',
      icon: '🎯',
      progress: 100,
      status: 'ดำเนินการสำเร็จ',
      status_color: '#10b981',
      description: '',
      highlightsText: '',
      target: 'นักเรียนทุกระดับชั้น'
    });
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    let hText = '';
    try {
      const parsed = Array.isArray(p.highlights) ? p.highlights : (typeof p.highlights === 'string' ? JSON.parse(p.highlights) : []);
      hText = parsed.join('\n');
    } catch (e) {
      hText = '';
    }

    setForm({
      title: p.title || '',
      category: p.category || 'สิ่งแวดล้อม & สวัสดิการ',
      icon: p.icon || '🎯',
      progress: p.progress || 100,
      status: p.status || 'ดำเนินการสำเร็จ',
      status_color: p.status_color || '#10b981',
      description: p.description || '',
      highlightsText: hText,
      target: p.target || 'นักเรียนทุกระดับชั้น'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('ยืนยันต้องการลบนโยบายนี้ออกจากระบบ?')) return;
    try {
      const { error } = await supabase
        .from('web_policies')
        .delete()
        .eq('id', id);
      if (error) throw error;
      alert('ลบนโยบายสำเร็จ!');
      loadPolicies();
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message);
    }
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={24} /> จัดการนโยบายสภานักเรียน
          </div>
          <div className="page-subtitle">เพิ่ม แก้ไข และอัปเดตความคืบหน้านโยบายที่จะแสดงในหน้าแรกของเว็บไซต์</div>
        </div>

        {policies.length === 0 && (
          <button
            onClick={handleSeedData}
            disabled={submitting}
            style={{
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13
            }}
          >
            <Sparkles size={16} /> นำเข้าข้อมูลนโยบายเริ่มต้น 6 รายการ
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">{editingId ? '✏️ แก้ไขนโยบาย' : '➕ เพิ่มนโยบายใหม่'}</span>
          {editingId && (
            <button
              style={{ fontSize: 12, padding: '4px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={resetForm}
            >
              <X size={14} /> ยกเลิกการแก้ไข
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ชื่อนโยบาย <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="text"
                className="form-ctrl"
                placeholder="เช่น โครงการขยะแลกแต้ม SWSC"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>หมวดหมู่ <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="text"
                className="form-ctrl"
                placeholder="เช่น สิ่งแวดล้อม & สวัสดิการ"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ไอคอน Emoji</label>
              <input
                type="text"
                className="form-ctrl"
                placeholder="เช่น ♻️, 💬, 🛋️, 📚, 🛡️, 🎉"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ความคืบหน้า ({form.progress}%)</label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                style={{ width: '100%', marginTop: 8 }}
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: e.target.value })}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ข้อความสถานะ</label>
              <input
                type="text"
                className="form-ctrl"
                placeholder="เช่น ดำเนินการสำเร็จ, กำลังดำเนินการ"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ธีมสีป้ายสถานะ</label>
              <select
                className="form-ctrl"
                value={form.status_color}
                onChange={(e) => setForm({ ...form, status_color: e.target.value })}
              >
                <option value="#10b981">🟢 เขียว (สำเร็จแล้ว)</option>
                <option value="#8b5cf6">🟣 ม่วง (กำลังดำเนินการ)</option>
                <option value="#3b82f6">🔵 ฟ้า (กำลังดำเนินการ)</option>
                <option value="#f59e0b">🟠 ส้ม (เตรียมจัดกิจกรรม)</option>
                <option value="#ef4444">🔴 แดง (แผนงาน)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>กลุ่มเป้าหมาย</label>
              <input
                type="text"
                className="form-ctrl"
                placeholder="เช่น นักเรียนทุกระดับชั้น"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>รายละเอียดนโยบาย</label>
            <textarea
              className="form-ctrl"
              style={{ minHeight: 70 }}
              placeholder="อธิบายสรุปนโยบายและเป้าหมายของโครงการนี้..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              ผลงานการดำเนินงานย่อ (พิมพ์ 1 ข้อต่อ 1 บรรทัด)
            </label>
            <textarea
              className="form-ctrl"
              style={{ minHeight: 80 }}
              placeholder="จัดตั้งจุดรับขยะแลกแต้มประจำโรงเรียน&#10;เชื่อมโยงระบบฐานข้อมูลแต้มสะสมออนไลน์&#10;สร้างจิตสำนึกด้านสิ่งแวดล้อม"
              value={form.highlightsText}
              onChange={(e) => setForm({ ...form, highlightsText: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="submit"
              disabled={submitting}
              className="btn-download-pdf"
              style={{ border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '14px', background: 'linear-gradient(135deg, var(--purple-600), var(--purple-700))' }}
            >
              <Save size={16} /> {submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูลนโยบาย'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">🎯 รายการนโยบายทั้งหมด ({policies.length})</span>
        </div>
        <div style={{ padding: 20 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>กำลังโหลดข้อมูล...</div>
          ) : policies.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '30px 0' }}>
              ยังไม่มีข้อมูลนโยบายในฐานข้อมูล Supabase<br />
              <button
                onClick={handleSeedData}
                style={{ marginTop: 12, padding: '8px 16px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
              >
                กดที่นี่เพื่อนำเข้าข้อมูลนโยบายเริ่มต้น 6 ข้อ
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
              {policies.map((p) => (
                <div key={p.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justify: 'space-between', align: 'flex-start', marginBottom: 8 }}>
                    <span style={{ fontSize: 28 }}>{p.icon || '🎯'}</span>
                    <span style={{ background: (p.status_color || '#10b981') + '15', color: p.status_color || '#10b981', border: `1px solid ${p.status_color || '#10b981'}40`, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                      {p.status} ({p.progress}%)
                    </span>
                  </div>

                  <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#1f2937' }}>{p.title}</h4>
                  <div style={{ fontSize: 11, color: 'var(--purple-600)', fontWeight: 600, marginBottom: 8 }}>{p.category}</div>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px', flex: 1, lineHeight: 1.5 }}>{p.description}</p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                    <button
                      onClick={() => handleEdit(p)}
                      style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Edit2 size={12} /> แก้ไข
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Trash2 size={12} /> ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
