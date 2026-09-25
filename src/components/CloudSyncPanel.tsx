import { useState, useEffect } from 'react';
import type { Contact } from '../types';
import {
  saveToken, loadToken,
  saveGistId, loadGistId,
  saveGithubUser, loadGithubUser,
  clearSyncSettings,
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
  const [token, setToken] = useState('');
  const [gistId, setGistId] = useState('');
  const [githubUser, setGithubUser] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [pullCode, setPullCode] = useState('');

  const [pushStatus, setPushStatus] = useState<SyncStatus>('idle');
  const [pullStatus, setPullStatus] = useState<SyncStatus>('idle');
  const [connectStatus, setConnectStatus] = useState<SyncStatus>('idle');
  const [pushMsg, setPushMsg] = useState('');
  const [pullMsg, setPullMsg] = useState('');
  const [connectMsg, setConnectMsg] = useState('');

  // ── Restore everything from localStorage on mount ─────────────
  useEffect(() => {
    const savedToken = loadToken();
    const savedGistId = loadGistId();
    const savedUser = loadGithubUser();

    if (savedToken) setToken(savedToken);
    if (savedGistId) setGistId(savedGistId);
    if (savedUser) {
      setGithubUser(savedUser);
      setConnectStatus('success');
      setConnectMsg(`✅ Connected as @${savedUser}`);
    }
  }, []);

  const isConnected = connectStatus === 'success' && !!githubUser;

  // ── Verify token ──────────────────────────────────────────────
  async function handleConnect() {
    if (!token.trim()) {
      setConnectMsg('Please enter your GitHub token.');
      setConnectStatus('error');
      return;
    }
    setConnectStatus('loading');
    setConnectMsg('Verifying…');
    try {
      const user = await verifyToken(token.trim());
      setGithubUser(user);
      saveToken(token.trim());
      saveGithubUser(user);
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
        id = await createGist(token, contacts);
        setGistId(id);
        saveGistId(id);
      } else {
        await updateGist(token, id, contacts);
      }
      setPushStatus('success');
      setPushMsg(`✅ ${contacts.length} contacts synced to cloud!`);
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
      setPullMsg(`✅ ${result.contacts.length} contacts loaded (${result.added} new, ${result.duplicates} merged)`);
      if (!gistId) { setGistId(code); saveGistId(code); }
      onToast(`Contacts loaded from cloud ✅`);
    } catch (e: unknown) {
      setPullStatus('error');
      setPullMsg(e instanceof Error ? e.message : 'Load failed');
    }
  }

  function handleDisconnect() {
    if (!confirm('Disconnect cloud sync? Your local contacts will NOT be deleted.')) return;
    clearSyncSettings();
    setToken(''); setGistId(''); setGithubUser(''); setPullCode('');
    setPushStatus('idle'); setPullStatus('idle'); setConnectStatus('idle');
    setPushMsg(''); setPullMsg(''); setConnectMsg('');
    onToast('Cloud sync disconnected');
  }

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
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '1.5rem' }}>☁️</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'white', fontWeight: 800, fontSize: '1rem' }}>Cloud Sync</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem' }}>
            Upload once — open on any device instantly. Powered by GitHub Gist (free).
          </div>
        </div>
        {isConnected ? (
          <span style={{
            background: 'rgba(255,255,255,0.2)', color: 'white',
            padding: '0.3rem 0.9rem', borderRadius: '999px',
            fontSize: '0.8rem', fontWeight: 700,
          }}>
            🟢 @{githubUser}
          </span>
        ) : (
          <span style={{
            background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)',
            padding: '0.3rem 0.9rem', borderRadius: '999px',
            fontSize: '0.8rem', fontWeight: 600,
          }}>
            ⚪ Not connected
          </span>
        )}
      </div>

      <div style={{ padding: '1.5rem' }}>

        {/* ── PULL (any device — shown first, most common action) ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--gray-800)', marginBottom: '0.35rem' }}>
            📲 Load Contacts on This Device
          </div>
          <div style={{ fontSize: '0.83rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>
            Paste the Sync Code from the owner to instantly load all contacts on this device.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              style={{ flex: 1, minWidth: '180px', fontFamily: 'monospace', fontSize: '0.875rem' }}
              placeholder={gistId ? `Current: ${gistId.slice(0, 16)}…` : 'Paste Sync Code here…'}
              value={pullCode}
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

        <div style={{ borderTop: '1px solid var(--gray-200)', margin: '1rem 0' }} />

        {/* ── PUSH (owner only) ─────────────────────────────────── */}
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--gray-800)', marginBottom: '0.35rem' }}>
            🔑 Owner: Upload to Cloud
          </div>

          {isConnected ? (
            /* Already connected — just show the upload button */
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--success)',
              }}>
                ✅ Token saved — no need to paste it again.
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}
                  onClick={() => { setConnectStatus('idle'); setConnectMsg(''); setGithubUser(''); }}
                >
                  Change token
                </button>
              </div>

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
            </>
          ) : (
            /* Not connected — show token input */
            <>
              <div style={{ fontSize: '0.83rem', color: 'var(--gray-500)', marginBottom: '0.75rem' }}>
                Paste your GitHub token (
                <a
                  href="https://github.com/settings/tokens/new?scopes=gist&description=CallingTaskManager"
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--primary)', fontWeight: 600 }}
                >
                  create one here ↗
                </a>
                , needs <code style={{ background: 'var(--gray-100)', padding: '0 4px', borderRadius: 4 }}>gist</code> scope).
                It will be <strong>remembered</strong> — you only paste it once.
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                  <input
                    className="form-input"
                    type={showToken ? 'text' : 'password'}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem', paddingRight: '2.5rem' }}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
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
                  className="btn btn-outline"
                  onClick={handleConnect}
                  disabled={connectStatus === 'loading'}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {connectStatus === 'loading' ? '⏳…' : 'Connect'}
                </button>
              </div>

              {connectMsg && (
                <div className={`alert ${connectStatus === 'error' ? 'alert-danger' : 'alert-success'}`}
                  style={{ marginBottom: '0.75rem' }}>
                  {connectMsg}
                </div>
              )}
            </>
          )}

          {pushMsg && (
            <div className={`alert ${pushStatus === 'error' ? 'alert-danger' : 'alert-success'}`}
              style={{ marginBottom: '0.75rem' }}>
              {pushMsg}
            </div>
          )}

          {/* Sync Code display */}
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
                fontFamily: 'monospace', fontSize: '0.82rem',
                background: 'white', padding: '0.5rem 0.75rem',
                borderRadius: '6px', border: '1px solid var(--gray-200)',
                wordBreak: 'break-all', marginBottom: '0.5rem', userSelect: 'all',
              }}>
                {gistId}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>
                📱 Share this code with any device. On the other device, paste it in <strong>"Load Contacts"</strong> above and tap Load.
              </div>
            </div>
          )}

          {/* Disconnect */}
          {(token || gistId) && (
            <button className="btn btn-ghost btn-sm" onClick={handleDisconnect} style={{ color: 'var(--danger)' }}>
              🗑 Disconnect Cloud Sync
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
