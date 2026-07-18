import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { MessageSquare, Trash2, Calendar, User, Tag, Edit2, X, Check } from 'lucide-react';

export default function SuggestionsPage() {
  const { user, isAdmin } = useAuth();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', type: '', message: '' });

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('suggestions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSuggestions(data || []);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuggestions();
  }, []);

  const handleDelete = async (id) => {
    if (!isAdmin) {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบข้อเสนอแนะได้ครับ');
      return;
    }
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบข้อเสนอแนะนี้?')) return;
    try {
      const { error } = await supabase
        .from('suggestions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      alert('ลบข้อเสนอแนะเรียบร้อยแล้ว!');
      loadSuggestions();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    }
  };

  const handleStartEdit = (sug) => {
    if (!isAdmin) {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถแก้ไขข้อเสนอแนะได้ครับ');
      return;
    }
    setEditingId(sug.id);
    setEditForm({
      name: sug.name || '',
      type: sug.type || 'ทั่วไป',
      message: sug.message || ''
    });
  };

  const handleSaveEdit = async (id) => {
    if (!isAdmin) return;
    try {
      const { error } = await supabase
        .from('suggestions')
        .update({
          name: editForm.name,
          type: editForm.type,
          message: editForm.message
        })
        .eq('id', id);
      if (error) throw error;
      alert('แก้ไขข้อมูลสำเร็จ!');
      setEditingId(null);
      loadSuggestions();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการแก้ไข: ' + err.message);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' น.';
  };

  const getCategoryIcon = (type) => {
    switch (type) {
      case 'กิจกรรม': return '🎉';
      case 'สิ่งอำนวยความสะดวก': return '🏫';
      case 'ร้องเรียน': return '📣';
      case 'ชมเชย': return '⭐';
      default: return '💬';
    }
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquare size={24} /> ข้อเสนอแนะและฟีดแบ็คจากนักเรียน
        </div>
        <div className="page-subtitle">แสดงความคิดเห็นและข้อเสนอแนะที่ส่งเข้ามาจากหน้าเว็บไซต์หลัก</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className="loader" style={{ display: 'inline-block' }}>กำลังโหลดข้อมูล...</div>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--gray-500)' }}>
          <MessageSquare size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h3>ยังไม่มีข้อเสนอแนะส่งเข้ามาในขณะนี้</h3>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {suggestions.map((sug) => {
            const isEditing = editingId === sug.id;
            return (
              <div key={sug.id} className="card" style={{ borderLeft: '4px solid var(--purple-500)' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '18px' }}>{getCategoryIcon(sug.type)}</span>
                    {isEditing ? (
                      <select
                        className="form-ctrl"
                        style={{ padding: '4px 8px', fontSize: '13px', width: 'auto' }}
                        value={editForm.type}
                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                      >
                        <option value="ทั่วไป">💬 ทั่วไป / อื่นๆ</option>
                        <option value="กิจกรรม">🎉 กิจกรรม</option>
                        <option value="สิ่งอำนวยความสะดวก">🏫 สิ่งอำนวยความสะดวก</option>
                        <option value="ร้องเรียน">📣 ร้องเรียน</option>
                        <option value="ชมเชย">⭐ ชมเชย</option>
                      </select>
                    ) : (
                      <span className="badge" style={{ background: 'var(--purple-50)', color: 'var(--purple-700)', fontWeight: 600, padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                        {sug.type || 'ทั่วไป'}
                      </span>
                    )}
                    
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '13px', color: 'var(--gray-500)', marginLeft: 8 }}>
                      <Calendar size={14} /> {formatDate(sug.created_at)}
                    </span>
                  </div>

                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(sug.id)}
                            style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <Check size={14} /> บันทึก
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            style={{ padding: '6px 12px', background: 'var(--gray-200)', color: 'var(--gray-700)', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <X size={14} /> ยกเลิก
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartEdit(sug)}
                            style={{ padding: '6px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <Edit2 size={14} /> แก้ไข
                          </button>
                          <button
                            onClick={() => handleDelete(sug.id)}
                            style={{ padding: '6px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <Trash2 size={14} /> ลบ
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ padding: '16px 20px' }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: 600 }}>ผู้เสนอแนะ:</div>
                    {isEditing ? (
                      <input
                        type="text"
                        className="form-ctrl"
                        style={{ marginTop: 4 }}
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--gray-800)', marginTop: 2 }}>
                        <User size={14} style={{ color: 'var(--purple-500)' }} /> {sug.name || 'ไม่ระบุชื่อ'}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-400)', fontWeight: 600 }}>รายละเอียด:</div>
                    {isEditing ? (
                      <textarea
                        className="form-ctrl"
                        style={{ marginTop: 4, minHeight: '80px' }}
                        value={editForm.message}
                        onChange={(e) => setEditForm({ ...editForm, message: e.target.value })}
                      />
                    ) : (
                      <p style={{ marginTop: 4, whiteSpace: 'pre-wrap', color: 'var(--gray-700)', lineHeight: 1.6, fontSize: '14px' }}>
                        {sug.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
