import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { uploadFileToDrive, transformGoogleDriveUrl } from '../lib/googleDriveUpload';
import { Megaphone, Save, Trash2, Edit2, X, Plus } from 'lucide-react';

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnn, setLoadingAnn] = useState(false);
  const [submittingAnn, setSubmittingAnn] = useState(false);
  const [annForm, setAnnForm] = useState({ title: '', imagePreview: null, imageFile: null, link_url: '', is_active: true });
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
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
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
        const fileName = `announcement_${Date.now()}_${annForm.imageFile.name}`;
        const result = await uploadFileToDrive(base64, fileName, 'pr');
        if (!result?.url) throw new Error('อัปโหลดรูปภาพไม่สำเร็จ');
        finalImageUrl = result.url;
      }

      const data = {
        headline: annForm.title.trim() || null,
        image_url: finalImageUrl,
        detail: annForm.link_url.trim() || null,
        category: annForm.is_active ? 'ประกาศ' : 'ประกาศ_ซ่อน',
        submitter: user?.nickname || user?.name || 'แอดมิน',
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

      setAnnForm({ title: '', imagePreview: null, imageFile: null, link_url: '', is_active: true });
      setEditingAnnId(null);
      loadAnnouncements();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmittingAnn(false);
    }
  };

  const handleDeleteAnn = async (id) => {
    if (!confirm('ลบประกาศนี้?')) return;
    const { error } = await supabase.from('web_news').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleActive = async (ann) => {
    const newStatus = ann.category === 'ประกาศ' ? 'ประกาศ_ซ่อน' : 'ประกาศ';
    const { error } = await supabase.from('web_news').update({ category: newStatus }).eq('id', ann.id);
    if (error) { alert('เกิดข้อผิดพลาด'); return; }
    loadAnnouncements();
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Megaphone size={24} /> จัดการประกาศสำคัญ
        </div>
        <div className="page-subtitle">แสดงบนภาพสไลด์หน้าแรก (Carousel)</div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">{editingAnnId ? '✏️ แก้ไขประกาศ' : '➕ เพิ่มประกาศใหม่'}</span>
          {editingAnnId && (
            <button
              style={{ fontSize: 12, padding: '4px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => { setEditingAnnId(null); setAnnForm({ title: '', imagePreview: null, imageFile: null, link_url: '', is_active: true }); }}
            >
              <X size={14} /> ยกเลิกการแก้ไข
            </button>
          )}
        </div>
        <form onSubmit={handleSubmitAnn} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>หัวข้อประกาศ (ไม่บังคับ)</label>
              <input
                type="text"
                className="form-ctrl"
                placeholder="เช่น กำหนดการสอบ, แจ้งหยุดเรียน"
                value={annForm.title}
                onChange={e => setAnnForm(p => ({ ...p, title: e.target.value }))}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ลิงก์เพิ่มเติม (ถ้ามี)</label>
              <input
                type="url"
                className="form-ctrl"
                placeholder="https://..."
                value={annForm.link_url}
                onChange={e => setAnnForm(p => ({ ...p, link_url: e.target.value }))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              รูปภาพประกาศ {!editingAnnId && <span style={{ color: '#ef4444' }}>*</span>}
            </label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {annForm.imagePreview && (
                <div style={{ position: 'relative' }}>
                  <img
                    src={annForm.imageFile ? annForm.imagePreview : transformGoogleDriveUrl(annForm.imagePreview)}
                    alt="preview"
                    style={{ width: 240, height: 130, objectFit: 'contain', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb' }}
                  />
                  <button
                    type="button"
                    onClick={() => setAnnForm(p => ({ ...p, imagePreview: null, imageFile: null }))}
                    style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  ><X size={14} /></button>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: '#f3f4f6', border: '1px dashed #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#4b5563', transition: 'all 0.2s' }}>
                📁 เลือกรูปภาพจากเครื่อง
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file) setAnnForm(p => ({ ...p, imageFile: file, imagePreview: URL.createObjectURL(file) }));
                  }}
                />
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="annIsActive"
              checked={annForm.is_active}
              onChange={e => setAnnForm(p => ({ ...p, is_active: e.target.checked }))}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <label htmlFor="annIsActive" style={{ fontSize: 14, color: '#374151', cursor: 'pointer', fontWeight: 500 }}>เปิดแสดงผลบนหน้าเว็บไซต์</label>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submittingAnn}
            style={{ alignSelf: 'flex-start', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14, opacity: submittingAnn ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}
          >
            {submittingAnn ? <span className="spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%' }} /> : (editingAnnId ? <Save size={16} /> : <Plus size={16} />)}
            {submittingAnn ? 'กำลังบันทึก...' : editingAnnId ? 'บันทึกการแก้ไข' : 'เพิ่มประกาศ'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 ประกาศทั้งหมด ({announcements.length} รายการ)</span>
        </div>
        <div style={{ padding: '20px' }}>
          {loadingAnn ? (
            <div style={{ color: 'var(--gray-500)', fontSize: 14, textAlign: 'center', padding: 20 }}>กำลังโหลด...</div>
          ) : announcements.length === 0 ? (
            <div style={{ color: 'var(--gray-500)', fontSize: 14, textAlign: 'center', padding: 40, background: '#f9fafb', borderRadius: 8, border: '1px dashed #d1d5db' }}>
              ยังไม่มีประกาศ กรุณาเพิ่มที่ฟอร์มด้านบน
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {announcements.map((ann, idx) => {
                const isActive = ann.category === 'ประกาศ';
                return (
                  <div key={ann.id} style={{ display: 'flex', gap: 16, background: isActive ? '#f0fdf4' : '#f9fafb', border: `1px solid ${isActive ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 12, padding: 16, alignItems: 'center' }}>
                    <div style={{ width: 32, height: 32, background: '#e5e7eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#4b5563', flexShrink: 0 }}>
                      {idx + 1}
                    </div>
                    {ann.image_url && (
                      <img
                        src={transformGoogleDriveUrl(ann.image_url)}
                        alt="announcement"
                        style={{ width: 100, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', flexShrink: 0 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{ann.headline || '(ไม่มีหัวข้อ)'}</div>
                      {ann.detail && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>🔗 <a href={ann.detail} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{ann.detail}</a></div>}
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>เพิ่มโดย {ann.submitter || '-'} เมื่อ {new Date(ann.created_at).toLocaleDateString('th-TH')}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
                      <button
                        onClick={() => handleToggleActive(ann)}
                        style={{ padding: '6px 14px', background: isActive ? '#dcfce7' : '#f3f4f6', color: isActive ? '#16a34a' : '#6b7280', border: `1px solid ${isActive ? '#bbf7d0' : '#d1d5db'}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, minWidth: 100, justifyContent: 'center' }}
                      >
                        {isActive ? '✅ แสดงอยู่' : '⬜ ซ่อนอยู่'}
                      </button>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleEditAnn(ann)} style={{ padding: '6px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Edit2 size={12} /> แก้ไข
                        </button>
                        <button onClick={() => handleDeleteAnn(ann.id)} style={{ padding: '6px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
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
