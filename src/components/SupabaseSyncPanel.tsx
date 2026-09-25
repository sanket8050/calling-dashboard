import { useState, useEffect, useCallback } from 'react';
import type { Contact } from '../types';
import { pushContacts, pullContacts, getLastSyncTime } from '../services/supabaseSync';
import { doImport } from '../services/dataStore';

interface SupabaseSyncPanelProps {
  contacts: Contact[];
  onImport: (contacts: Contact[]) => void;
  onToast: (msg: string) => void;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export function SupabaseSyncPanel({ contacts, onImport, onToast }: SupabaseSyncPanelProps) {
  const [pushStatus, setPushStatus] = useState<Status>('idle');
  const [pullStatus, setPullStatus] = useState<Status>('idle');
  const [pushMsg, setPushMsg] = useState('');
  const [pullMsg, setPullMsg] = useState('');
  const [cloudTime, setCloudTime] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Check if cloud has data on mount
  const checkCloud = useCallback(async () => {
    setChecking(true);
    try {
      const t = await getLastSyncTime();
      setCloudTime(t);
    } catch {
      setCloudTime(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { checkCloud(); }, [checkCloud]);

  // ── Push ─────────────────────────────────────────────────────
  async function handlePush() {
    if (contacts.length === 0) {
      setPushMsg('No contacts to upload. Import a CSV or JSON first.');
      setPushStatus('error');
      return;
    }
    setPushStatus('loading');
    setPushMsg(`Uploading ${contacts.length} contacts…`);
    try {
      await pushContacts(contacts);
      const now = new Date().toISOString();
      setCloudTime(now);
      setPushStatus('success');
      setPushMsg(`✅ ${contacts.length} contacts synced to cloud!`);
      onToast('Contacts uploaded to cloud ✅');
    } catch (e: unknown) {
      setPushStatus('error');
      setPushMsg(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  // ── Pull ─────────────────────────────────────────────────────
  async function handlePull() {
    setPullStatus('loading');
    setPullMsg('Loading from cloud…');
    try {
      const { contacts: incoming, updatedAt } = await pullContacts();
      const result = doImport(contacts, incoming);
      onImport(result.contacts);
      setCloudTime(updatedAt);
      setPullStatus('success');
      setPullMsg(`✅ ${result.contacts.length} contacts loaded (${result.added} new, ${result.duplicates} merged)`);
      onToast('Contacts loaded from cloud ✅');
    } catch (e: unknown) {
      setPullStatus('error');
      setPullMsg(e instanceof Error ? e.message : 'Failed to load from cloud');
    }
  }

  function fmt(iso: string) {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
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
          <div style={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>
            Cloud Sync
          </div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem' }}>
            Upload once on any device — instantly available everywhere. No codes needed.
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.2)', color: 'white',
          padding: '0.3rem 0.9rem', borderRadius: '999px',
          fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          {checking ? '⏳ Checking…' : cloudTime ? `🟢 Last synced: ${fmt(cloudTime)}` : '⚪ No cloud data yet'}
        </div>
      </div>

      <div style={{ padding: '1.25rem 1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>

        {/* ── UPLOAD ─────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#065f46', marginBottom: '0.35rem' }}>
            ☁️ Upload to Cloud
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>
            Save your contacts to the cloud. Any device can then load them instantly.
          </div>
          <button
            className="btn btn-block"
            style={{
              background: '#059669', color: 'white', border: 'none',
              fontWeight: 700, borderRadius: '10px', padding: '0.75rem',
              opacity: pushStatus === 'loading' ? 0.7 : 1,
              cursor: pushStatus === 'loading' ? 'not-allowed' : 'pointer',
            }}
            onClick={handlePush}
            disabled={pushStatus === 'loading'}
          >
            {pushStatus === 'loading' ? '⏳ Uploading…' : `☁️ Sync ${contacts.length} Contacts to Cloud`}
          </button>
          {pushMsg && (
            <div
              className={`alert ${pushStatus === 'error' ? 'alert-danger' : 'alert-success'}`}
              style={{ marginTop: '0.75rem', marginBottom: 0, fontSize: '0.85rem' }}
            >
              {pushMsg}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{
          width: '1px', background: 'var(--gray-200)',
          alignSelf: 'stretch', margin: '0 0.25rem',
          display: 'none',
        }} className="divider-v" />

        {/* ── DOWNLOAD ───────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#065f46', marginBottom: '0.35rem' }}>
            📲 Load on This Device
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>
            Load the latest contacts from the cloud onto this device.
          </div>
          <button
            className="btn btn-block btn-outline"
            style={{
              borderColor: '#059669', color: '#059669', fontWeight: 700,
              borderRadius: '10px', padding: '0.75rem',
              opacity: pullStatus === 'loading' ? 0.7 : 1,
              cursor: pullStatus === 'loading' ? 'not-allowed' : 'pointer',
            }}
            onClick={handlePull}
            disabled={pullStatus === 'loading'}
          >
            {pullStatus === 'loading' ? '⏳ Loading…' : '📥 Load Contacts from Cloud'}
          </button>
          {pullMsg && (
            <div
              className={`alert ${pullStatus === 'error' ? 'alert-danger' : 'alert-success'}`}
              style={{ marginTop: '0.75rem', marginBottom: 0, fontSize: '0.85rem' }}
            >
              {pullMsg}
            </div>
          )}
        </div>
      </div>

      <div style={{
        padding: '0.6rem 1.5rem',
        background: 'rgba(16,185,129,0.06)',
        borderTop: '1px solid rgba(16,185,129,0.15)',
        fontSize: '0.78rem',
        color: '#065f46',
      }}>
        🔒 Data is stored in your private Supabase project. No passwords, no codes — just tap Load on any device.
      </div>
    </div>
  );
}
