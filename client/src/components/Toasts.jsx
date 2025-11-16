import React, { useEffect } from 'react';

export default function Toasts({ toasts = [], onDismiss }) {
  useEffect(() => {
    // auto-dismiss after 5s
    const timers = toasts.map(t =>
      setTimeout(() => {
        onDismiss(t.id);
      }, t.duration || 5000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, onDismiss]);

  if (!toasts || toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div className="toast-header">
            <strong>{t.title || 'Notification'}</strong>
            <button className="btn-ghost" onClick={() => onDismiss(t.id)}>Dismiss</button>
          </div>
          <div className="toast-body">{t.body}</div>
        </div>
      ))}
    </div>
  );
}