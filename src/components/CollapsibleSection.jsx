import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function CollapsibleSection({
  title,
  icon,
  badge,
  action,
  defaultOpen = true,
  children,
  style = {},
  headerStyle = {}
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20, ...style }}>
      <div 
        className="card-header" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          display: 'flex', 
          justify: 'space-between', 
          alignItems: 'center', 
          cursor: 'pointer', 
          userSelect: 'none',
          padding: '14px 20px',
          background: '#ffffff',
          borderBottom: isOpen ? '1px solid #f0f0f0' : 'none',
          transition: 'background 0.2s',
          flexWrap: 'wrap',
          gap: 10,
          ...headerStyle
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            style={{
              border: 'none',
              background: isOpen ? '#e0f7fa' : '#f1f5f9',
              color: isOpen ? '#00838f' : '#64748b',
              borderRadius: '50%',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0
            }}
            title={isOpen ? 'พับย่อส่วนนี้' : 'ขยายส่วนนี้'}
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          <span className="card-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon && <span>{icon}</span>}
            {title}
          </span>

          {badge && (
            <span className="badge badge-purple" style={{ fontSize: 11, fontWeight: 600 }}>
              {badge}
            </span>
          )}

          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: isOpen ? '#e0f7fa' : '#f1f5f9', color: isOpen ? '#00838f' : '#64748b', fontWeight: 600 }}>
            {isOpen ? 'ขยายอยู่' : 'ย่อเก็บอยู่'}
          </span>
        </div>

        {action && (
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {action}
          </div>
        )}
      </div>

      {isOpen && (
        <div style={{ padding: '0px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
