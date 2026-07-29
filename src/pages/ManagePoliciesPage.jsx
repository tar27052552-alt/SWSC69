import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { 
  Target, Trash2, Edit2, X, Plus, Save, Sparkles, 
  CheckCircle2, Search, RefreshCw, Users, Layers, 
  TrendingUp, BarChart2, ListChecks, ArrowUpRight
} from 'lucide-react';

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
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showFormModal, setShowFormModal] = useState(false);
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
        alert('บันทึกการแก้ไขนโยบายสำเร็จ!');
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
    setShowFormModal(false);
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
    setShowFormModal(true);
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

  // Categories list for filter tabs
  const categories = useMemo(() => {
    const set = new Set(policies.map(p => p.category).filter(Boolean));
    return Array.from(set);
  }, [policies]);

  // Filtered policies list
  const filteredPolicies = useMemo(() => {
    return policies.filter(p => {
      const matchesSearch = (p.title || '').toLowerCase().includes(search.toLowerCase()) ||
                            (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
                            (p.category || '').toLowerCase().includes(search.toLowerCase()) ||
                            (p.target || '').toLowerCase().includes(search.toLowerCase());
      const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [policies, search, selectedCategory]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = policies.length;
    const completed = policies.filter(p => p.progress >= 100).length;
    const inProgress = policies.filter(p => p.progress > 0 && p.progress < 100).length;
    const avgProgress = total > 0 ? Math.round(policies.reduce((acc, p) => acc + (p.progress || 0), 0) / total) : 0;

    return { total, completed, inProgress, avgProgress };
  }, [policies]);

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ── PAGE HEADER ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: 'var(--shadow-primary)'
            }}>
              <Target size={22} />
            </div>
            <span>จัดการนโยบายสภานักเรียน</span>
          </div>
          <div className="page-subtitle">
            เพิ่ม แก้ไข และติดตามความคืบหน้านโยบายสภานักเรียนสำหรับแสดงในหน้าแรกของเว็บไซต์
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              if (showFormModal && !editingId) {
                setShowFormModal(false);
              } else {
                setEditingId(null);
                setForm({
                  title: '', category: 'สิ่งแวดล้อม & สวัสดิการ', icon: '🎯',
                  progress: 100, status: 'ดำเนินการสำเร็จ', status_color: '#10b981',
                  description: '', highlightsText: '', target: 'นักเรียนทุกระดับชั้น'
                });
                setShowFormModal(true);
              }
            }}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {showFormModal && !editingId ? <X size={18} /> : <Plus size={18} />}
            <span>{showFormModal && !editingId ? 'ปิดฟอร์ม' : 'เพิ่มนโยบายใหม่'}</span>
          </button>
        </div>
      </div>

      {/* ── STATS CARDS ── */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#e0e7ff', color: 'var(--primary)' }}>
            <Layers size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">นโยบายทั้งหมด</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-label">สำเร็จแล้ว (100%)</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.inProgress}</div>
            <div className="stat-label">กำลังดำเนินการ</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#eff6ff', color: '#3b82f6' }}>
            <BarChart2 size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.avgProgress}%</div>
            <div className="stat-label">ความคืบหน้าเฉลี่ย</div>
          </div>
        </div>
      </div>

      {/* ── FORM SECTION (MODAL / INLINE CARD) ── */}
      {showFormModal && (
        <div className="card" style={{ marginBottom: 28, border: '2px solid var(--primary-light)', animation: 'fadeIn 0.25s ease' }}>
          <div className="card-header" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {editingId ? <Edit2 size={16} /> : <Plus size={16} />}
              </div>
              <div>
                <div className="card-title" style={{ fontSize: 16 }}>
                  {editingId ? 'แก้ไขข้อมูลนโยบาย' : 'เพิ่มนโยบายสภานักเรียนใหม่'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  กรอกข้อมูลนโยบาย หมวดหมู่ เปอร์เซ็นต์ความคืบหน้า และผลงานที่เกี่ยวข้อง
                </div>
              </div>
            </div>
            <button
              onClick={resetForm}
              className="btn btn-gray btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <X size={14} /> ยกเลิก
            </button>
          </div>

          <form onSubmit={handleSubmit} className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
              {/* Policy Title */}
              <div>
                <label className="form-label">
                  ชื่อนโยบาย <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น โครงการขยะแลกแต้ม SWSC"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label className="form-label">
                  หมวดหมู่นโยบาย <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น สิ่งแวดล้อม & สวัสดิการ, วิชาการ"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  required
                />
              </div>

              {/* Emoji Icon */}
              <div>
                <label className="form-label">ไอคอน Emoji</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เลือกใส่อีโมจิ เช่น ♻️, 💬, 🛋️, 📚, 🛡️, 🎉"
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                />
              </div>

              {/* Target Audience */}
              <div>
                <label className="form-label">กลุ่มเป้าหมาย</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น นักเรียนทุกระดับชั้น"
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                />
              </div>

              {/* Progress Slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    ความคืบหน้าโครงการ
                  </label>
                  <span className="badge badge-purple" style={{ fontWeight: 700 }}>
                    {form.progress}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  style={{ width: '100%', height: 6, cursor: 'pointer', accentColor: 'var(--primary)' }}
                  value={form.progress}
                  onChange={(e) => setForm({ ...form, progress: e.target.value })}
                />
                {/* Visual Bar */}
                <div style={{ height: 6, width: '100%', background: '#e2e8f0', borderRadius: 99, marginTop: 8, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${form.progress}%`,
                    background: form.status_color || 'var(--primary)',
                    borderRadius: 99,
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              {/* Status Text */}
              <div>
                <label className="form-label">ข้อความสถานะ</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น ดำเนินการสำเร็จ, กำลังดำเนินการ"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                />
              </div>

              {/* Status Color Theme */}
              <div>
                <label className="form-label">ธีมสีป้ายสถานะ</label>
                <select
                  className="select-field"
                  value={form.status_color}
                  onChange={(e) => setForm({ ...form, status_color: e.target.value })}
                >
                  <option value="#10b981">🟢 เขียว (ดำเนินการสำเร็จแล้ว)</option>
                  <option value="#8b5cf6">🟣 ม่วง (กำลังดำเนินการ - สวัสดิการ)</option>
                  <option value="#3b82f6">🔵 ฟ้า (กำลังดำเนินการ - วินัย/ระเบียบ)</option>
                  <option value="#f59e0b">🟠 ส้ม (เตรียมจัดกิจกรรม / ดำเนินการ)</option>
                  <option value="#ef4444">🔴 แดง (อยู่ในช่วงเสนอแผนงาน)</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="form-label">รายละเอียดสรุปนโยบาย</label>
              <textarea
                className="input-field"
                style={{ minHeight: 70, resize: 'vertical' }}
                placeholder="อธิบายสรุปภาพรวม เป้าหมาย และจุดประสงค์หลักของนโยบายนี้..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {/* Highlights List (Textarea lines) */}
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ListChecks size={15} /> ผลงานการดำเนินงานย่อ / หัวข้อสำคัญ (พิมพ์ 1 ข้อต่อ 1 บรรทัด)
              </label>
              <textarea
                className="input-field"
                style={{ minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="จัดตั้งจุดรับขยะแลกแต้มประจำโรงเรียน&#10;เชื่อมโยงระบบฐานข้อมูลแต้มสะสมออนไลน์&#10;สร้างจิตสำนึกด้านสิ่งแวดล้อมให้แก่นักเรียน"
                value={form.highlightsText}
                onChange={(e) => setForm({ ...form, highlightsText: e.target.value })}
              />
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-gray"
                disabled={submitting}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px' }}
              >
                <Save size={16} />
                <span>{submitting ? 'กำลังบันทึก...' : (editingId ? 'บันทึกการแก้ไข' : 'บันทึกนโยบาย')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MAIN CONTENT CARD ── */}
      <div className="card">
        {/* Card Header Controls */}
        <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14, padding: '18px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="card-title" style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={18} color="var(--primary)" /> รายการนโยบายสภานักเรียน
              </span>
              <span className="badge badge-purple">{filteredPolicies.length} รายการ</span>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', width: 260 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              <input
                type="text"
                className="input-field"
                placeholder="ค้นหานโยบาย, หมวดหมู่..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 36, fontSize: 13, height: 38 }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-light)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <button
              onClick={() => setSelectedCategory('all')}
              className={`badge ${selectedCategory === 'all' ? 'badge-purple' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)' }}
            >
              ทั้งหมด ({policies.length})
            </button>
            {categories.map((cat) => {
              const count = policies.filter(p => p.category === cat).length;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`badge ${isSelected ? 'badge-blue' : 'badge-gray'}`}
                  style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)', whiteSpace: 'nowrap' }}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Policy Grid */}
        <div className="card-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, color: 'var(--primary)' }} />
              <div style={{ fontWeight: 600 }}>กำลังโหลดข้อมูลนโยบาย...</div>
            </div>
          ) : filteredPolicies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f8fafc', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' }}>
              <Target size={44} style={{ color: 'var(--text-light)', marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>ยังไม่มีข้อมูลนโยบายสภาฯ</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginBottom: 16 }}>
                {search ? 'ไม่พบนโยบายตามคำค้นหาดังกล่าว' : 'สามารถกดเพิ่มนโยบายใหม่ได้เลย'}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => { setSearch(''); setShowFormModal(true); }} className="btn btn-primary btn-sm">
                  <Plus size={16} /> เพิ่มนโยบายใหม่
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
              gap: 22
            }}>
              {filteredPolicies.map((p) => {
                let highlightsList = [];
                try {
                  highlightsList = Array.isArray(p.highlights) 
                    ? p.highlights 
                    : (typeof p.highlights === 'string' ? JSON.parse(p.highlights) : []);
                } catch (e) {
                  highlightsList = [];
                }

                const statusBg = (p.status_color || '#10b981') + '15';
                const statusBorder = (p.status_color || '#10b981') + '40';

                return (
                  <div
                    key={p.id}
                    className="video-card-hover"
                    style={{
                      background: 'white',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border)',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'var(--transition-slow)'
                    }}
                  >
                    {/* Header: Icon Emoji + Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                      <div style={{
                        width: 46, height: 46, borderRadius: 12,
                        background: '#f8fafc', border: '1px solid var(--border-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, boxShadow: 'var(--shadow-sm)'
                      }}>
                        {p.icon || '🎯'}
                      </div>
                      <div style={{
                        background: statusBg,
                        color: p.status_color || '#10b981',
                        border: `1px solid ${statusBorder}`,
                        padding: '4px 12px',
                        borderRadius: 99,
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.status_color || '#10b981' }} />
                        {p.status} ({p.progress}%)
                      </div>
                    </div>

                    {/* Category */}
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                      {p.category}
                    </div>

                    {/* Title */}
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', lineHeight: 1.4, margin: '0 0 8px' }}>
                      {p.title}
                    </h3>

                    {/* Target */}
                    {p.target && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
                        <Users size={14} color="var(--text-light)" /> {p.target}
                      </div>
                    )}

                    {/* Description */}
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 14px', flexGrow: 1 }}>
                      {p.description}
                    </p>

                    {/* Progress Bar Container */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>
                        <span>ความคืบหน้า</span>
                        <span style={{ color: p.status_color || 'var(--primary)' }}>{p.progress}%</span>
                      </div>
                      <div style={{ height: 8, width: '100%', background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${p.progress}%`,
                          background: p.status_color || 'var(--primary)',
                          borderRadius: 99,
                          transition: 'width 0.5s ease'
                        }} />
                      </div>
                    </div>

                    {/* Highlights List */}
                    {highlightsList.length > 0 && (
                      <div style={{
                        background: '#f8fafc',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 16,
                        border: '1px solid var(--border-light)'
                      }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ListChecks size={13} color="var(--primary)" /> การดำเนินงานสำคัญ:
                        </div>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {highlightsList.map((item, idx) => (
                            <li key={idx} style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4 }}>
                              <CheckCircle2 size={14} color="#10b981" style={{ flexShrink: 0, marginTop: 1 }} />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Footer Actions */}
                    <div style={{
                      display: 'flex', justifyContent: 'flex-end', gap: 8,
                      paddingTop: 12, borderTop: '1px solid var(--border-light)', marginTop: 'auto'
                    }}>
                      <button
                        onClick={() => handleEdit(p)}
                        className="btn btn-warning btn-sm"
                        style={{ fontSize: 11.5, padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Edit2 size={12} /> แก้ไข
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="btn btn-danger btn-sm"
                        style={{ fontSize: 11.5, padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Trash2 size={12} /> ลบ
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
