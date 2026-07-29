const fs = require('fs');
let code = fs.readFileSync('src/pages/ManageVideosPage.jsx', 'utf8');

// 1. Update initial form state
code = code.replace(
    /const \[form, setForm\] = useState\(\{\n\s*title: '',\n\s*video_url: '',\n\s*description: ''\n\s*\}\);/,
    `const [form, setForm] = useState({
    title: '',
    video_url: '',
    description: '',
    video_date: new Date().toISOString().split('T')[0]
  });`
);

// 2. Update handleEdit
code = code.replace(
    /setForm\(\{\n\s*title: video\.title \|\| '',\n\s*video_url: video\.video_url \|\| '',\n\s*description: video\.description \|\| '',\n\s*\}\);/,
    `setForm({
      title: video.title || '',
      video_url: video.video_url || '',
      description: video.description || '',
      video_date: video.created_at ? video.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
    });`
);

// 3. Update cancel edit button
code = code.replace(
    /setForm\(\{ title: '', video_url: '', description: '' \}\);/g,
    `setForm({ title: '', video_url: '', description: '', video_date: new Date().toISOString().split('T')[0] });`
);

// 4. Update handleSubmit data object
code = code.replace(
    /const data = \{\n\s*title: form\.title\.trim\(\),\n\s*video_url: form\.video_url\.trim\(\),\n\s*description: form\.description\.trim\(\),\n\s*\};/,
    `const data = {
        title: form.title.trim(),
        video_url: form.video_url.trim(),
        description: form.description.trim(),
      };
      
      if (form.video_date) {
        // Map user selected date to created_at
        data.created_at = new Date(form.video_date).toISOString();
      }`
);

// 5. Add input field to the form UI
const dateInputStr = `            <div>
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
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>ลิงก์วิดีโอ`;

code = code.replace(
    /<div>\s*<label style=\{\{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 \}\}>ลิงก์วิดีโอ/,
    dateInputStr
);

fs.writeFileSync('src/pages/ManageVideosPage.jsx', code, 'utf8');
console.log('Successfully updated ManageVideosPage.jsx');
