'use client';

const paths = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  search: 'm21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5-1.7.7a7.8 7.8 0 0 1-.6 1.4l.7 1.7-1.8 1.8-1.7-.7a7.8 7.8 0 0 1-1.4.6L13 19.2h-2l-.7-1.7a7.8 7.8 0 0 1-1.4-.6l-1.7.7-1.8-1.8.7-1.7a7.8 7.8 0 0 1-.6-1.4L3.8 12v-2l1.7-.7a7.8 7.8 0 0 1 .6-1.4l-.7-1.7L7.2 4.4l1.7.7a7.8 7.8 0 0 1 1.4-.6L11 2.8h2l.7 1.7a7.8 7.8 0 0 1 1.4.6l1.7-.7 1.8 1.8-.7 1.7c.2.4.4.9.6 1.4l1.7.7v2Z',
  mic: 'M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0m6 6v3m-4 0h8',
  camera: 'M15 10h3l3-2v8l-3-2h-3v-4ZM3 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z',
  monitor: 'M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm8 15v3m-4 0h8',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6.2 6.2l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  chevron: 'm9 18 6-6-6-6',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm6-3a4 4 0 0 1 0 8m0 0h2a4 4 0 0 1 4 4v1',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-8 2 2 4-4',
  chat: 'M21 11.5a8.4 8.4 0 0 1-9 8.5 9.2 9.2 0 0 1-4-.9L3 21l1.9-4A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z',
  sun: 'M12 3V1m0 22v-2m9-9h2M1 12h2m16.4-6.4 1.4-1.4M4.2 19.8l1.4-1.4m0-12.8L4.2 4.2m15.6 15.6-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  logout: 'M10 17l5-5-5-5m5 5H3m13-9h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3',
  copy: 'M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm-2 8H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2',
  check: 'm5 12 4 4L19 6',
  warning: 'm10.3 3.3-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.7-2.7l-8-14a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01',
  eye: 'M2.1 12s3.2-5.5 9.9-5.5 9.9 5.5 9.9 5.5-3.2 5.5-9.9 5.5S2.1 12 2.1 12Zm9.9 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  eyeOff: 'm3 3 18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.9 5.5C10.6 5.3 11.3 5.2 12 5.2c6.7 0 9.9 6.8 9.9 6.8a18.4 18.4 0 0 1-3.2 4.1M6.6 6.7C3.6 8.2 2.1 12 2.1 12s3.2 6.8 9.9 6.8c1.2 0 2.3-.2 3.3-.6',
  wifi: 'M2 8.5a16 16 0 0 1 20 0M5 12.5a11 11 0 0 1 14 0M8.5 16.5a6 6 0 0 1 7 0M12 20h.01',
  maximize: 'M8 3H3v5m13-5h5v5M21 16v5h-5M8 21H3v-5',
};

export function Icon({ name, size = 18, strokeWidth = 1.9, className = '' }) {
  const d = paths[name];
  if (!d) return <span className={className} aria-hidden="true" />;
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export function Avatar({ name = 'CPX', size = 'md', status = 'online' }) {
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C';
  return <div className={`avatar avatar-${size}`} title={name}><span>{initials}</span>{status && <i className={`status-dot status-${status}`} />}</div>;
}
export function Badge({ children, tone = 'neutral' }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function Spinner({ label = 'Carregando...' }) { return <span className="spinner-wrap"><span className="spinner" />{label && <span>{label}</span>}</span>; }
export function Modal({ open, title, children, onClose, width = 520 }) { if (!open) return null; return <div className="modal-backdrop" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}><div className="modal" style={{ maxWidth: width }}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button></div><div className="modal-body">{children}</div></div></div>; }
export function ToastStack({ toasts = [], onDismiss }) { return <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.type || 'info'}`}><div className="toast-icon"><Icon name={toast.type === 'error' ? 'warning' : toast.type === 'success' ? 'check' : 'bell'} size={17} /></div><div className="toast-copy"><strong>{toast.title || (toast.type === 'error' ? 'Atenção' : 'CPX')}</strong><span>{toast.message}</span></div><button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Fechar"><Icon name="close" size={15} /></button></div>)}</div>; }
export function EmptyState({ icon = 'chat', title, description, action }) { return <div className="empty-state"><div className="empty-icon"><Icon name={icon} size={28} /></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>; }
