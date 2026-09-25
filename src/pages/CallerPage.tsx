import { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Contact, ContactStatus } from '../types';
import { buildTelLink, copyToClipboard, todayStr, tomorrowStr } from '../utils';
import { useToast, Toast } from '../components/Toast';
import { exportProgressJSON } from '../services/dataStore';

const OUTCOMES: { status: ContactStatus; label: string; emoji: string }[] = [
  { status: 'ASKED_FOR_RESUME', label: 'Asked for Resume', emoji: '📄' },
  { status: 'INTERESTED', label: 'Interested', emoji: '⭐' },
  { status: 'CALLBACK', label: 'Call Back', emoji: '🔁' },
  { status: 'NO_ANSWER', label: 'No Answer', emoji: '📵' },
  { status: 'NOT_INTERESTED', label: 'Not Interested', emoji: '❌' },
  { status: 'WRONG_NUMBER', label: 'Wrong Number', emoji: '⚠️' },
  { status: 'NOT_RELEVANT', label: 'Not Relevant', emoji: '🚫' },
];



export function CallerPage() {
  const {
    state, currentCallerContact, remainingCount,
    updateContact, nextCaller, skipCaller, setCallerIndex, setMode,
  } = useApp();

  const { toast, showToast } = useToast();

  const [selectedStatus, setSelectedStatus] = useState<ContactStatus | null>(null);
  const [note, setNote] = useState('');
  const [callbackDate, setCallbackDate] = useState(tomorrowStr());
  const [callbackTime, setCallbackTime] = useState('11:00');
  const [showList, setShowList] = useState(false);
  const [done, setDone] = useState(false);

  const contact = currentCallerContact;
  const callerIndex = state.callerIndex;
  const queue = state.callerQueue;
  const totalQ = queue.length;
  const completed = totalQ - remainingCount;
  const progressPct = totalQ > 0 ? Math.round((completed / totalQ) * 100) : 0;

  function handleSelectStatus(s: ContactStatus) {
    setSelectedStatus(s);
    if (s !== 'CALLBACK') {
      // auto-save immediately for non-callback statuses
      saveAndNext(s);
    }
  }

  function saveAndNext(statusOverride?: ContactStatus) {
    if (!contact) return;
    const finalStatus = statusOverride ?? selectedStatus;
    if (!finalStatus) return;

    const now = new Date().toISOString();
    const historyEntry = {
      timestamp: now,
      status: finalStatus,
      note: note.trim(),
    };

    const updated: Contact = {
      ...contact,
      status: finalStatus,
      notes: note.trim() || contact.notes,
      callbackDate: finalStatus === 'CALLBACK' ? callbackDate : contact.callbackDate,
      callbackTime: finalStatus === 'CALLBACK' ? callbackTime : contact.callbackTime,
      updatedAt: now,
      lastCalledAt: now,
      callAttempts: (contact.callAttempts || 0) + 1,
      history: [...(contact.history || []), historyEntry],
    };

    updateContact(updated);
    setSelectedStatus(null);
    setNote('');
    setCallbackDate(tomorrowStr());
    setCallbackTime('11:00');

    // Move to next
    if (callerIndex + 1 >= queue.length) {
      setDone(true);
    } else {
      nextCaller();
    }
  }

  async function handleCopy() {
    if (!contact) return;
    const ok = await copyToClipboard(contact.phone);
    showToast(ok ? '✓ Number copied' : 'Copy failed — please copy manually');
  }

  function handleSkip() {
    skipCaller();
    setSelectedStatus(null);
    setNote('');
  }

  // Session complete
  if (done || (queue.length > 0 && callerIndex >= queue.length)) {
    const sessionStats = queue.reduce((acc, c) => {
      const current = state.contacts.find((x) => x.id === c.id);
      if (current) acc[current.status] = (acc[current.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return (
      <div className="completion-wrap">
        <div className="completion-icon">🎉</div>
        <div className="completion-title">Session Complete!</div>
        <div className="completion-sub">{totalQ} contacts processed this session</div>
        <div className="completion-stats">
          {Object.entries(sessionStats).map(([s, n]) => (
            <div key={s} className="flex justify-between" style={{ padding: '0.3rem 0', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--gray-600)' }}>{s.replace(/_/g, ' ')}</span>
              <strong>{n}</strong>
            </div>
          ))}
        </div>
        <button
          className="btn btn-success btn-lg btn-block mb-3"
          onClick={() => { exportProgressJSON(state.contacts); showToast('Progress exported!'); }}
        >
          📤 Export Progress JSON
        </button>
        <button
          className="btn btn-outline btn-block"
          onClick={() => { setDone(false); setMode('home'); }}
        >
          ← Back to Home
        </button>
        {toast && <Toast message={toast} />}
      </div>
    );
  }

  // Empty queue
  if (!contact) {
    return (
      <div className="caller-wrap">
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <h3>Nothing to call</h3>
          <p>All contacts are resolved, or no contacts are loaded.</p>
          <div className="empty-actions">
            <button className="btn btn-outline" onClick={() => setMode('home')}>← Home</button>
          </div>
        </div>
      </div>
    );
  }

  const telLink = buildTelLink(contact.phone);

  return (
    <div className="caller-wrap">
      {/* Progress */}
      <div className="caller-progress-bar">
        <div className="caller-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="caller-header">
        <h2>Calling</h2>
        <div className="caller-remaining">{remainingCount} remaining</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--gray-500)', marginTop: '0.2rem' }}>
          {completed} of {totalQ} done
        </div>
      </div>

      {/* Toggle list view */}
      <div className="flex justify-between items-center mb-3">
        <button
          className={`filter-chip ${showList ? 'active' : ''}`}
          onClick={() => setShowList(!showList)}
          style={{ fontSize: '0.8rem' }}
        >
          {showList ? '▲ Hide List' : '▼ View All Tasks'}
        </button>
        <div style={{ fontSize: '0.8rem', color: 'var(--gray-400)' }}>
          #{callerIndex + 1} of {totalQ}
        </div>
      </div>

      {/* Optional list view */}
      {showList && (
        <div className="card mb-3" style={{ maxHeight: '280px', overflowY: 'auto' }}>
          {queue.map((c, i) => (
            <div
              key={c.id}
              className={`caller-list-item${i === callerIndex ? ' ' : ''}`}
              style={i === callerIndex ? { background: 'var(--primary-light)' } : {}}
              onClick={() => { setCallerIndex(i); setShowList(false); setSelectedStatus(null); setNote(''); }}
            >
              <span className="cli-num">{i + 1}</span>
              <div className="cli-info">
                <div className="cli-company">{c.company}</div>
                <div className="cli-phone">{c.phone}</div>
              </div>
              {i === callerIndex && <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>▶ NOW</span>}
            </div>
          ))}
        </div>
      )}

      {/* Contact card */}
      <div className="contact-card-caller">
        <div className="contact-company">{contact.company || 'Unknown Company'}</div>
        {contact.person && (
          <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)', marginBottom: '0.25rem' }}>👤 {contact.person}</div>
        )}
        <div className="contact-meta">
          {contact.area && <span className="contact-meta-item">📍 {contact.area}</span>}
          {contact.role && <span className="contact-meta-item">🎯 {contact.role}</span>}
          {contact.callAttempts > 0 && (
            <span className="contact-meta-item" style={{ color: 'var(--warning)' }}>
              🔄 Attempt #{contact.callAttempts + 1}
            </span>
          )}
        </div>

        <div className="phone-display">📱 {contact.phone}</div>

        <div className="call-actions">
          {telLink ? (
            <a href={telLink} className="btn btn-primary btn-lg">
              📞 CALL
            </a>
          ) : (
            <button className="btn btn-primary btn-lg" disabled>📞 CALL</button>
          )}
          <button className="btn btn-outline btn-lg" onClick={handleCopy}>
            📋 COPY
          </button>
        </div>

        {contact.notes && (
          <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--warning-light)', borderRadius: '8px', fontSize: '0.85rem', color: '#78350f' }}>
            📝 Previous note: {contact.notes}
          </div>
        )}
      </div>

      {/* Outcome */}
      {selectedStatus !== 'CALLBACK' && (
        <div className="outcome-section">
          <div className="outcome-title">What Happened?</div>
          <div className="outcome-grid">
            {OUTCOMES.map(({ status, label, emoji }) => (
              <button
                key={status}
                className={`outcome-btn outcome-${status}${selectedStatus === status ? ' selected' : ''}`}
                onClick={() => handleSelectStatus(status)}
              >
                <span className="emoji">{emoji}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Callback form */}
      {selectedStatus === 'CALLBACK' && (
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
          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <textarea
              className="form-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. HR available after 11 AM"
              rows={2}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline flex-1" onClick={() => setSelectedStatus(null)}>← Back</button>
            <button className="btn btn-warning flex-1" onClick={() => saveAndNext()}>✅ Save Callback</button>
          </div>
        </div>
      )}

      {/* Note */}
      {selectedStatus !== 'CALLBACK' && (
        <div className="note-section">
          <label className="form-label">Optional Note</label>
          <textarea
            className="form-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='e.g. "Spoke to Rahul", "Send CV on WhatsApp"'
            rows={2}
          />
        </div>
      )}

      {/* Footer actions */}
      <div className="caller-actions">
        <button className="btn btn-outline flex-1" onClick={handleSkip}>
          ⏭ Skip
        </button>
        <button
          className="btn btn-primary flex-1"
          disabled={!selectedStatus || selectedStatus === 'CALLBACK'}
          onClick={() => saveAndNext()}
        >
          Save &amp; Next →
        </button>
      </div>

      {/* Export while calling */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => { exportProgressJSON(state.contacts); showToast('Progress saved!'); }}
        >
          📤 Export Progress Now
        </button>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
