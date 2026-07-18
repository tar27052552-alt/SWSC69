import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { Camera, Trash2, Edit2, X, Plus, Save, ExternalLink } from 'lucide-react';
import { uploadFileToDrive } from '../lib/googleDriveUpload';

export default function ManageVideosPage() {
  const { user } = useAuth();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', video_url: '', description: '' });
  const [editingId, setEditingId] = useState(null);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('web_videos')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setVideos(data || []);
    } catch (err) {
      console.error('Failed to load videos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVideos();
  }, []);

  const getYouTubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const getThumbnailUrl = (url) => {
    const ytId = getYouTubeId(url);
    if (ytId) {
      return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    }
    return ''; // Return empty so it falls back to a placeholder
  };

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Size limit warning
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      alert('ไฟล์วิดีโอมีขนาดใหญ่เกิน 50MB ครับ เนื่องจากข้อจำกัดของการอัปโหลดผ่าน Apps Script แนะนำให้อัปโหลดเข้า Google Drive โดยตรง แล้วก๊อปปี้ลิงก์ที่แชร์มาวางในช่องลิงก์ด้านบนแทนครับ');
      e.target.value = '';
      return;
    }

    setSubmitting(true);
    try {
      const base64 = await toBase64(file);
      const fileExt = file.name.split('.').pop();
      const cleanTitle = (form.title.trim() || 'activity-video').replace(/[\/\\?%*:|"<>]/g, '-');
      const fileName = `${Date.now()}-${cleanTitle}.${fileExt}`;
      
      alert('ระบบกำลังทำการอัปโหลดวิดีโอไปยัง Google Drive ของสภา... ขั้นตอนนี้อาจใช้เวลา 1-3 นาทีขึ้นอยู่กับขนาดไฟล์และเน็ต ห้ามปิดหรือกดยกเลิกหน้านี้ครับ');
      const result = await uploadFileToDrive(base64, fileName, 'obec');
      
      if (!result?.url) throw new Error('อัปโหลดวิดีโอขึ้น Google Drive ไม่สำเร็จ');
      
      setForm(prev => ({ ...prev, video_url: result.url }));
      alert('อัปโหลดวิดีโอขึ้น Google Drive สำเร็จ! ลิงก์ถูกกรอกให้โดยอัตโนมัติแล้วครับ');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('กรุณากรอกหัวข้อวิดีโอด้วยครับ');
      return;
    }
    if (!form.video_url.trim()) {
      alert('กรุณากรอกลิงก์วิดีโอ (YouTube/Facebook) ด้วยครับ');
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        title: form.title.trim(),
        video_url: form.video_url.trim(),
        description: form.description.trim(),
      };

      if (editingId) {
        const { error } = await supabase
          .from('web_videos')
          .update(data)
          .eq('id', editingId);
        if (error) throw error;
        alert('แก้ไขวิดีโอสำเร็จ!');
      } else {
        const { error } = await supabase
          .from('web_videos')
          .insert([data]);
        if (error) throw error;
        alert('เพิ่มวิดีโอสำเร็จ!');
      }

      setForm({ title: '', video_url: '', description: '' });
      setEditingId(null);
      loadVideos();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('ลบวิดีโอนี้ออกจากหน้าเว็บ?')) return;
    try {
      const { error } = await supabase
        .from('web_videos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      alert('ลบวิดีโอสำเร็จ!');
      loadVideos();
    } catch (err) {
      alert('ลบไม่สำเร็จ: ' + err.message);
    }
  };

  const handleEdit = (video) => {
    setEditingId(video.id);
    setForm({
      title: video.title || '',
      video_url: video.video_url || '',
      description: video.description || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Camera size={24} /> จัดการวิดีโอกิจกรรม
        </div>
        <div className="page-subtitle">จัดการวิดีโอ YouTube หรือ Facebook เพื่อแสดงในหน้า "วิดีโอกิจกรรม" ของเว็บไซต์</div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">{editingId ? '✏️ แก้ไขวิดีโอ' : '➕ เพิ่มวิดีโอใหม่'}</span>
          {editingId && (
            <button
              style={{ fontSize: 12, padding: '4px 12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => { setEditingId(null); setForm({ title: '', video_url: '', description: '' }); }}
            >
              <X size={14} /> ยกเลิกการแก้ไข
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>หัวข้อวิดีโอ <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="text"
                className="form-ctrl"
                placeholder="เช่น วิดีโอสรุปกิจกรรมค่ายสภา, วันสถาปนาโรงเรียน"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ลิงก์วิดีโอ (YouTube หรือ Facebook) <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="url"
                className="form-ctrl"
                placeholder="เช่น https://www.youtube.com/watch?v=... หรือ https://youtu.be/..."
                value={form.video_url}
                onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                required
              />
              <span style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, display: 'block' }}>
                รองรับลิงก์วิดีโอ YouTube ทั่วไป, ลิงก์ย่อ (youtu.be), และลิงก์จากหน้า Facebook Watch
              </span>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                หรือ อัปโหลดไฟล์วิดีโอเข้า Google Drive โดยตรง
              </label>
              <input
                type="file"
                accept="video/*"
                className="form-ctrl"
                onChange={handleVideoUpload}
                disabled={submitting}
              />
              <span style={{ fontSize: 11, color: '#ef4444', marginTop: 4, display: 'block', fontWeight: 500 }}>
                ⚠️ ข้อจำกัด: ขนาดไฟล์ต้องไม่เกิน 50MB (หากใหญ่กว่านี้ แนะนำให้อัปโหลดเข้า Google Drive โดยตรงแล้วนำลิงก์แชร์มาวางในช่องลิงก์วิดีโอด้านบนแทน)
              </span>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>คำอธิบายเพิ่มเติม (ไม่บังคับ)</label>
              <textarea
                className="form-ctrl"
                style={{ minHeight: 80 }}
                placeholder="รายละเอียดสั้นๆ เกี่ยวกับวิดีโอนี้..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              type="submit"
              disabled={submitting}
              className="btn-download-pdf"
              style={{ border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '14px', background: 'linear-gradient(135deg, var(--purple-600), var(--purple-700))' }}
            >
              <Save size={16} /> {submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">🎥 รายการวิดีโอที่แสดงในระบบ ({videos.length})</span>
        </div>
        <div style={{ padding: 20 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>กำลังโหลดข้อมูล...</div>
          ) : videos.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0' }}>ยังไม่มีวิดีโอในขณะนี้</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {videos.map((vid) => {
                const thumb = getThumbnailUrl(vid.video_url);
                return (
                  <div key={vid.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#fff' }}>
                    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000' }}>
                      {thumb ? (
                        <img src={thumb} alt={vid.title} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', background: '#f3f4f6', fontSize: 13, flexDirection: 'column', gap: 6 }}>
                          <span>🎥 Facebook/Other Video</span>
                          <span style={{ fontSize: 11, opacity: 0.7 }}>ไม่มีรูปภาพหน้าปกอัตโนมัติ</span>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: 14, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                      <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: '#1f2937', lineHeight: 1.4 }}>{vid.title}</h4>
                      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b7280', flexGrow: 1, lineHeight: 1.5 }}>
                        {vid.description || 'ไม่มีคำอธิบายเพิ่มเติม'}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: 10, marginTop: 'auto' }}>
                        <a
                          href={vid.video_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--purple-600)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          <ExternalLink size={12} /> ดูลิงก์วิดีโอ
                        </a>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleEdit(vid)}
                            style={{ padding: '4px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Edit2 size={10} /> แก้ไข
                          </button>
                          <button
                            onClick={() => handleDelete(vid.id)}
                            style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Trash2 size={10} /> ลบ
                          </button>
                        </div>
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
