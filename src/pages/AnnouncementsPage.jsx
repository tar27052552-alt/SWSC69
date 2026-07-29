import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { uploadFileToDrive, transformGoogleDriveUrl } from '../lib/googleDriveUpload';
import { 
  Megaphone, Save, Trash2, Edit2, X, Plus, ArrowUp, ArrowDown, 
  Search, RefreshCw, Eye, EyeOff, Sparkles, Image as ImageIcon,
  CheckCircle2, Link as LinkIcon, Calendar, Layers
} from 'lucide-react';

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnn, setLoadingAnn] = useState(false);
  const [submittingAnn, setSubmittingAnn] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'active', 'hidden'
  const [showFormModal, setShowFormModal] = useState(false);
  
  const [annForm, setAnnForm] = useState({ 
    title: '', 
    imagePreview: null, 
    imageFile: null, 
    link_url: '', 
    is_active: true 
  });
  const [editingAnnId, setEditingAnnId] = useState(null);

  const loadAnnouncements = async () => {
    setLoadingAnn(true);
    try {
      const { data, error } = await supabase
        .from('web_news')
        .select('*')
        .in('category', ['ประกาศ', 'ประกาศ_ซ่อน'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Failed to load announcements:', err);
    } finally {
      setLoadingAnn(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const toBase64 = (file) => new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const maxWidth = 1200;
        const maxHeight = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });

  const handleSubmitAnn = async (e) => {
    e.preventDefault();
    if (!editingAnnId && !annForm.imageFile) {
      alert('กรุณาเลือกรูปภาพประกาศด้วยครับ');
      return;
    }
    setSubmittingAnn(true);
    try {
      let finalImageUrl = annForm.imagePreview || '';

      if (annForm.imageFile) {
        const base64 = await toBase64(annForm.imageFile);
        const fileExt = annForm.imageFile.name.split('.').pop();
        const cleanTitle = (annForm.title.trim() || 'announcement').replace(/[\/\\?%*:|"<>]/g, '-');
        const fileName = `${cleanTitle}.${fileExt}`;
        const subFolderName = annForm.title.trim() || 'ประกาศไม่มีหัวข้อ';
        const result = await uploadFileToDrive(base64, fileName, 'pr', subFolderName);
        if (!result?.url) throw new Error('อัปโหลดรูปภาพไม่สำเร็จ');
        finalImageUrl = result.url;
      }

      const data = {
        headline: annForm.title.trim() || '-',
        image_url: finalImageUrl,
        detail: annForm.link_url.trim() || '-',
        category: annForm.is_active ? 'ประกาศ' : 'ประกาศ_ซ่อน',
        for_date: '-',
        for_day: '-',
        submitter: user?.name || user?.nickname || 'แอดมิน',
      };

      if (editingAnnId) {
        const { error } = await supabase.from('web_news').update(data).eq('id', editingAnnId);
        if (error) throw error;
        alert('แก้ไขประกาศสำเร็จ!');
      } else {
        const { error } = await supabase.from('web_news').insert([data]);
        if (error) throw error;
        alert('เพิ่มประกาศสำเร็จ!');
      }

      resetForm();
      loadAnnouncements();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmittingAnn(false);
    }
  };

  const resetForm = () => {
    setAnnForm({ title: '', imagePreview: null, imageFile: null, link_url: '', is_active: true });
    setEditingAnnId(null);
    setShowFormModal(false);
  };

  const handleDeleteAnn = async (id) => {
    if (!confirm('ยืนยันลบประกาศนี้ออกใช่หรือไม่?')) return;
    const { error } = await supabase.from('web_news').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    alert('ลบประกาศสำเร็จ!');
    loadAnnouncements();
  };

  const handleEditAnn = (ann) => {
    setEditingAnnId(ann.id);
    setAnnForm({
      title: ann.headline || '',
      imagePreview: ann.image_url,
      imageFile: null,
      link_url: ann.detail || '',
      is_active: ann.category === 'ประกาศ',
    });
    setShowFormModal(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleActive = async (ann) => {
    const newStatus = ann.category === 'ประกาศ' ? 'ประกาศ_ซ่อน' : 'ประกาศ';
    const { error } = await supabase.from('web_news').update({ category: newStatus }).eq('id', ann.id);
    if (error) { alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ'); return; }
    loadAnnouncements();
  };

  const handleMoveAnn = async (idx, direction) => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= announcements.length) return;
    
    setLoadingAnn(true);
    try {
      const itemA = announcements[idx];
      const itemB = announcements[targetIdx];
      
      const timeA = itemA.created_at;
      const timeB = itemB.created_at;
      
      const { error: err1 } = await supabase
        .from('web_news')
        .update({ created_at: timeB })
        .eq('id', itemA.id);
        
      const { error: err2 } = await supabase
        .from('web_news')
        .update({ created_at: timeA })
        .eq('id', itemB.id);
        
      if (err1 || err2) throw new Error(err1?.message || err2?.message);
      
      await loadAnnouncements();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการจัดลำดับ: ' + err.message);
    } finally {
      setLoadingAnn(false);
    }
  };

  // Filtered List
  const filteredAnnouncements = useMemo(() => {
    return announcements.filter(ann => {
      const matchesSearch = (ann.headline || '').toLowerCase().includes(search.toLowerCase()) ||
                            (ann.detail || '').toLowerCase().includes(search.toLowerCase()) ||
                            (ann.submitter || '').toLowerCase().includes(search.toLowerCase());
      if (activeFilter === 'active') return matchesSearch && ann.category === 'ประกาศ';
      if (activeFilter === 'hidden') return matchesSearch && ann.category === 'ประกาศ_ซ่อน';
      return matchesSearch;
    });
  }, [announcements, search, activeFilter]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = announcements.length;
    const activeCount = announcements.filter(a => a.category === 'ประกาศ').length;
    const hiddenCount = announcements.filter(a => a.category === 'ประกาศ_ซ่อน').length;
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const thisMonthCount = announcements.filter(a => (a.created_at || '').startsWith(currentMonthStr)).length;

    return { total, activeCount, hiddenCount, thisMonthCount };
  }, [announcements]);

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
              <Megaphone size={22} />
            </div>
            <span>จัดการประกาศสำคัญ (Carousel)</span>
          </div>
          <div className="page-subtitle">
            จัดการรูปภาพ สไลด์ประกาศ และข้อมูลข่าวสารสำคัญที่จะแสดงผลบนหน้าแรกของเว็บไซต์
          </div>
        </div>

        <button
          onClick={() => {
            if (showFormModal && !editingAnnId) {
              setShowFormModal(false);
            } else {
              setEditingAnnId(null);
              setAnnForm({ title: '', imagePreview: null, imageFile: null, link_url: '', is_active: true });
              setShowFormModal(true);
            }
          }}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          {showFormModal && !editingAnnId ? <X size={18} /> : <Plus size={18} />}
          <span>{showFormModal && !editingAnnId ? 'ปิดฟอร์ม' : 'เพิ่มประกาศใหม่'}</span>
        </button>
      </div>

      {/* ── STATS CARDS ── */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#e0e7ff', color: 'var(--primary)' }}>
            <Layers size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">ประกาศทั้งหมด</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <Eye size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.activeCount}</div>
            <div className="stat-label">กำลังแสดงผล (Carousel)</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#f8fafc', color: 'var(--text-muted)' }}>
            <EyeOff size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.hiddenCount}</div>
            <div className="stat-label">ซ่อนอยู่</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <Sparkles size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.thisMonthCount}</div>
            <div className="stat-label">เพิ่มในเดือนนี้</div>
          </div>
        </div>
      </div>

      {/* ── FORM SECTION (MODAL / INLINE CARD) ── */}
      {showFormModal && (
        <div className="card" style={{ marginBottom: 28, border: '2px solid var(--primary-light)', animation: 'fadeIn 0.25s ease' }}>
          <div className="card-header" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {editingAnnId ? <Edit2 size={16} /> : <Plus size={16} />}
              </div>
              <div>
                <div className="card-title" style={{ fontSize: 16 }}>
                  {editingAnnId ? 'แก้ไขข้อมูลประกาศ' : 'เพิ่มประกาศสไลด์ใหม่'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  อัปโหลดรูปภาพประกาศ ระบุหัวข้อ และใส่ลิงก์เชื่อมโยงไปยังหน้าเว็บภายนอก
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

          <form onSubmit={handleSubmitAnn} className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
              {/* Headline */}
              <div>
                <label className="form-label">หัวข้อประกาศ (ไม่บังคับ)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น กำหนดการสอบประจำภาคเรียน, กิจกรรมวันสถาปนา"
                  value={annForm.title}
                  onChange={e => setAnnForm(p => ({ ...p, title: e.target.value }))}
                />
              </div>

              {/* Link URL */}
              <div>
                <label className="form-label">ลิงก์แนบเพิ่มเติม (ถ้ามี)</label>
                <input
                  type="url"
                  className="input-field"
                  placeholder="เช่น https://www.facebook.com/... หรือ Google Drive"
                  value={annForm.link_url}
                  onChange={e => setAnnForm(p => ({ ...p, link_url: e.target.value }))}
                />
              </div>
            </div>

            {/* Image File Upload */}
            <div>
              <label className="form-label">
                รูปภาพประกาศ {!editingAnnId && <span style={{ color: 'var(--danger)' }}>*</span>}
              </label>

              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {annForm.imagePreview && (
                  <div style={{ position: 'relative', width: 280, height: 150, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border)', background: '#0f172a' }}>
                    <img
                      src={annForm.imageFile ? annForm.imagePreview : transformGoogleDriveUrl(annForm.imagePreview)}
                      alt="preview"
                      referrerPolicy="no-referrer"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                    <button
                      type="button"
                      onClick={() => setAnnForm(p => ({ ...p, imagePreview: null, imageFile: null }))}
                      style={{
                        position: 'absolute', top: 8, right: 8, width: 26, height: 26,
                        background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none',
                        borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                      title="ลบรูปภาพออก"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <div style={{
                  flexGrow: 1, minWidth: 240, border: '2px dashed var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '24px', textAlign: 'center', background: '#fafafa'
                }}>
                  <ImageIcon size={36} style={{ color: 'var(--primary)', marginBottom: 8 }} />
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                    เลือกรูปภาพประกาศสำหรับแสดงในสไลด์หน้าแรก
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                    แนะนำขนาดแนวนอน (16:9 หรือ 1200x675px) เพื่อความสวยงามสูงสุด
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files[0];
                      if (file) setAnnForm(p => ({ ...p, imageFile: file, imagePreview: URL.createObjectURL(file) }));
                    }}
                    style={{ display: 'none' }}
                    id="ann-image-file"
                  />
                  <label htmlFor="ann-image-file" className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                    📁 เลือกไฟล์รูปภาพจากเครื่อง
                  </label>
                </div>
              </div>
            </div>

            {/* Display Checkbox Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <input
                type="checkbox"
                id="annIsActive"
                checked={annForm.is_active}
                onChange={e => setAnnForm(p => ({ ...p, is_active: e.target.checked }))}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }}
              />
              <label htmlFor="annIsActive" style={{ fontSize: 14, color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
                เปิดแสดงผลบนสไลด์ภาพหน้าแรกเว็บไซต์ทันที (Active Carousel)
              </label>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-gray"
                disabled={submittingAnn}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={submittingAnn}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px' }}
              >
                <Save size={16} />
                <span>{submittingAnn ? 'กำลังบันทึก...' : (editingAnnId ? 'บันทึกการแก้ไข' : 'เพิ่มประกาศสไลด์')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MAIN CONTENT CARD ── */}
      <div className="card">
        {/* Controls Header */}
        <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14, padding: '18px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="card-title" style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Megaphone size={18} color="var(--primary)" /> รายการประกาศบนสไลด์หน้าแรก
              </span>
              <span className="badge badge-purple">{filteredAnnouncements.length} รายการ</span>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', width: 260 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              <input
                type="text"
                className="input-field"
                placeholder="ค้นหาหัวข้อ, ผู้ลงประกาศ..."
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

          {/* Filter Tabs */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <button
              onClick={() => setActiveFilter('all')}
              className={`badge ${activeFilter === 'all' ? 'badge-purple' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)' }}
            >
              ทั้งหมด ({announcements.length})
            </button>
            <button
              onClick={() => setActiveFilter('active')}
              className={`badge ${activeFilter === 'active' ? 'badge-green' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Eye size={14} /> กำลังแสดงผล ({stats.activeCount})
            </button>
            <button
              onClick={() => setActiveFilter('hidden')}
              className={`badge ${activeFilter === 'hidden' ? 'badge-gray' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <EyeOff size={14} /> ซ่อนอยู่ ({stats.hiddenCount})
            </button>
          </div>
        </div>

        {/* Announcements List Container */}
        <div className="card-body">
          {loadingAnn ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, color: 'var(--primary)' }} />
              <div style={{ fontWeight: 600 }}>กำลังโหลดข้อมูลประกาศ...</div>
            </div>
          ) : filteredAnnouncements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f8fafc', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' }}>
              <Megaphone size={44} style={{ color: 'var(--text-light)', marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>ไม่พบประกาศสำคัญ</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginBottom: 16 }}>
                {search ? 'ไม่พบประกาศตามคำค้นหาดังกล่าว' : 'สามารถกดปุ่มเพิ่มประกาศใหม่เพื่อสร้างสไลด์หน้าแรกได้เลย'}
              </div>
              <button
                onClick={() => { setSearch(''); setShowFormModal(true); }}
                className="btn btn-primary btn-sm"
              >
                <Plus size={16} /> เพิ่มประกาศใหม่
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filteredAnnouncements.map((ann, idx) => {
                const isActive = ann.category === 'ประกาศ';

                return (
                  <div
                    key={ann.id}
                    className="video-card-hover"
                    style={{
                      display: 'flex',
                      gap: 16,
                      background: isActive ? 'white' : '#f8fafc',
                      border: `1px solid ${isActive ? 'var(--border)' : '#e2e8f0'}`,
                      borderRadius: 'var(--radius-lg)',
                      padding: '16px 20px',
                      alignItems: 'center',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'var(--transition-slow)',
                      opacity: isActive ? 1 : 0.75,
                      flexWrap: 'wrap'
                    }}
                  >
                    {/* Move Up/Down Controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <div style={{
                        width: 32, height: 32, background: 'var(--primary-light)',
                        color: 'var(--primary)', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 800
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveAnn(idx, 'up')}
                            title="เลื่อนขึ้น"
                            className="btn btn-gray btn-sm"
                            style={{ padding: 4 }}
                          >
                            <ArrowUp size={12} />
                          </button>
                        )}
                        {idx < announcements.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveAnn(idx, 'down')}
                            title="เลื่อนลง"
                            className="btn btn-gray btn-sm"
                            style={{ padding: 4 }}
                          >
                            <ArrowDown size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Announcement Image Preview */}
                    {ann.image_url && (
                      <div style={{ width: 120, height: 72, borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#0f172a', flexShrink: 0, border: '1px solid var(--border-light)' }}>
                        <img
                          src={transformGoogleDriveUrl(ann.image_url)}
                          alt="announcement"
                          referrerPolicy="no-referrer"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    )}

                    {/* Announcement Info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.4 }}>
                        {ann.headline || '(ไม่มีหัวข้อ)'}
                      </h4>
                      
                      {ann.detail && ann.detail !== '-' && (
                        <div style={{ fontSize: 12.5, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                          <LinkIcon size={13} />
                          <a href={ann.detail} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                            {ann.detail.slice(0, 50)}...
                          </a>
                        </div>
                      )}

                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={12} /> {new Date(ann.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                        <span>โดย: {ann.submitter || 'แอดมิน'}</span>
                      </div>
                    </div>

                    {/* Status & Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 'auto' }}>
                      <button
                        onClick={() => handleToggleActive(ann)}
                        className={`badge ${isActive ? 'badge-green' : 'badge-gray'}`}
                        style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        {isActive ? <Eye size={13} /> : <EyeOff size={13} />}
                        {isActive ? 'แสดงอยู่' : 'ซ่อนอยู่'}
                      </button>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => handleEditAnn(ann)}
                          className="btn btn-warning btn-sm"
                          style={{ fontSize: 11.5, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Edit2 size={12} /> แก้ไข
                        </button>
                        <button
                          onClick={() => handleDeleteAnn(ann.id)}
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: 11.5, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Trash2 size={12} /> ลบ
                        </button>
                      </div>
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
