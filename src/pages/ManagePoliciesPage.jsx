import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { 
  Target, Trash2, Edit2, X, Plus, Save, Sparkles, 
  CheckCircle2, Search, RefreshCw, Users, Layers, 
  TrendingUp, BarChart2, ListChecks, ArrowUpRight,
  Copy, Check, AlertTriangle, ExternalLink, Shield,
  Megaphone, Camera, Database, Info
} from 'lucide-react';

const SQL_CREATE_TABLE = `-- Create web_policies table for Student Council Portal
CREATE TABLE IF NOT EXISTS public.web_policies (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'นโยบายสภาฯ',
    description TEXT,
    icon TEXT DEFAULT '📌',
    status TEXT DEFAULT 'ดำเนินการ',
    status_color TEXT DEFAULT '#8b5cf6',
    progress INTEGER DEFAULT 0,
    highlights JSONB DEFAULT '[]'::jsonb,
    target TEXT DEFAULT 'นักเรียนโรงเรียนสรรพวิทยาคมทุกคน',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.web_policies ENABLE ROW LEVEL SECURITY;

-- Allow Public Read
DROP POLICY IF EXISTS "Public read web_policies" ON public.web_policies;
CREATE POLICY "Public read web_policies" ON public.web_policies FOR SELECT USING (true);

-- Allow Public / Authenticated Write
DROP POLICY IF EXISTS "Public write web_policies" ON public.web_policies;
CREATE POLICY "Public write web_policies" ON public.web_policies FOR ALL USING (true);

-- Insert Initial Policies (4 policies matching SWSC portal)
INSERT INTO public.web_policies (title, category, description, icon, status, status_color, progress, highlights, target)
VALUES 
(
  'ส่งเสริมสิทธิและเสียงสะท้อนของนักเรียน (Student Voice & Rights)',
  'นโยบายด้านประชาธิปไตย',
  'เปิดช่องทางการรับฟังความคิดเห็นและข้อเสนอแนะจากนักเรียนทุกระดับชั้นอย่างโปร่งใส พร้อมผลักดันสู่การแก้ไขปัญหาจริงร่วมกับฝ่ายบริหารโรงเรียน',
  '📢',
  'ดำเนินการแล้ว 80%',
  '#3b82f6',
  80,
  '["จัดทำกล่องรับฟังความคิดเห็นออนไลน์ผ่านเว็บสภาฯ", "จัดการประชุมรับฟังเสียงตัวแทนห้องเรียน", "สรุปข้อเสนอแนะส่งต่อคณะครูและฝ่ายบริหาร"]'::jsonb,
  'นักเรียนทุกคน'
),
(
  'ยกระดับกิจกรรมและการมีส่วนร่วมของนักเรียน (Active Student Activities)',
  'นโยบายด้านกิจกรรมและนันทนาการ',
  'สนับสนุนกิจกรรมสร้างสรรค์ ทั้งด้านดนตรี ศิลปะ กีฬา และวิชาการ เพื่อส่งเสริมศักยภาพและความสุขในการเรียนรู้ของนักเรียนสรรพวิทยาคม',
  '🎨',
  'กำลังดำเนินการ',
  '#ec4899',
  65,
  '["จัดกิจกรรมวันสำคัญและงานสานสัมพันธ์นักเรียน", "สนับสนุนการแข่งขันกีฬาและนันทนาการภายใน", "เปิดพื้นที่แสดงความสามารถของนักเรียน"]'::jsonb,
  'นักเรียนทุกระดับชั้น'
),
(
  'ขับเคลื่อนสิ่งแวดล้อมและห้องเรียนน่าอยู่ (Green & Clean School)',
  'นโยบายด้านบริการและสิ่งแวดล้อม',
  'รณรงค์การคัดแยกขยะ ระบบขยะแลกแต้ม และการดูแลรักษาความสะอาดในพื้นที่ส่วนกลาง เพื่อสร้างสภาพแวดล้อมที่เอื้อต่อการเรียนรู้',
  '🌱',
  'ดำเนินการต่อเนื่อง',
  '#10b981',
  75,
  '["ส่งเสริมระบบขยะแลกแต้มร่วมกับโรงเรียน", "จัดเวรดูแลรักษาความสะอาดพื้นที่สภานักเรียน", "รณรงค์ลดการใช้พลาสติกแบบใช้ครั้งเดียว"]'::jsonb,
  'บุคลากรและนักเรียนทุกคน'
),
(
  'พัฒนาระบบสารสนเทศสภานักเรียนสู่ยุคดิจิทัล (Digital Student Council)',
  'นโยบายด้านเทคโนโลยีและสารสนเทศ',
  'พัฒนาระบบบริการข้อมูล ข่าวสาร ปฏิทินกิจกรรม และระบบสืบค้นเกียรติบัตรออนไลน์ เพื่อความสะดวกรวดเร็วและเข้าถึงง่ายตลอด 24 ชั่วโมง',
  '💻',
  'สำเร็จแล้ว',
  '#8b5cf6',
  95,
  '["เปิดตัวเว็บไซต์ทางการ SWSC.OFFICIAL", "ระบบปฏิทินกิจกรรมและข่าวสารแบบเรียลไทม์", "ระบบค้นหาและดาวน์โหลดเกียรติบัตรออนไลน์"]'::jsonb,
  'ครู นักเรียน และผู้ปกครอง'
);`;

// 4 Default Policies that match index.html exactly
const DEFAULT_POLICIES = [
  {
    title: 'ส่งเสริมสิทธิและเสียงสะท้อนของนักเรียน (Student Voice & Rights)',
    category: 'นโยบายด้านประชาธิปไตย',
    description: 'เปิดช่องทางการรับฟังความคิดเห็นและข้อเสนอแนะจากนักเรียนทุกระดับชั้นอย่างโปร่งใส พร้อมผลักดันสู่การแก้ไขปัญหาจริงร่วมกับฝ่ายบริหารโรงเรียน',
    icon: '📢',
    status: 'ดำเนินการแล้ว 80%',
    status_color: '#3b82f6',
    progress: 80,
    highlights: JSON.stringify(['จัดทำกล่องรับฟังความคิดเห็นออนไลน์ผ่านเว็บสภาฯ', 'จัดการประชุมรับฟังเสียงตัวแทนห้องเรียน', 'สรุปข้อเสนอแนะส่งต่อคณะครูและฝ่ายบริหาร']),
    target: 'นักเรียนทุกคน'
  },
  {
    title: 'ยกระดับกิจกรรมและการมีส่วนร่วมของนักเรียน (Active Student Activities)',
    category: 'นโยบายด้านกิจกรรมและนันทนาการ',
    description: 'สนับสนุนกิจกรรมสร้างสรรค์ ทั้งด้านดนตรี ศิลปะ กีฬา และวิชาการ เพื่อส่งเสริมศักยภาพและความสุขในการเรียนรู้ของนักเรียนสรรพวิทยาคม',
    icon: '🎨',
    status: 'กำลังดำเนินการ',
    status_color: '#ec4899',
    progress: 65,
    highlights: JSON.stringify(['จัดกิจกรรมวันสำคัญและงานสานสัมพันธ์นักเรียน', 'สนับสนุนการแข่งขันกีฬาและนันทนาการภายใน', 'เปิดพื้นที่แสดงความสามารถของนักเรียน']),
    target: 'นักเรียนทุกระดับชั้น'
  },
  {
    title: 'ขับเคลื่อนสิ่งแวดล้อมและห้องเรียนน่าอยู่ (Green & Clean School)',
    category: 'นโยบายด้านบริการและสิ่งแวดล้อม',
    description: 'รณรงค์การคัดแยกขยะ ระบบขยะแลกแต้ม และการดูแลรักษาความสะอาดในพื้นที่ส่วนกลาง เพื่อสร้างสภาพแวดล้อมที่เอื้อต่อการเรียนรู้',
    icon: '🌱',
    status: 'ดำเนินการต่อเนื่อง',
    status_color: '#10b981',
    progress: 75,
    highlights: JSON.stringify(['ส่งเสริมระบบขยะแลกแต้มร่วมกับโรงเรียน', 'จัดเวรดูแลรักษาความสะอาดพื้นที่สภานักเรียน', 'รณรงค์ลดการใช้พลาสติกแบบใช้ครั้งเดียว']),
    target: 'บุคลากรและนักเรียนทุกคน'
  },
  {
    title: 'พัฒนาระบบสารสนเทศสภานักเรียนสู่ยุคดิจิทัล (Digital Student Council)',
    category: 'นโยบายด้านเทคโนโลยีและสารสนเทศ',
    description: 'พัฒนาระบบบริการข้อมูล ข่าวสาร ปฏิทินกิจกรรม และระบบสืบค้นเกียรติบัตรออนไลน์ เพื่อความสะดวกรวดเร็วและเข้าถึงง่ายตลอด 24 ชั่วโมง',
    icon: '💻',
    status: 'สำเร็จแล้ว',
    status_color: '#8b5cf6',
    progress: 95,
    highlights: JSON.stringify(['เปิดตัวเว็บไซต์ทางการ SWSC.OFFICIAL', 'ระบบปฏิทินกิจกรรมและข่าวสารแบบเรียลไทม์', 'ระบบค้นหาและดาวน์โหลดเกียรติบัตรออนไลน์']),
    target: 'ครู นักเรียน และผู้ปกครอง'
  }
];

export default function ManagePoliciesPage() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tableExists, setTableExists] = useState(true);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlBox, setShowSqlBox] = useState(false);

  // Custom in-app delete modal state
  const [deleteModalItem, setDeleteModalItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    title: '',
    category: 'นโยบายด้านประชาธิปไตย',
    icon: '🎯',
    progress: 80,
    status: 'กำลังดำเนินการ',
    status_color: '#3b82f6',
    description: '',
    highlightsText: '',
    target: 'นักเรียนทุกคน'
  });

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('web_policies')
        .select('*')
        .order('id', { ascending: true });

      if (error && (error.code === '42P01' || error.code === 'PGRST205')) {
        console.warn('Table web_policies does not exist in Supabase yet. Using default fallback.');
        setTableExists(false);
        setIsUsingFallback(true);
        setPolicies(DEFAULT_POLICIES.map((p, idx) => ({ ...p, id: idx + 1 })));
      } else if (error) {
        throw error;
      } else {
        setTableExists(true);
        setIsUsingFallback(false);
        setPolicies(data || []);
      }
    } catch (err) {
      console.error('Failed to load policies:', err);
      setTableExists(false);
      setIsUsingFallback(true);
      setPolicies(DEFAULT_POLICIES.map((p, idx) => ({ ...p, id: idx + 1 })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies();
  }, []);

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_CREATE_TABLE);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleSeedData = async () => {
    if (!confirm('ต้องการนำเข้าข้อมูลนโยบายเริ่มต้น 4 รายการเข้าฐานข้อมูลหรือไม่?')) return;
    setSubmitting(true);
    try {
      const insertData = DEFAULT_POLICIES.map(p => ({
        ...p,
        highlights: JSON.parse(p.highlights)
      }));

      const { error } = await supabase
        .from('web_policies')
        .insert(insertData);

      if (error) throw error;
      alert('นำเข้าข้อมูลนโยบายเริ่มต้น 4 รายการเข้าสู่ฐานข้อมูลสำเร็จ!');
      loadPolicies();
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
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
      highlights: highlightsArr,
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
      category: 'นโยบายด้านประชาธิปไตย',
      icon: '🎯',
      progress: 80,
      status: 'กำลังดำเนินการ',
      status_color: '#3b82f6',
      description: '',
      highlightsText: '',
      target: 'นักเรียนทุกคน'
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
      category: p.category || 'นโยบายด้านประชาธิปไตย',
      icon: p.icon || '🎯',
      progress: p.progress || 80,
      status: p.status || 'กำลังดำเนินการ',
      status_color: p.status_color || '#3b82f6',
      description: p.description || '',
      highlightsText: hText,
      target: p.target || 'นักเรียนทุกคน'
    });
    setShowFormModal(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Dedicated in-app confirm delete function
  const handleConfirmDelete = async () => {
    if (!deleteModalItem) return;
    const itemToDelete = deleteModalItem;
    setIsDeleting(true);

    // Optimistic UI update
    setPolicies(prev => prev.filter(p => p.id !== itemToDelete.id));

    try {
      const { error } = await supabase
        .from('web_policies')
        .delete()
        .eq('id', itemToDelete.id);

      if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
        console.error('Delete error:', error);
        alert('ลบไม่สำเร็จ: ' + error.message);
      }
    } catch (err) {
      console.error('Delete exception:', err);
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    } finally {
      setIsDeleting(false);
      setDeleteModalItem(null);
      loadPolicies();
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
      {/* ── ADMIN NAV TABS ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto', paddingBottom: 4 }}>
        <Link to="/admin" className="badge badge-gray" style={{ padding: '7px 14px', fontSize: 12.5, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Shield size={14} /> จัดการผู้ใช้งาน
        </Link>
        <Link to="/admin-announcements" className="badge badge-gray" style={{ padding: '7px 14px', fontSize: 12.5, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Megaphone size={14} /> จัดการประกาศหน้าเว็บ
        </Link>
        <Link to="/admin-videos" className="badge badge-gray" style={{ padding: '7px 14px', fontSize: 12.5, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Camera size={14} /> จัดการวิดีโอกิจกรรม
        </Link>
        <Link to="/admin-policies" className="badge badge-purple" style={{ padding: '7px 14px', fontSize: 12.5, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <Target size={14} /> จัดการนโยบายสภาฯ
        </Link>
      </div>

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
            กำหนด ควบคุมความคืบหน้า และแสดงผลนโยบายขับเคลื่อนสภาฯ บนหน้าเว็บไซต์หลัก
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {policies.length === 0 && tableExists && (
            <button
              onClick={handleSeedData}
              className="btn btn-warning"
              disabled={submitting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="บันทึกข้อมูลนโยบายเริ่มต้นเข้าสู่ตาราง Supabase"
            >
              <Database size={16} />
              <span>นำเข้านโยบายเริ่มต้น</span>
            </button>
          )}

          <button
            onClick={() => {
              if (showFormModal && !editingId) {
                setShowFormModal(false);
              } else {
                setEditingId(null);
                setForm({
                  title: '', category: 'นโยบายด้านประชาธิปไตย', icon: '🎯',
                  progress: 80, status: 'กำลังดำเนินการ', status_color: '#3b82f6',
                  description: '', highlightsText: '', target: 'นักเรียนทุกคน'
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

      {/* ── DATABASE STATUS / SQL BANNER (ONLY IF TABLE DOES NOT EXIST) ── */}
      {!tableExists && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>ยังไม่ได้สร้างตาราง web_policies ใน Supabase</span>
                  <span className="badge badge-purple" style={{ fontSize: 11 }}>
                    Schema Not Found
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: '#78350f', marginTop: 4, lineHeight: 1.5 }}>
                  หน้าเว็บหลักและระบบแอดมินกำลังใช้ 4 นโยบายเริ่มต้นตัวอย่าง หากต้องการให้แก้ไข/เพิ่มนโยบายได้แบบเรียลไทม์ โปรดนำคำสั่ง SQL ไปรันที่ Supabase Dashboard &gt; SQL Editor
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleCopySql}
                className="btn btn-sm"
                style={{
                  background: copiedSql ? '#10b981' : '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontWeight: 600
                }}
              >
                {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedSql ? 'คัดลอก SQL สำเร็จ!' : 'คัดลอกคำสั่ง SQL สร้างตาราง'}</span>
              </button>

              <button
                onClick={() => setShowSqlBox(!showSqlBox)}
                className="btn btn-gray btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span>{showSqlBox ? 'ซ่อน SQL' : 'ดูคำสั่ง SQL'}</span>
              </button>

              <button
                onClick={loadPolicies}
                className="btn btn-gray btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                title="รีเฟรชตรวจสอบการเชื่อมต่อ"
              >
                <RefreshCw size={14} />
                <span>ตรวจสอบตาราง</span>
              </button>
            </div>
          </div>

          {/* SQL Preview Box */}
          {showSqlBox && (
            <div style={{ marginTop: 6, background: '#1e293b', borderRadius: 8, padding: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, color: '#94a3b8', fontSize: 12 }}>
                <span>SQL Script สำหรับรันใน Supabase SQL Editor:</span>
                <button
                  onClick={handleCopySql}
                  style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                >
                  <Copy size={12} /> {copiedSql ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}
                </button>
              </div>
              <pre style={{
                margin: 0,
                color: '#e2e8f0',
                fontSize: 12,
                fontFamily: 'monospace',
                maxHeight: 220,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.4
              }}>
                {SQL_CREATE_TABLE}
              </pre>
            </div>
          )}
        </div>
      )}

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
                  placeholder="เช่น ส่งเสริมสิทธิและเสียงสะท้อนของนักเรียน"
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
                  placeholder="เช่น นโยบายด้านประชาธิปไตย, ด้านกิจกรรม"
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
                  placeholder="เลือกใส่อีโมจิ เช่น 📢, 🎨, 🌱, 💻, 📌"
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
                  placeholder="เช่น นักเรียนทุกคน, นักเรียนทุกระดับชั้น"
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
                  placeholder="เช่น ดำเนินการแล้ว 80%, กำลังดำเนินการ, สำเร็จแล้ว"
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
                  <option value="#3b82f6">🔵 ฟ้า (ประชาธิปไตย / สิทธิ์)</option>
                  <option value="#ec4899">🌸 ชมพู (กิจกรรม & นันทนาการ)</option>
                  <option value="#10b981">🟢 เขียว (บริการและสิ่งแวดล้อม / สำเร็จ)</option>
                  <option value="#8b5cf6">🟣 ม่วง (เทคโนโลยี & สารสนเทศ)</option>
                  <option value="#f59e0b">🟠 ส้ม (เตรียมจัดกิจกรรม / อยู่ระหว่างเสนอ)</option>
                  <option value="#ef4444">🔴 แดง (เร่งด่วน)</option>
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
                placeholder="จัดทำกล่องรับฟังความคิดเห็นออนไลน์ผ่านเว็บสภาฯ&#10;จัดการประชุมรับฟังเสียงตัวแทนห้องเรียน&#10;สรุปข้อเสนอแนะส่งต่อคณะครูและฝ่ายบริหาร"
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
                {search ? 'ไม่พบนโยบายตามคำค้นหาดังกล่าว' : 'สามารถกดเพิ่มนโยบายใหม่ หรือนำเข้านโยบายเริ่มต้นได้เลย'}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={() => { setSearch(''); setShowFormModal(true); }} className="btn btn-primary btn-sm">
                  <Plus size={16} /> เพิ่มนโยบายใหม่
                </button>
                <button onClick={handleSeedData} className="btn btn-warning btn-sm">
                  <Database size={16} /> นำเข้านโยบายเริ่มต้น
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
                        onClick={() => setDeleteModalItem(p)}
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

      {/* ── CUSTOM IN-APP DELETE CONFIRMATION MODAL ── */}
      {deleteModalItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 16
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 16,
            maxWidth: 440,
            width: '100%',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border-light)',
            animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{ padding: '24px 24px 16px', textAlign: 'center' }}>
              <div style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                background: '#fee2e2',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Trash2 size={28} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 8, margin: '0 0 8px' }}>
                ยืนยันการลบนโยบาย?
              </h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                คุณแน่ใจหรือไม่ว่าต้องการลบนโยบาย <strong style={{ color: 'var(--text)' }}>"{deleteModalItem.title}"</strong> ออกจากระบบ?
              </p>
              <div style={{
                marginTop: 14,
                padding: '9px 12px',
                background: '#f8fafc',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-muted)',
                border: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'space-around'
              }}>
                <span>หมวดหมู่: <strong style={{ color: 'var(--primary)' }}>{deleteModalItem.category}</strong></span>
                <span>สถานะ: <strong style={{ color: deleteModalItem.status_color || '#10b981' }}>{deleteModalItem.status}</strong></span>
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: 12,
              padding: '16px 24px 20px',
              justifyContent: 'center',
              background: '#fafafa',
              borderTop: '1px solid var(--border-light)'
            }}>
              <button
                type="button"
                onClick={() => setDeleteModalItem(null)}
                className="btn btn-gray"
                disabled={isDeleting}
                style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn btn-danger"
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                {isDeleting ? (
                  <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Trash2 size={15} />
                )}
                <span>{isDeleting ? 'กำลังลบ...' : 'ยืนยันลบนโยบาย'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
