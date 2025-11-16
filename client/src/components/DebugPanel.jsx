import React, { useState } from 'react';

export default function DebugPanel({ connected, rooms, messages, onlineUsers, notifications }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      position: 'fixed', right: 12, bottom: 12, zIndex: 2000, fontSize: 13,
      background: 'rgba(255,255,255,0.96)', border: '1px solid rgba(2,6,23,0.06)',
      padding: 10, borderRadius: 8, width: open ? 520 : 44, boxShadow: '0 8px 28px rgba(2,6,23,0.08)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:10, height:10, borderRadius:10, background: connected ? '#34d399' : '#f97316' }} />
          <strong style={{ fontSize:12 }}>{connected ? 'Online' : 'Offline'}</strong>
        </div>
        <div>
          <button className="btn-ghost small" onClick={() => setOpen(s => !s)}>{open ? 'Close' : 'Debug'}</button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 10, maxHeight: 360, overflow: 'auto' }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight:700 }}>Rooms ({(rooms || []).length})</div>
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12 }}>{JSON.stringify(rooms || [], null, 2)}</pre>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight:700 }}>OnlineUsers ({(onlineUsers || []).length})</div>
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12 }}>{JSON.stringify(onlineUsers || [], null, 2)}</pre>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight:700 }}>Messages (last 10)</div>
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12 }}>{JSON.stringify((messages || []).slice(-10), null, 2)}</pre>
          </div>

          <div>
            <div style={{ fontWeight:700 }}>Notifications</div>
            <pre style={{ whiteSpace:'pre-wrap', fontSize:12 }}>{JSON.stringify(notifications || [], null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}