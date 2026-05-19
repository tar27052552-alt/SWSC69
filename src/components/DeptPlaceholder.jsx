export default function DeptPlaceholder({ deptName, emoji, description, features = [] }) {
  return (
    <div>
      <div className="page-header">
        <div className="page-title">{emoji} {deptName}</div>
        <div className="page-subtitle">{description}</div>
      </div>
      <div className="card">
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>{emoji}</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#00bcd4', marginBottom: 6 }}>{deptName}</div>
          <div style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 28, maxWidth: 400, margin: '0 auto 28px' }}>{description}</div>

          {features.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, maxWidth: 680, margin: '0 auto' }}>
              {features.map((f, i) => (
                <div key={i} style={{ padding: '14px 16px', borderRadius: 6, background: '#f5f5f5', border: '1px solid #e0e0e0', textAlign: 'left' }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{f.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: '#9e9e9e' }}>{f.desc}</div>
                  <div style={{ marginTop: 10 }}>
                    <span className="badge badge-yellow" style={{ fontSize: 10 }}>🔧 กำลังพัฒนา</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
