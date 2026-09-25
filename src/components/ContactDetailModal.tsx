import { useState } from 'react';
import type { Contact, ContactStatus } from '../types';
import { StatusBadge } from './StatusBadge';
import { formatDate, buildTelLink, todayStr, tomorrowStr } from '../utils';

const QUICK_STATUSES: { status: ContactStatus; emoji: string; label: string; color: string }[] = [
  { status: 'ASKED_FOR_RESUME', emoji: '📄', label: 'Asked for Resume', color: '#16a34a' },
  { status: 'INTERESTED',       emoji: '⭐', label: 'Interested',        color: '#be185d' },
  { status: 'CALLBACK',         emoji: '🔁', label: 'Call Back',         color: '#d97706' },
  { status: 'NO_ANSWER',        emoji: '📵', label: 'No Answer',         color: '#6b7280' },
  { status: 'NOT_INTERESTED',   emoji: '❌', label: 'Not Interested',    color: '#dc2626' },
  { status: 'WRONG_NUMBER',     emoji: '⚠️', label: 'Wrong Number',      color: '#991b1b' },
  { status: 'NOT_RELEVANT',     emoji: '🚫', label: 'Not Relevant',      color: '#4b5563' },
  { status: 'NEW',              emoji: '🆕', label: 'Reset to New',      color: '#2563eb' },
];

interface ContactDetailModalProps {
  contact: Contact;
  onClose: () => void;
  onUpdate?: (updated: Contact) => void;
  onFollowUpToggle?: (contact: Contact) => void;
}

type ModalTab = 'info' | 'tag';

export function ContactDetailModal({
  contact,
  onClose,
  onUpdate,
  onFollowUpToggle,
}: ContactDetailModalProps) {
  const [tab, setTab] = useState<ModalTab>('info');
  const [note, setNote] = useState(contact.notes || '');
  const [pendingStatus, setPendingStatus] = useState<ContactStatus | null>(null);
  const [callbackDate, setCallbackDate] = useState(contact.callbackDate || tomorrowStr());
  const [callbackTime, setCallbackTime] = useState(contact.callbackTime || '11:00');
  const [saved, setSaved] = useState(false);

  function applyStatus(status: ContactStatus) {
    if (!onUpdate) return;
    const now = new Date().toISOString();
    const historyEntry = { timestamp: now, status, note: note.trim() };
    const updated: Contact = {
      ...contact,
      status,
      notes: note.trim() || contact.notes,
      callbackDate: status === 'CALLBACK' ? callbackDate : contact.callbackDate,
      callbackTime: status === 'CALLBACK' ? callbackTime : contact.callbackTime,
      updatedAt: now,
      lastCalledAt: now,
      callAttempts: (contact.callAttempts || 0) + 1,
      history: [...(contact.history || []), historyEntry],
    };
    onUpdate(updated);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 900);
  }

  function handleStatusClick(status: ContactStatus) {
    if (status === 'CALLBACK') {
      setPendingStatus('CALLBACK');
    } else {
      applyStatus(status);
    }
  }

  const telLink = buildTelLink(contact.phone);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="modal-title" style={{ fontSize: '1rem' }}>{contact.company || 'Contact'}</div>
            {contact.person && (
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.1rem' }}>👤 {contact.person}</div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Phone + call row */}
        <div style={{ padding: '0.75rem 1.5rem', background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary)' }}>
            📱 {contact.phone || '—'}
          </span>
          {telLink && (
            <a href={telLink} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
              📞 Call Now
            </a>
          )}
          <StatusBadge status={contact.status} />
        </div>

        {/* Tab switcher */}
        {onUpdate && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)' }}>
            <button
              className={`btn btn-ghost ${tab === 'info' ? '' : ''}`}
              style={{
                flex: 1, borderRadius: 0, borderBottom: tab === 'info' ? '2px solid var(--primary)' : '2px solid transparent',
                color: tab === 'info' ? 'var(--primary)' : 'var(--gray-500)', fontWeight: 600, fontSize: '0.875rem',
              }}
              onClick={() => setTab('info')}
            >
              📋 Details
            </button>
            <button
              style={{
                flex: 1, borderRadius: 0, borderBottom: tab === 'tag' ? '2px solid var(--primary)' : '2px solid transparent',
                color: tab === 'tag' ? 'var(--primary)' : 'var(--gray-500)', fontWeight: 600, fontSize: '0.875rem',
                background: 'none', border: 'none', cursor: 'pointer', padding: '0.6rem',
                borderBottomWidth: '2px', borderBottomStyle: 'solid',
              }}
              onClick={() => setTab('tag')}
            >
              🏷️ Update Status
            </button>
          </div>
        )}

        <div className="modal-body" style={{ paddingTop: '1rem' }}>

          {/* ── INFO TAB ────────────────────────────────────── */}
          {tab === 'info' && (
            <>
              {contact.area && (
                <div className="detail-row">
                  <span className="detail-label">📍 Area</span>
                  <span className="detail-value">{contact.area}</span>
                </div>
              )}
              {contact.role && (
                <div className="detail-row">
                  <span className="detail-label">🎯 Role</span>
                  <span className="detail-value">{contact.role}</span>
                </div>
              )}
              {contact.source && (
                <div className="detail-row">
                  <span className="detail-label">📋 Source</span>
                  <span className="detail-value">{contact.source}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Attempts</span>
                <span className="detail-value">{contact.callAttempts || 0}</span>
              </div>
              {contact.lastCalledAt && (
                <div className="detail-row">
                  <span className="detail-label">Last Called</span>
                  <span className="detail-value">{formatDate(contact.lastCalledAt)}</span>
                </div>
              )}
              {contact.callbackDate && (
                <div className="detail-row">
                  <span className="detail-label">Callback</span>
                  <span className="detail-value">{contact.callbackDate} {contact.callbackTime}</span>
                </div>
              )}
              {contact.notes && (
                <div className="detail-row">
                  <span className="detail-label">Notes</span>
                  <span className="detail-value">{contact.notes}</span>
                </div>
              )}

              {/* History */}
              {contact.history && contact.history.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div className="card-title" style={{ marginBottom: '0.5rem' }}>📝 Call History</div>
                  {[...contact.history].reverse().map((h, i) => (
                    <div key={i} className="history-entry">
                      <span className="history-time">{formatDate(h.timestamp)}</span>
                      <div>
                        <StatusBadge status={h.status} />
                        {h.note && <div style={{ color: 'var(--gray-600)', marginTop: '0.2rem', fontSize: '0.85rem' }}>{h.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Follow-up toggle */}
              {onFollowUpToggle && (contact.status === 'ASKED_FOR_RESUME' || contact.status === 'INTERESTED' || contact.status === 'CALLBACK') && (
                <div style={{ marginTop: '1.25rem' }}>
                  <button
                    className={`btn ${contact.followUpDone ? 'btn-outline' : 'btn-success'} btn-block`}
                    onClick={() => onFollowUpToggle(contact)}
                  >
                    {contact.followUpDone ? '↩️ Mark Follow-up Pending' : '✅ Mark Follow-up Done'}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── TAG TAB ─────────────────────────────────────── */}
          {tab === 'tag' && !onUpdate && (
            <div className="alert alert-info">Status updates are not available in view-only mode.</div>
          )}

          {tab === 'tag' && onUpdate && !pendingStatus && (
            <>
              <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '1rem' }}>
                Tap a result to instantly update this contact's status.
              </div>

              {/* Quick status grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                {QUICK_STATUSES.map(({ status, emoji, label, color }) => (
                  <button
                    key={status}
                    onClick={() => handleStatusClick(status)}
                    style={{
                      padding: '0.75rem 0.5rem',
                      borderRadius: '10px',
                      border: contact.status === status ? `2px solid ${color}` : '1.5px solid var(--gray-200)',
                      background: contact.status === status ? `${color}18` : 'white',
                      color: color,
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.25rem',
                      transition: 'all 0.15s',
                      opacity: saved ? 0.5 : 1,
                    }}
                    disabled={saved}
                  >
                    <span style={{ fontSize: '1.25rem' }}>{emoji}</span>
                    <span>{label}</span>
                    {contact.status === status && (
                      <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>← current</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Optional note */}
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <label className="form-label">Add a note (optional)</label>
                <textarea
                  className="form-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder='e.g. "Spoke to Rahul", "Send CV on WhatsApp"'
                  rows={2}
                />
              </div>

              {saved && (
                <div className="alert alert-success" style={{ textAlign: 'center', fontWeight: 700 }}>
                  ✅ Status updated!
                </div>
              )}
            </>
          )}

          {/* ── CALLBACK DATE/TIME PICKER ────────────────────── */}
          {tab === 'tag' && pendingStatus === 'CALLBACK' && (
            <>
              <div className="callback-section">
                <div className="outcome-title">📅 Callback Details</div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <div className="flex gap-2 mb-2">
                    <button
                      className={`btn btn-sm ${callbackDate === todayStr() ? 'btn-warning' : 'btn-outline'}`}
                      onClick={() => setCallbackDate(todayStr())}
                    >Today</button>
                    <button
                      className={`btn btn-sm ${callbackDate === tomorrowStr() ? 'btn-warning' : 'btn-outline'}`}
                      onClick={() => setCallbackDate(tomorrowStr())}
                    >Tomorrow</button>
                  </div>
                  <input
                    type="date"
                    className="form-input"
                    value={callbackDate}
                    min={todayStr()}
                    onChange={(e) => setCallbackDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={callbackTime}
                    onChange={(e) => setCallbackTime(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Note (optional)</label>
                  <textarea
                    className="form-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder='e.g. "Call after 5 PM"'
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="btn btn-outline flex-1" onClick={() => setPendingStatus(null)}>← Back</button>
                <button className="btn btn-warning flex-1" onClick={() => applyStatus('CALLBACK')}>
                  ✅ Save Callback
                </button>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
