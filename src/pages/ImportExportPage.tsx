import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  parseJSONImport,
  previewCSVImport,
  doImport,
  exportMasterJSON,
  exportProgressJSON,
  exportCSV,
} from '../services/dataStore';
import type { CSVPreview, Contact } from '../types';
import { useToast, Toast } from '../components/Toast';
import { CloudSyncPanel } from '../components/CloudSyncPanel';

type ImportStep = 'idle' | 'preview' | 'importing' | 'result' | 'merge-confirm';

interface ImportResultState {
  added: number;
  duplicates: number;
  invalid: number;
  invalidReasons: string[];
}

interface PendingMerge {
  type: 'json';
  incoming: Contact[];
  mode?: 'merge' | 'replace';
}

export function ImportExportPage() {
  const { state, setContacts } = useApp();
  const { toast, showToast } = useToast();

  // CSV import state
  const [csvPreview, setCSVPreview] = useState<CSVPreview | null>(null);
  const [csvSourceName, setCSVSourceName] = useState('');
  const [step, setStep] = useState<ImportStep>('idle');
  const [result, setResult] = useState<ImportResultState | null>(null);

  // JSON merge confirm
  const [pendingMerge, setPendingMerge] = useState<PendingMerge | null>(null);

  const csvRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  // ── CSV ──────────────────────────────────────────────────────

  function handleCSVFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const preview = previewCSVImport(text, state.contacts, file.name, csvSourceName || file.name.replace(/\.[^.]+$/, ''));
      setCSVPreview(preview);
      setStep('preview');
    };
    reader.readAsText(file);
  }

  function confirmCSVImport() {
    if (!csvPreview) return;
    const r = doImport(state.contacts, csvPreview.contacts);
    setContacts(r.contacts);
    setResult({ added: r.added, duplicates: r.duplicates, invalid: csvPreview.invalidCount, invalidReasons: csvPreview.invalidReasons });
    setStep('result');
  }

  // ── JSON ─────────────────────────────────────────────────────

  function handleJSONFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const incoming = parseJSONImport(text);
        if (state.contacts.length > 0) {
          setPendingMerge({ type: 'json', incoming });
          setStep('merge-confirm');
        } else {
          applyJSONImport(incoming);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        alert(`Import failed: ${msg}`);
      }
    };
    reader.readAsText(file);
  }

  function applyJSONImport(incoming: Contact[], mode: 'merge' | 'replace' = 'merge') {
    if (mode === 'replace') {
      setContacts(incoming);
      setResult({ added: incoming.length, duplicates: 0, invalid: 0, invalidReasons: [] });
    } else {
      const r = doImport(state.contacts, incoming);
      setContacts(r.contacts);
      setResult({ added: r.added, duplicates: r.duplicates, invalid: 0, invalidReasons: [] });
    }
    setPendingMerge(null);
    setStep('result');
  }


  function handleClearAll() {
    const first = confirm('⚠️ Are you sure? This will remove ALL locally stored contacts.\n\nExport your data first to avoid losing it.');
    if (!first) return;
    const second = confirm('⚠️ FINAL CONFIRMATION: Delete all contacts? This cannot be undone.');
    if (!second) return;
    setContacts([]);
    showToast('All data cleared');
  }

  // ── Drag and drop ─────────────────────────────────────────────
  function handleDrop(e: React.DragEvent, type: 'csv' | 'json') {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (type === 'csv') handleCSVFile(file);
    else handleJSONFile(file);
  }

  return (
    <div className="page-content">
      <div className="section-title">📥 Import &amp; Export</div>

      {/* ── Cloud Sync ──────────────────────────────────────── */}
      <CloudSyncPanel
        contacts={state.contacts}
        onImport={setContacts}
        onToast={showToast}
      />

      {state.contacts.length > 0 && (
        <div className="safety-banner">
          ⚠️ <strong>Data Safety:</strong> Your data is stored only in this browser.
          Export a JSON backup regularly to avoid losing your work.
          &nbsp;<strong>{state.contacts.length} contacts stored locally.</strong>
          {state.lastSaved && ` Last saved: ${state.lastSaved}`}
        </div>
      )}

      {/* Merge confirm modal */}
      {step === 'merge-confirm' && pendingMerge && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Existing Data Found</div>
            </div>
            <div className="modal-body">
              <div className="alert alert-info">
                <p><strong>You have {state.contacts.length} contacts locally.</strong></p>
                <p style={{ marginTop: '0.5rem' }}>
                  Importing this file will merge {pendingMerge.incoming.length} contacts.
                  Existing calling progress will be preserved.
                </p>
              </div>
            </div>
            <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={() => { setPendingMerge(null); setStep('idle'); }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => applyJSONImport(pendingMerge.incoming, 'replace')}>
                Replace All
              </button>
              <button className="btn btn-primary" onClick={() => applyJSONImport(pendingMerge.incoming, 'merge')}>
                ✅ Merge (Safe)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Preview modal */}
      {step === 'preview' && csvPreview && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Import Preview</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep('idle')}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-gray mb-3">File: <strong>{csvPreview.filename}</strong></p>
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="stat-value">{csvPreview.totalRows}</div>
                  <div className="stat-label">Total Rows</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: 'var(--success)' }}>{csvPreview.newCount}</div>
                  <div className="stat-label">New</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>{csvPreview.duplicateCount}</div>
                  <div className="stat-label">Duplicates</div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Source / List Name (optional)</label>
                <input
                  className="form-input"
                  value={csvSourceName}
                  onChange={(e) => setCSVSourceName(e.target.value)}
                  placeholder="e.g. September Hadapsar List"
                />
              </div>
              {csvPreview.invalidCount > 0 && (
                <div className="alert alert-warning">
                  <strong>{csvPreview.invalidCount} invalid rows</strong> will be skipped:
                  <ul style={{ marginTop: '0.4rem', paddingLeft: '1.25rem' }}>
                    {csvPreview.invalidReasons.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setStep('idle')}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmCSVImport} disabled={csvPreview.newCount === 0 && csvPreview.duplicateCount === 0}>
                Import {csvPreview.newCount} New Contacts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result modal */}
      {step === 'result' && result && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">✅ Import Complete</div>
            </div>
            <div className="modal-body">
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: 'var(--success)' }}>{result.added}</div>
                  <div className="stat-label">New Added</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>{result.duplicates}</div>
                  <div className="stat-label">Duplicates</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: 'var(--danger)' }}>{result.invalid}</div>
                  <div className="stat-label">Invalid</div>
                </div>
              </div>
              {result.invalidReasons.length > 0 && (
                <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                  {result.invalidReasons.slice(0, 5).map((r, i) => <div key={i}>{r}</div>)}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setStep('idle')}>Done</button>
            </div>
          </div>
        </div>
      )}

      <div className="ie-grid">
        {/* CSV Import */}
        <div className="ie-card">
          <h3>📋 Import CSV</h3>
          <p>Import contacts from a CSV file. Duplicates are detected automatically.</p>
          <div
            className="file-drop"
            onDrop={(e) => handleDrop(e, 'csv')}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => e.target.files?.[0] && handleCSVFile(e.target.files[0])}
            />
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
            <div>Drop CSV here or click to browse</div>
          </div>
        </div>

        {/* JSON Import */}
        <div className="ie-card">
          <h3>📦 Import JSON</h3>
          <p>Import a master or progress JSON file from this app.</p>
          <div
            className="file-drop"
            onDrop={(e) => handleDrop(e, 'json')}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              ref={jsonRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => e.target.files?.[0] && handleJSONFile(e.target.files[0])}
            />
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📦</div>
            <div>Drop JSON here or click to browse</div>
          </div>
        </div>

        {/* Export JSON */}
        <div className="ie-card">
          <h3>💾 Export Master JSON</h3>
          <p>Download the complete dataset as JSON. Use this to back up data or share with the caller.</p>
          <button
            className="btn btn-primary btn-block"
            disabled={state.contacts.length === 0}
            onClick={() => { exportMasterJSON(state.contacts); showToast('Master JSON exported'); }}
          >
            Export Master JSON ({state.contacts.length} contacts)
          </button>
        </div>

        {/* Export Progress JSON */}
        <div className="ie-card">
          <h3>📤 Export Progress JSON</h3>
          <p>Export current progress JSON to share back with the owner after calling.</p>
          <button
            className="btn btn-success btn-block"
            disabled={state.contacts.length === 0}
            onClick={() => { exportProgressJSON(state.contacts); showToast('Progress JSON exported'); }}
          >
            Export Progress JSON
          </button>
        </div>

        {/* Export CSV */}
        <div className="ie-card">
          <h3>📊 Export CSV</h3>
          <p>Export all contacts as a CSV spreadsheet including all fields and statuses.</p>
          <button
            className="btn btn-outline btn-block"
            disabled={state.contacts.length === 0}
            onClick={() => { exportCSV(state.contacts); showToast('CSV exported'); }}
          >
            Export CSV
          </button>
        </div>

        {/* Danger zone */}
        <div className="ie-card">
          <h3 style={{ color: 'var(--danger)' }}>🗑️ Clear All Data</h3>
          <p style={{ color: 'var(--gray-500)', marginBottom: '0.75rem' }}>
            Removes all locally stored contacts from this browser. Export a backup first!
          </p>
          <button
            className="btn btn-danger btn-block"
            disabled={state.contacts.length === 0}
            onClick={handleClearAll}
          >
            Clear All Data
          </button>
        </div>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  );
}
