import { useState } from 'react';
import type { Contact } from '../types';
import { pushContacts, getLastSyncTime } from '../services/supabaseSync';
import { useEffect } from 'react';

interface SupabaseSyncPanelProps {
  contacts: Contact[];
  onToast: (msg: string) => void;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export function SupabaseSyncPanel({ contacts, onToast }: SupabaseSyncPanelProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [msg, setMsg] = useState('');
  const [cloudTime, setCloudTime] = useState<string | null>(null);

  useEffect(() => {
    getLastSyncTime().then(setCloudTime).catch(() => setCloudTime(null));
  }, []);

  function fmt(iso: string) {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  async function handlePush() {
    if (contacts.length === 0) {
      setMsg('No contacts to upload. Import a CSV or JSON first.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setMsg('');
    try {
      await pushContacts(contacts);
      const now = new Date().toISOString();
      setCloudTime(now);
      setStatus('success');
      setMsg(`✅ ${contacts.length} contacts uploaded! Anyone who opens the app will see them instantly.`);
      onToast(`${contacts.length} contacts synced to cloud ✅`);
    } catch (e: unknown) {
      setStatus('error');
      setMsg(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  return (
    <div style={{
      background: 'white',
      border: '1.5px solid #10b981',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(16,185,129,0.10)',
      marginBottom: '1.5rem',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '1.5rem' }}>☁️</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>Cloud Sync</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem' }}>
            Upload here → everyone who opens the app sees contacts automatically. No codes, no steps.
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.2)', color: 'white',
          padding: '0.3rem 0.9rem', borderRadius: '999px',
          fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          {cloudTime ? `🟢 ${fmt(cloudTime)}` : '⚪ Not synced yet'}
        </div>
      </div>

      <div style={{ padding: '1.25rem 1.5rem' }}>
        <button
          className="btn btn-block"
          style={{
            background: status === 'loading' ? '#6b7280' : '#059669',
            color: 'white', border: 'none',
            fontWeight: 700, borderRadius: '10px', padding: '0.85rem',
            fontSize: '1rem', cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
          onClick={handlePush}
          disabled={status === 'loading'}
        >
          {status === 'loading'
            ? '⏳ Uploading to cloud…'
            : `☁️ Upload ${contacts.length} Contacts to Cloud`}
        </button>

        {msg && (
          <div
            className={`alert ${status === 'error' ? 'alert-danger' : 'alert-success'}`}
            style={{ marginTop: '0.75rem', marginBottom: 0 }}
          >
            {msg}
          </div>
        )}
      </div>

      <div style={{
        padding: '0.6rem 1.5rem',
        background: 'rgba(16,185,129,0.06)',
        borderTop: '1px solid rgba(16,185,129,0.15)',
        fontSize: '0.78rem', color: '#065f46',
      }}>
        📱 Phone just needs to open <strong>calling-dashboard-henna.vercel.app</strong> — contacts load automatically.
      </div>
    </div>
  );
}
