import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { 
  Camera, Trash2, Edit2, X, Plus, Save, ExternalLink, 
  Search, Play, Video, HardDrive, Calendar, 
  Sparkles, RefreshCw, AlertCircle, FileVideo, Image as ImageIcon,
  CheckCircle2, Film, Globe, Eye
} from 'lucide-react';
import { uploadFileToDrive } from '../lib/googleDriveUpload';

const Youtube = ({ size = 16, color = 'currentColor', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);


export default function ManageVideosPage() {
  const { user } = useAuth();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'youtube', 'drive', 'other'
  
  // Form State
  const [showFormModal, setShowFormModal] = useState(false);
  const [inputMode, setInputMode] = useState('url'); // 'url' or 'upload'
  const [form, setForm] = useState({ 
    title: '', 
    video_url: '', 
    cover_url: '', 
    description: '', 
    video_date: new Date().toISOString().split('T')[0] 
  });
  const [editingId, setEditingId] = useState(null);

  // Video Preview Modal State
  const [previewVideo, setPreviewVideo] = useState(null);

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

  // Helper functions for YouTube & Thumbnails
  const getYouTubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const getVideoPlatform = (rawUrl) => {
    if (!rawUrl) return 'other';
    const url = rawUrl.split('||')[0];
    if (getYouTubeId(url)) return 'youtube';
    if (url.includes('drive.google.com') || url.includes('docs.google.com')) return 'drive';
    if (url.includes('facebook.com') || url.includes('fb.watch')) return 'facebook';
    return 'other';
  };

  const getThumbnailUrl = (rawUrl) => {
    if (!rawUrl) return '';
    const parts = rawUrl.split('||');
    const url = parts[0];
    const cover = parts.length > 1 ? parts[1] : null;
    
    if (cover) {
      let match = cover.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) match = cover.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `https://wsrv.nl/?url=${encodeURIComponent('https://drive.google.com/uc?export=view&id=' + match[1])}`;
      }
      return cover;
    }

    const ytId = getYouTubeId(url);
    if (ytId) {
      return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    }
    return '';
  };

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('ไฟล์รูปภาพมีขนาดใหญ่เกินไป (จำกัด 10MB)');
      e.target.value = '';
      return;
    }
    setSubmitting(true);
    try {
      const base64 = await toBase64(file);
      const fileExt = file.name.split('.').pop();
      const cleanTitle = (form.title.trim() || 'video-cover').replace(/[/\\?%*:|"<>]/g, '-');
      const fileName = `${Date.now()}-${cleanTitle}-cover.${fileExt}`;
      const result = await uploadFileToDrive(base64, fileName, 'pr');
      if (!result?.url) throw new Error('อัปโหลดรูปล้มเหลว');
      setForm(prev => ({ ...prev, cover_url: result.url }));
      alert('อัปโหลดหน้าปกสำเร็จ!');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
      e.target.value = '';
    }
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      alert('ไฟล์วิดีโอมีขนาดใหญ่เกิน 50MB ครับ เนื่องจากข้อจำกัดของการอัปโหลด แนะนำให้อัปโหลดเข้า Google Drive โดยตรง แล้วนำลิงก์ที่แชร์มาวางในช่องลิงก์แทนครับ');
      e.target.value = '';
      return;
    }

    setSubmitting(true);
    try {
      const base64 = await toBase64(file);
      const fileExt = file.name.split('.').pop();
      const cleanTitle = (form.title.trim() || 'activity-video').replace(/[\/\\?%*:|"<>]/g, '-');
      const fileName = `${Date.now()}-${cleanTitle}.${fileExt}`;
      
      const result = await uploadFileToDrive(base64, fileName, 'obec');
      if (!result?.url) throw new Error('อัปโหลดวิดีโอขึ้น Google Drive ไม่สำเร็จ');
      
      setForm(prev => ({ ...prev, video_url: result.url }));
      alert('อัปโหลดวิดีโอขึ้น Google Drive สำเร็จ!');
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
      alert('กรุณากรอกหัวข้อวิดีโอ');
      return;
    }
    if (!form.video_url.trim()) {
      alert('กรุณากรอกลิงก์วิดีโอ หรืออัปโหลดไฟล์วิดีโอ');
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        title: form.title.trim(),
        video_url: form.cover_url && form.cover_url.trim() ? `${form.video_url.trim()}||${form.cover_url.trim()}` : form.video_url.trim(),
        description: form.description.trim(),
      };
      if (form.video_date) {
        data.created_at = new Date(form.video_date).toISOString();
      }

      if (editingId) {
        const { error } = await supabase
          .from('web_videos')
          .update(data)
          .eq('id', editingId);
        if (error) throw error;
        alert('บันทึกการแก้ไขวิดีโอสำเร็จ!');
      } else {
        const { error } = await supabase
          .from('web_videos')
          .insert([data]);
        if (error) throw error;
        alert('เพิ่มวิดีโอใหม่สำเร็จ!');
      }

      resetForm();
      loadVideos();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({ title: '', video_url: '', cover_url: '', description: '', video_date: new Date().toISOString().split('T')[0] });
    setEditingId(null);
    setShowFormModal(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('ยืนยันการลบวิดีโอนี้ออกจากระบบ?')) return;
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
    const urls = (video.video_url || '').split('||');
    setForm({
      title: video.title || '',
      video_url: urls[0] || '',
      cover_url: urls[1] || '',
      description: video.description || '',
      video_date: video.created_at ? video.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
    });
    setShowFormModal(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Filtered list
  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      const matchesSearch = (v.title || '').toLowerCase().includes(search.toLowerCase()) ||
                            (v.description || '').toLowerCase().includes(search.toLowerCase());
      const platform = getVideoPlatform(v.video_url);
      if (activeTab === 'youtube') return matchesSearch && platform === 'youtube';
      if (activeTab === 'drive') return matchesSearch && platform === 'drive';
      if (activeTab === 'other') return matchesSearch && (platform === 'facebook' || platform === 'other');
      return matchesSearch;
    });
  }, [videos, search, activeTab]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = videos.length;
    const ytCount = videos.filter(v => getVideoPlatform(v.video_url) === 'youtube').length;
    const driveCount = videos.filter(v => getVideoPlatform(v.video_url) === 'drive').length;
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const thisMonthCount = videos.filter(v => (v.created_at || '').startsWith(currentMonthStr)).length;

    return { total, ytCount, driveCount, thisMonthCount };
  }, [videos]);

  // Extract clean video URL for iframe / preview
  const getEmbedUrl = (rawUrl) => {
    if (!rawUrl) return null;
    const url = rawUrl.split('||')[0];
    const ytId = getYouTubeId(url);
    if (ytId) {
      return `https://www.youtube.com/embed/${ytId}?autoplay=1`;
    }
    // Google Drive match
    let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return url;
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ── HEADER ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: 'var(--shadow-primary)'
            }}>
              <Camera size={22} />
            </div>
            <span>จัดการวิดีโอกิจกรรม</span>
          </div>
          <div className="page-subtitle">
            จัดการและเผยแพร่วิดีโอ YouTube, Facebook และ Google Drive สำหรับแสดงในเว็บไซต์สภานักเรียน
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              if (showFormModal && !editingId) {
                setShowFormModal(false);
              } else {
                setEditingId(null);
                setForm({ title: '', video_url: '', cover_url: '', description: '', video_date: new Date().toISOString().split('T')[0] });
                setShowFormModal(true);
              }
            }}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {showFormModal && !editingId ? <X size={18} /> : <Plus size={18} />}
            <span>{showFormModal && !editingId ? 'ปิดฟอร์ม' : 'เพิ่มวิดีโอใหม่'}</span>
          </button>
        </div>
      </div>

      {/* ── STATS CARDS ── */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#e0e7ff', color: 'var(--primary)' }}>
            <Film size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">วิดีโอทั้งหมด</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#fef2f2', color: '#ef4444' }}>
            <Youtube size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.ytCount}</div>
            <div className="stat-label">วิดีโอ YouTube</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#eff6ff', color: '#3b82f6' }}>
            <HardDrive size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.driveCount}</div>
            <div className="stat-label">วิดีโอ Google Drive</div>
          </div>
        </div>

        <div className="stat-box">
          <div className="stat-icon-box" style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <Sparkles size={22} />
          </div>
          <div>
            <div className="stat-value">{stats.thisMonthCount}</div>
            <div className="stat-label">อัปโหลดเดือนนี้</div>
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
                  {editingId ? 'แก้ไขข้อมูลวิดีโอ' : 'เพิ่มวิดีโอกิจกรรมใหม่'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  กรอกข้อมูลวิดีโอ ลิงก์สื่อ หรืออัปโหลดไฟล์ตรงเข้าสู่ระบบ
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
            {/* Input Mode Toggle */}
            <div style={{ display: 'flex', gap: 8, background: '#f1f5f9', padding: 4, borderRadius: 'var(--radius-md)', width: 'fit-content' }}>
              <button
                type="button"
                onClick={() => setInputMode('url')}
                style={{
                  padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'var(--transition)',
                  background: inputMode === 'url' ? 'white' : 'transparent',
                  color: inputMode === 'url' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: inputMode === 'url' ? 'var(--shadow-sm)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <Globe size={15} /> ใช้งานลิงก์วิดีโอ (YouTube / FB / Drive)
              </button>
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                style={{
                  padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'var(--transition)',
                  background: inputMode === 'upload' ? 'white' : 'transparent',
                  color: inputMode === 'upload' ? 'var(--primary)' : 'var(--text-muted)',
                  boxShadow: inputMode === 'upload' ? 'var(--shadow-sm)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <FileVideo size={15} /> อัปโหลดไฟล์วิดีโอตรง ( Google Drive )
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
              {/* Title */}
              <div>
                <label className="form-label">
                  หัวข้อวิดีโอ <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น สรุปกิจกรรมค่ายสภาประจำปี 2569"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              {/* Date */}
              <div>
                <label className="form-label">
                  วันที่จัดกิจกรรม/วิดีโอ <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="date"
                  className="input-field"
                  value={form.video_date}
                  onChange={(e) => setForm({ ...form, video_date: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Video Input Mode Details */}
            {inputMode === 'url' ? (
              <div>
                <label className="form-label">
                  ลิงก์วิดีโอ (YouTube, Facebook หรือ Google Drive) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="url"
                  className="input-field"
                  placeholder="วาง URL เช่น https://www.youtube.com/watch?v=... หรือ https://youtu.be/..."
                  value={form.video_url}
                  onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                  required={inputMode === 'url'}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={13} color="var(--success)" />
                  รองรับลิงก์ YouTube (ปกติ & Shorts), Facebook Watch และ Google Drive Public Link
                </div>
              </div>
            ) : (
              <div style={{
                border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)',
                padding: '20px', textAlign: 'center', background: '#fafafa'
              }}>
                <FileVideo size={36} style={{ color: 'var(--primary)', marginBottom: 8 }} />
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                  เลือกไฟล์วิดีโอเพื่ออัปโหลดไปยัง Google Drive
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                  ขนาดไฟล์ไม่เกิน 50MB ระบบจะอัปโหลดและกรอกลิงก์ให้อัตโนมัติ
                </div>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoUpload}
                  disabled={submitting}
                  style={{ display: 'none' }}
                  id="video-upload-file"
                />
                <label htmlFor="video-upload-file" className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }}>
                  <FileVideo size={16} /> เลือกไฟล์วิดีโอจากเครื่อง
                </label>
                {form.video_url && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <CheckCircle2 size={14} /> อัปโหลดแล้ว: {form.video_url.slice(0, 50)}...
                  </div>
                )}
              </div>
            )}

            {/* Cover Image Section */}
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ImageIcon size={15} /> รูปหน้าปกวิดีโอ (ตัวเลือกเสริม)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'center' }}>
                <input
                  type="url"
                  className="input-field"
                  placeholder="วาง URL รูปภาพหน้าปก..."
                  value={form.cover_url}
                  onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>หรือ</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    disabled={submitting}
                    style={{ display: 'none' }}
                    id="cover-upload-file"
                  />
                  <label htmlFor="cover-upload-file" className="btn btn-gray btn-sm" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <ImageIcon size={14} /> อัปโหลดรูปปก
                  </label>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 6 }}>
                * สำหรับวิดีโอจาก Google Drive ควรใส่รูปหน้าปก เพื่อไม่ให้แสดงเป็นสีดำ
              </div>
            </div>

            {/* Live Thumbnail Preview Box */}
            {(getThumbnailUrl(form.cover_url || form.video_url)) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 12, borderRadius: 'var(--radius-md)' }}>
                <div style={{ width: 100, height: 56, borderRadius: 8, overflow: 'hidden', flexShrink: 0, position: 'relative', background: '#000' }}>
                  <img src={getThumbnailUrl(form.cover_url || form.video_url)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#166534' }}>
                    ตัวอย่างรูปหน้าปก (Live Preview)
                  </div>
                  <div style={{ fontSize: 11.5, color: '#15803d' }}>
                    ระบบตรวจพบพรีวิวรูปภาพแล้ว
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <label className="form-label">คำอธิบายเพิ่มเติม (ไม่บังคับ)</label>
              <textarea
                className="input-field"
                style={{ minHeight: 80, resize: 'vertical' }}
                placeholder="สรุปสั้นๆ เกี่ยวกับวิดีโอหรือบรรยากาศกิจกรรม..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
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
                <span>{submitting ? 'กำลังบันทึก...' : (editingId ? 'บันทึกการแก้ไข' : 'บันทึกวิดีโอ')}</span>
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
                <Video size={18} color="var(--primary)" /> รายการวิดีโอกิจกรรมทั้งหมด
              </span>
              <span className="badge badge-purple">{filteredVideos.length} รายการ</span>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', width: 260 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
              <input
                type="text"
                className="input-field"
                placeholder="ค้นหาชื่อ หรือรายละเอียด..."
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
              onClick={() => setActiveTab('all')}
              className={`badge ${activeTab === 'all' ? 'badge-purple' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)' }}
            >
              ทั้งหมด ({videos.length})
            </button>
            <button
              onClick={() => setActiveTab('youtube')}
              className={`badge ${activeTab === 'youtube' ? 'badge-red' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Youtube size={14} /> YouTube ({stats.ytCount})
            </button>
            <button
              onClick={() => setActiveTab('drive')}
              className={`badge ${activeTab === 'drive' ? 'badge-blue' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <HardDrive size={14} /> Google Drive ({stats.driveCount})
            </button>
            <button
              onClick={() => setActiveTab('other')}
              className={`badge ${activeTab === 'other' ? 'badge-cyan' : 'badge-gray'}`}
              style={{ cursor: 'pointer', padding: '6px 14px', fontSize: 12.5, transition: 'var(--transition)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Globe size={14} /> Facebook / อื่นๆ ({stats.total - stats.ytCount - stats.driveCount})
            </button>
          </div>
        </div>

        {/* Video Grid */}
        <div className="card-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, color: 'var(--primary)' }} />
              <div style={{ fontWeight: 600 }}>กำลังโหลดข้อมูลวิดีโอ...</div>
            </div>
          ) : filteredVideos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f8fafc', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border)' }}>
              <Film size={44} style={{ color: 'var(--text-light)', marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>ไม่พบวิดีโอกิจกรรม</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginBottom: 16 }}>
                {search ? 'ลองค้นหาด้วยคำค้นอื่น หรือสลับแถบตัวกรอง' : 'เริ่มต้นเพิ่มวิดีโอกิจกรรมแรกของคุณได้เลย'}
              </div>
              <button
                onClick={() => { setSearch(''); setShowFormModal(true); }}
                className="btn btn-primary btn-sm"
              >
                <Plus size={16} /> เพิ่มวิดีโอใหม่
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
              gap: 22
            }}>
              {filteredVideos.map((vid) => {
                const thumb = getThumbnailUrl(vid.video_url);
                const platform = getVideoPlatform(vid.video_url);
                const embedUrl = getEmbedUrl(vid.video_url);

                return (
                  <div
                    key={vid.id}
                    style={{
                      background: 'white',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'var(--transition-slow)',
                      position: 'relative'
                    }}
                    className="video-card-hover"
                  >
                    {/* Thumbnail & Play Overlay */}
                    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#0f172a', overflow: 'hidden' }}>
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={vid.title}
                          style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            objectFit: 'cover', transition: 'transform 0.4s ease'
                          }}
                        />
                      ) : (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          color: '#94a3b8', background: 'linear-gradient(135deg, #1e293b, #0f172a)', gap: 8
                        }}>
                          <Film size={32} />
                          <span style={{ fontSize: 12, fontWeight: 500 }}>ไม่มีรูปภาพหน้าปก</span>
                        </div>
                      )}

                      {/* Platform Badge Overlay */}
                      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>
                        {platform === 'youtube' && (
                          <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                            <Youtube size={12} /> YouTube
                          </span>
                        )}
                        {platform === 'drive' && (
                          <span className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                            <HardDrive size={12} /> Google Drive
                          </span>
                        )}
                        {platform === 'facebook' && (
                          <span className="badge badge-cyan" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                            <Globe size={12} /> Facebook
                          </span>
                        )}
                        {platform === 'other' && (
                          <span className="badge badge-gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
                            <Video size={12} /> วิดีโอทั่วไป
                          </span>
                        )}
                      </div>

                      {/* Play Button Overlay */}
                      <button
                        onClick={() => setPreviewVideo({ title: vid.title, embedUrl, rawUrl: vid.video_url })}
                        style={{
                          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                          width: 48, height: 48, borderRadius: '50%', background: 'rgba(99,102,241,0.9)',
                          color: 'white', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                          transition: 'var(--transition)',
                          zIndex: 2
                        }}
                        title="เล่นวิดีโอตัวอย่าง"
                      >
                        <Play size={22} style={{ marginLeft: 3 }} />
                      </button>
                    </div>

                    {/* Card Content */}
                    <div style={{ padding: '16px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                      {/* Date Badge */}
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                        <Calendar size={13} color="var(--primary)" />
                        {vid.created_at ? new Date(vid.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'ไม่ระบุวันที่'}
                      </div>

                      {/* Title */}
                      <h3 style={{
                        fontSize: 14.5, fontWeight: 700, color: 'var(--text)',
                        lineHeight: 1.4, margin: '0 0 8px',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                      }}>
                        {vid.title}
                      </h3>

                      {/* Description */}
                      <p style={{
                        fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 16px',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        flexGrow: 1
                      }}>
                        {vid.description || 'ไม่มีคำอธิบายเพิ่มเติม'}
                      </p>

                      {/* Footer Action Buttons */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        paddingTop: 12, borderTop: '1px solid var(--border-light)', marginTop: 'auto'
                      }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setPreviewVideo({ title: vid.title, embedUrl, rawUrl: vid.video_url })}
                            className="btn btn-gray btn-sm"
                            style={{ fontSize: 11.5, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Eye size={13} /> ดูวิดีโอ
                          </button>
                          <a
                            href={vid.video_url.split('||')[0]}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-gray btn-sm"
                            style={{ fontSize: 11.5, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                            title="เปิดในแท็บใหม่"
                          >
                            <ExternalLink size={13} /> ลิงก์
                          </a>
                        </div>

                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => handleEdit(vid)}
                            className="btn btn-warning btn-sm"
                            style={{ fontSize: 11.5, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Edit2 size={12} /> แก้ไข
                          </button>
                          <button
                            onClick={() => handleDelete(vid.id)}
                            className="btn btn-danger btn-sm"
                            style={{ fontSize: 11.5, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Trash2 size={12} /> ลบ
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

      {/* ── VIDEO PLAYER PREVIEW MODAL ── */}
      {previewVideo && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: 'var(--radius-xl)',
            width: '100%', maxWidth: 840, overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)', animation: 'scaleUp 0.2s ease'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px', background: '#0f172a', color: 'white',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Video size={18} color="var(--accent)" />
                <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 650 }}>
                  {previewVideo.title}
                </div>
              </div>
              <button
                onClick={() => setPreviewVideo(null)}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Video Container */}
            <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000' }}>
              {previewVideo.embedUrl ? (
                <iframe
                  src={previewVideo.embedUrl}
                  title={previewVideo.title}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', gap: 12 }}>
                  <AlertCircle size={40} />
                  <div>ไม่สามารถฝังตัวอย่างวิดีโอนี้ในหน้านี้ได้</div>
                  <a
                    href={previewVideo.rawUrl?.split('||')[0]}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary btn-sm"
                  >
                    <ExternalLink size={14} /> เปิดดูวิดีโอบนเว็บบอร์ดภายนอก
                  </a>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <a
                href={previewVideo.rawUrl?.split('||')[0]}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
              >
                <ExternalLink size={14} /> เปิดลิงก์วิดีโอต้นทาง
              </a>
              <button
                onClick={() => setPreviewVideo(null)}
                className="btn btn-gray btn-sm"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
