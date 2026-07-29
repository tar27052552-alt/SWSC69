const fs = require('fs');
let code = fs.readFileSync('src/pages/ManageVideosPage.jsx', 'utf8');

// 1. Initial State
code = code.replace(
    /const \[form, setForm\] = useState\(\{\n\s*title: '',\n\s*video_url: '',\n\s*description: ''\n\s*\}\);/,
    `const [form, setForm] = useState({
    title: '',
    video_url: '',
    cover_url: '',
    description: '',
    video_date: new Date().toISOString().split('T')[0]
  });`
);

// 2. handleEdit
code = code.replace(
    /setForm\(\{\n\s*title: video\.title \|\| '',\n\s*video_url: video\.video_url \|\| '',\n\s*description: video\.description \|\| '',\n\s*\}\);/,
    `const urls = (video.video_url || '').split('||');
    setForm({
      title: video.title || '',
      video_url: urls[0] || '',
      cover_url: urls[1] || '',
      description: video.description || '',
      video_date: video.created_at ? video.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
    });`
);

// 3. Reset states (both in cancel and successful submit)
code = code.replace(
    /setForm\(\{ title: '', video_url: '', description: '' \}\);/g,
    `setForm({ title: '', video_url: '', cover_url: '', description: '', video_date: new Date().toISOString().split('T')[0] });`
);

// 4. handleSubmit
code = code.replace(
    /const data = \{\n\s*title: form\.title\.trim\(\),\n\s*video_url: form\.video_url\.trim\(\),\n\s*description: form\.description\.trim\(\),\n\s*\};/,
    `const data = {
        title: form.title.trim(),
        video_url: form.cover_url && form.cover_url.trim() ? \`\${form.video_url.trim()}||\${form.cover_url.trim()}\` : form.video_url.trim(),
        description: form.description.trim(),
      };
      if (form.video_date) {
        data.created_at = new Date(form.video_date).toISOString();
      }`
);

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
code = code.replace(/const handleVideoUpload = async \(e\) => \{/, handleCoverUploadFunc + '\n  const handleVideoUpload = async (e) => {');

// 6. UI for Date
const newFields = `
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>วันที่วิดีโอ/กิจกรรม <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="date"
                className="form-ctrl"
                value={form.video_date}
                onChange={(e) => setForm({ ...form, video_date: e.target.value })}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ลิงก์วิดีโอ (YouTube หรือ Facebook) <span style={{ color: '#ef4444' }}>*</span></label>`;
code = code.replace(/<div>\s*<label style=\{\{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 \}\}>ลิงก์วิดีโอ \(YouTube หรือ Facebook\) <span style=\{\{ color: '#ef4444' \}\}>\*<\/span><\/label>/, newFields);

// 7. UI for Cover Image
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
code = code.replace(/<div>\s*<label style=\{\{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 \}\}>คำอธิบายเพิ่มเติม \(ไม่บังคับ\)<\/label>/, coverUI + '\n            <div>\n              <label style={{ fontSize: 13, fontWeight: 600, color: \'#374151\', display: \'block\', marginBottom: 6 }}>คำอธิบายเพิ่มเติม (ไม่บังคับ)</label>');

fs.writeFileSync('src/pages/ManageVideosPage.jsx', code, 'utf8');
console.log('Done rewriting ManageVideosPage.jsx!');
