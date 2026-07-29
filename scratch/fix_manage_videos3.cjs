const fs = require('fs');
let code = fs.readFileSync('src/pages/ManageVideosPage.jsx', 'utf8');

// Normalize newlines to LF for string matching
code = code.replace(/\r\n/g, '\n');

// 1. Initial state
code = code.replace(
`  const [form, setForm] = useState({ title: '', video_url: '', description: '' });`,
`  const [form, setForm] = useState({ title: '', video_url: '', cover_url: '', description: '', video_date: new Date().toISOString().split('T')[0] });`
);

// 2. handleEdit
const oldEdit = `  const handleEdit = (video) => {
    setEditingId(video.id);
    setForm({
      title: video.title || '',
      video_url: video.video_url || '',
      description: video.description || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };`;

const newEdit = `  const handleEdit = (video) => {
    setEditingId(video.id);
    const urls = (video.video_url || '').split('||');
    setForm({
      title: video.title || '',
      video_url: urls[0] || '',
      cover_url: urls[1] || '',
      description: video.description || '',
      video_date: video.created_at ? video.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };`;
code = code.replace(oldEdit, newEdit);

// 3. reset form
code = code.replace(/setForm\(\{ title: '', video_url: '', description: '' \}\);/g, `setForm({ title: '', video_url: '', cover_url: '', description: '', video_date: new Date().toISOString().split('T')[0] });`);

// 4. handleSubmit
const oldSubmit = `      const data = {
        title: form.title.trim(),
        video_url: form.video_url.trim(),
        description: form.description.trim(),
      };`;
      
const newSubmit = `      const data = {
        title: form.title.trim(),
        video_url: form.cover_url && form.cover_url.trim() ? \`\${form.video_url.trim()}||\${form.cover_url.trim()}\` : form.video_url.trim(),
        description: form.description.trim(),
      };
      if (form.video_date) {
        data.created_at = new Date(form.video_date).toISOString();
      }`;
code = code.replace(oldSubmit, newSubmit);

// 5. handleCoverUpload
const handleCoverUploadFunc = `
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
      const cleanTitle = (form.title.trim() || 'video-cover').replace(/[/\\\\?%*:|"<>]/g, '-');
      const fileName = \`\${Date.now()}-\${cleanTitle}-cover.\${fileExt}\`;
      alert('กำลังอัปโหลดรูปหน้าปก...');
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
`;
code = code.replace('const handleVideoUpload = async (e) => {', handleCoverUploadFunc + '\n  const handleVideoUpload = async (e) => {');

// 6. UI for Date
const oldTitleInput = `            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>หัวข้อวิดีโอ <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="text"
                className="form-ctrl"
                placeholder="เช่น วิดีโอสรุปกิจกรรมค่ายสภา, วันสถาปนาโรงเรียน"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>`;
const newFields = oldTitleInput + `
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>วันที่วิดีโอ/กิจกรรม <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="date"
                className="form-ctrl"
                value={form.video_date}
                onChange={(e) => setForm({ ...form, video_date: e.target.value })}
                required
              />
            </div>`;
code = code.replace(oldTitleInput, newFields);

// 7. UI for Cover
const oldDescInput = `            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>คำอธิบายเพิ่มเติม (ไม่บังคับ)</label>`;
const coverUI = `
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>รูปหน้าปกวิดีโอ (ตัวเลือก)</label>
              <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                <input
                  type="url"
                  className="form-ctrl"
                  placeholder="วางลิงก์รูปภาพ หรืออัปโหลดไฟล์ด้านล่าง..."
                  value={form.cover_url}
                  onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
                />
                <input
                  type="file"
                  accept="image/*"
                  className="form-ctrl"
                  onChange={handleCoverUpload}
                  disabled={submitting}
                />
              </div>
              <span style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, display: 'block' }}>
                * หากเป็นวิดีโอ Google Drive ควรใส่หน้าปก เพื่อไม่ให้แสดงเป็นสีดำ
              </span>
            </div>
`;
code = code.replace(oldDescInput, coverUI + '\n' + oldDescInput);

fs.writeFileSync('src/pages/ManageVideosPage.jsx', code, 'utf8');
console.log('Fixed ManageVideosPage.jsx with LF normalizer!');
