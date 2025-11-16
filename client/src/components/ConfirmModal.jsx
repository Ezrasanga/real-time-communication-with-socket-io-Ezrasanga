import React from 'react';

export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(2,6,23,0.5)', zIndex: 2000
    }}>
      <div style={{ width: 420, background: 'var(--card)', borderRadius: 12, padding: 18, boxShadow: '0 12px 40px rgba(2,6,23,0.28)' }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{title}</div>
        <div style={{ color: 'var(--muted)', marginBottom: 16 }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}