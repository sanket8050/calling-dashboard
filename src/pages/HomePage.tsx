import { useRef } from 'react';
import { useApp } from '../context/AppContext';
import { parseJSONImport, doImport, exportMasterJSON, exportProgressJSON } from '../services/dataStore';
import { useToast, Toast } from '../components/Toast';

export function HomePage() {
  const { state, setContacts, setMode, startCalling } = useApp();
  const { toast, showToast } = useToast();
  const jsonRef = useRef<HTMLInputElement>(null);

  const hasContacts = state.contacts.length > 0;
  const pendingCount = state.callerQueue.length;


  function handleJSONImport(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const incoming = parseJSONImport(text);

        if (state.contacts.length > 0) {
          const ok = confirm(`Merge ${incoming.length} contacts into your ${state.contacts.length} existing contacts?`);
          if (!ok) {
            const replace = confirm('Replace all local data with imported file?');
            if (!replace) return;
            setContacts(incoming);
            showToast(`Loaded ${incoming.length} contacts`);
            return;
          }
          const r = doImport(state.contacts, incoming);
          setContacts(r.contacts);
          showToast(`Merged: ${r.added} new, ${r.duplicates} duplicates`);
        } else {
          setContacts(incoming);
          showToast(`Loaded ${incoming.length} contacts`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        alert(`Import failed: ${msg}`);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="home-wrap">
      <div className="home-title">📞 Calling Task Manager</div>
      <div className="home-subtitle">Fast. Simple. No login. No database.</div>

      {/* Cloud sync loading indicator */}
      {state.syncing && (
        <div style={{
          background: 'linear-gradient(135deg, #059669, #047857)',
          color: 'white', borderRadius: '12px',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          fontSize: '0.9rem', fontWeight: 600,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          <span style={{ fontSize: '1.2rem' }}>☁️</span>
          Loading contacts from cloud…
        </div>
      )}

      {hasContacts && (
        <div className="home-info" style={{ marginBottom: '1.5rem' }}>
          <p>📊 <strong>{state.contacts.length}</strong> contacts loaded</p>
          <p>📞 <strong>{pendingCount}</strong> calls remaining</p>
          {state.lastSaved && <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem' }}>Last saved: {state.lastSaved}</p>}
        </div>
      )}


      <div className="home-actions">
        <button
          className="btn btn-primary btn-lg btn-block"
          onClick={startCalling}
          disabled={pendingCount === 0}
        >
          📞 {pendingCount === 0 ? 'No Calls Remaining' : `Start Calling (${pendingCount} pending)`}
        </button>

        <button
          className="btn btn-outline btn-lg btn-block"
          onClick={() => setMode('dashboard')}
        >
          📊 Dashboard
        </button>

        <button
          className="btn btn-outline btn-lg btn-block"
          onClick={() => setMode('import')}
        >
          📥 Import / Export
        </button>
      </div>

      {!hasContacts && (
        <div className="empty-state" style={{ padding: '1.5rem 0' }}>
          <div className="empty-icon">📂</div>
          <h3>No contacts loaded</h3>
          <p>Import a CSV or JSON file to start calling.</p>
          <div className="empty-actions">
            <button className="btn btn-outline" onClick={() => setMode('import')}>
              📋 Import CSV
            </button>
            <div>
              <input
                ref={jsonRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJSONImport(f); }}
              />
              <button className="btn btn-primary" onClick={() => jsonRef.current?.click()}>
                📦 Import JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {hasContacts && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          <div>
            <input
              ref={jsonRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJSONImport(f); }}
            />
            <button className="btn btn-outline btn-sm" onClick={() => jsonRef.current?.click()}>
              📦 Import JSON
            </button>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => { exportMasterJSON(state.contacts); showToast('Master JSON exported'); }}
          >
            💾 Export Master
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => { exportProgressJSON(state.contacts); showToast('Progress exported'); }}
          >
            📤 Export Progress
          </button>
        </div>
      )}

      <div className="safety-banner" style={{ marginTop: '2rem' }}>
        🔒 All data stays in your browser. No servers, no login required.
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
