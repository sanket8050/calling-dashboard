import { useState, useEffect } from 'react';
import type { Contact } from '../types';
import {
  saveToken, loadToken, saveGistId, loadGistId, clearSyncSettings,
  createGist, updateGist, fetchGist, verifyToken,
} from '../services/syncService';
import { doImport } from '../services/dataStore';

interface CloudSyncPanelProps {
  contacts: Contact[];
  onImport: (contacts: Contact[]) => void;
  onToast: (msg: string) => void;
}

type SyncStatus = 'idle' | 'loading' | 'success' | 'error';

export function CloudSyncPanel({ contacts, onImport, onToast }: CloudSyncPanelProps) {
  // Persisted settings
  const [token, setToken] = useState('');
  const [gistId, setGistId] = useState('');
  const [githubUser, setGithubUser] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Pull code (for any device)
  const [pullCode, setPullCode] = useState('');

  // UI state
  const [pushStatus, setPushStatus] = useState<SyncStatus>('idle');
  const [pullStatus, setPullStatus] = useState<SyncStatus>('idle');
  const [connectStatus, setConnectStatus] = useState<SyncStatus>('idle');
  const [pushMsg, setPushMsg] = useState('');
  const [pullMsg, setPullMsg] = useState('');
  const [connectMsg, setConnectMsg] = useState('');

  // Load saved settings on mount
  useEffect(() => {
    const savedToken = loadToken();
    const savedGistId = loadGistId();
    if (savedToken) setToken(savedToken);
    if (savedGistId) setGistId(savedGistId);
  }, []);

  // ── Connect / verify token ────────────────────────────────────
  async function handleConnect() {
    if (!token.trim()) {
      setConnectMsg('Please enter your GitHub token.');
      setConnectStatus('error');
      return;
    }
    setConnectStatus('loading');
    setConnectMsg('Verifying token…');
    try {
      const user = await verifyToken(token.trim());
      setGithubUser(user);
      saveToken(token.trim());
      setConnectStatus('success');
      setConnectMsg(`✅ Connected as @${user}`);
    } catch (e: unknown) {
      setConnectStatus('error');
      setConnectMsg(e instanceof Error ? e.message : 'Connection failed');
      setGithubUser('');
    }
  }

  // ── Push contacts to Gist ─────────────────────────────────────
  async function handlePush() {
    if (!token) {
      setPushMsg('Connect your GitHub token first.');
      setPushStatus('error');
      return;
    }
    if (contacts.length === 0) {
      setPushMsg('No contacts to upload.');
      setPushStatus('error');
      return;
    }
    setPushStatus('loading');
    setPushMsg(`Uploading ${contacts.length} contacts…`);
    try {
      let id = gistId;
      if (!id) {
        // Create new Gist
        id = await createGist(token, contacts);
        setGistId(id);
        saveGistId(id);
      } else {
        // Update existing
        await updateGist(token, id, contacts);
      }
      setPushStatus('success');
      setPushMsg(`✅ ${contacts.length} contacts uploaded! Sync Code: ${id}`);
      onToast('Contacts uploaded to cloud ✅');
    } catch (e: unknown) {
      setPushStatus('error');
      setPushMsg(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  // ── Pull contacts from Gist ───────────────────────────────────
  async function handlePull() {
    const code = (pullCode || gistId).trim();
    if (!code) {
      setPullMsg('Enter the Sync Code to load contacts.');
      setPullStatus('error');
      return;
    }
    setPullStatus('loading');
    setPullMsg('Loading contacts from cloud…');
    try {
      const incoming = await fetchGist(code, token || undefined);
      const result = doImport(contacts, incoming);
      onImport(result.contacts);
      setPullStatus('success');
      setPullMsg(`✅ Loaded ${result.contacts.length} contacts (${result.added} new, ${result.duplicates} merged)`);
      if (!gistId) { setGistId(code); saveGistId(code); }
      onToast(`Contacts loaded from cloud ✅`);
    } catch (e: unknown) {
      setPullStatus('error');
      setPullMsg(e instanceof Error ? e.message : 'Load failed');
    }
  }

  function handleDisconnect() {
    clearSyncSettings();
    setToken('');
    setGistId('');
    setGithubUser('');
    setPullCode('');
    setPushStatus('idle');
    setPullStatus('idle');
    setConnectStatus('idle');
    setPushMsg('');
    setPullMsg('');
    setConnectMsg('');
    onToast('Cloud sync disconnected');
  }

  const isConnected = connectStatus === 'success' || (!!token && !!githubUser);

  return (
    <div style={{
      background: 'white',
      border: '1.5px solid var(--primary)',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(37,99,235,0.08)',
      marginBottom: '1.5rem',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
      }}>
        <span style={{ fontSize: '1.5rem' }}>☁️</span>
        <div>
          <div style={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>Cloud Sync</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem' }}>
            Upload once — access on any device. Powered by GitHub Gist (free).
          </div>
        </div>
        {isConnected && (
          <span style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.2)',
            color: 'white',
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}>
            🟢 Connected {githubUser ? `@${githubUser}` : ''}
          </span>
        )}
      </div>

      <div style={{ padding: '1.5rem' }}>

        {/* ── SECTION 1: Load from cloud (anyone) ─────────────── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontWeight: 700, fontSize: '0.95rem', color: 'var(--gray-800)',
            marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            📲 Load Contacts on This Device
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>
            Enter the Sync Code shared by the owner to instantly load all contacts.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              style={{ flex: 1, minWidth: '200px', fontFamily: 'monospace', fontSize: '0.9rem' }}
              placeholder="Paste Sync Code here…"
              value={pullCode || gistId}
              onChange={(e) => setPullCode(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handlePull}
              disabled={pullStatus === 'loading'}
              style={{ whiteSpace: 'nowrap' }}
            >
              {pullStatus === 'loading' ? '⏳ Loading…' : '📥 Load Contacts'}
            </button>
          </div>
          {pullMsg && (
            <div className={`alert ${pullStatus === 'error' ? 'alert-danger' : 'alert-success'}`}
              style={{ marginTop: '0.75rem', marginBottom: 0 }}>
              {pullMsg}
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--gray-200)', margin: '1.25rem 0' }} />

        {/* ── SECTION 2: Owner upload ─────────────────────────── */}
        <div>
          <div style={{
            fontWeight: 700, fontSize: '0.95rem', color: 'var(--gray-800)',
            marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            🔑 Owner: Upload Contacts to Cloud
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>
            Paste your GitHub token (needs <code style={{ background: 'var(--gray-100)', padding: '0 4px', borderRadius: 4 }}>gist</code> scope).
            Token is saved only in this browser.{' '}
            <a
              href="https://github.com/settings/tokens/new?scopes=gist&description=CallingTaskManager"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--primary)', fontWeight: 600 }}
            >
              Create token ↗
            </a>
          </div>

          {/* Token row */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
              <input
                className="form-input"
                type={showToken ? 'text' : 'password'}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={(e) => { setToken(e.target.value); setConnectStatus('idle'); setConnectMsg(''); setGithubUser(''); }}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem', paddingRight: '2.5rem' }}
              />
              <button
                onClick={() => setShowToken(!showToken)}
                style={{
                  position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--gray-400)',
                }}
              >{showToken ? '🙈' : '👁'}</button>
            </div>
            <button
              className={`btn ${isConnected ? 'btn-success' : 'btn-outline'}`}
              onClick={handleConnect}
              disabled={connectStatus === 'loading'}
              style={{ whiteSpace: 'nowrap' }}
            >
              {connectStatus === 'loading' ? '⏳…' : isConnected ? '✅ Connected' : 'Verify Token'}
            </button>
          </div>

          {connectMsg && (
            <div className={`alert ${connectStatus === 'error' ? 'alert-danger' : 'alert-success'}`}
              style={{ marginBottom: '0.75rem' }}>
              {connectMsg}
            </div>
          )}

          {/* Upload button */}
          <button
            className="btn btn-primary btn-block"
            onClick={handlePush}
            disabled={pushStatus === 'loading' || contacts.length === 0}
            style={{ marginBottom: '0.75rem' }}
          >
            {pushStatus === 'loading'
              ? '⏳ Uploading…'
              : gistId
                ? `☁️ Sync ${contacts.length} Contacts to Cloud`
                : `☁️ Upload ${contacts.length} Contacts to Cloud`}
          </button>

          {pushMsg && (
            <div className={`alert ${pushStatus === 'error' ? 'alert-danger' : 'alert-success'}`}
              style={{ marginBottom: '0.75rem' }}>
              {pushMsg}
            </div>
          )}

          {/* Show sync code if we have a gist */}
          {gistId && (
            <div style={{
              background: 'var(--primary-light)',
              border: '1.5px solid var(--primary)',
              borderRadius: '10px',
              padding: '1rem',
              marginBottom: '0.75rem',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                🔗 Your Sync Code
              </div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                background: 'white',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--gray-200)',
                wordBreak: 'break-all',
                marginBottom: '0.5rem',
              }}>
                {gistId}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                📱 Share this code with any device. On the phone, paste it in the <strong>"Load Contacts"</strong> box above and tap Load.
              </div>
            </div>
          )}

          {/* Disconnect */}
          {(token || gistId) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleDisconnect}
              style={{ color: 'var(--danger)' }}
            >
              🗑 Disconnect Cloud Sync
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
