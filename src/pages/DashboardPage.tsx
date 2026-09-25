import { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { Contact, ContactStatus, SortField, SortDir } from '../types';
import { StatusBadge, STATUS_LABELS } from '../components/StatusBadge';
import { ContactDetailModal } from '../components/ContactDetailModal';
import { formatDate, buildTelLink } from '../utils';
import { buildCallingQueue } from '../services/dataStore';

const ALL_STATUSES: ContactStatus[] = [
  'NEW', 'ASKED_FOR_RESUME', 'INTERESTED', 'CALLBACK',
  'NO_ANSWER', 'NOT_INTERESTED', 'WRONG_NUMBER', 'NOT_RELEVANT',
];

const HOT_STATUSES: ContactStatus[] = ['ASKED_FOR_RESUME', 'INTERESTED', 'CALLBACK'];

function StatCard({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function DashboardPage() {
  const { state, updateContact, refreshCloud } = useApp();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ContactStatus | 'ALL'>('ALL');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'hot' | 'callbacks' | 'queue'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const contacts = state.contacts;

  // ── Stats ─────────────────────────────────────────────────────
  const statCounts = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = contacts.filter((c) => c.status === s).length;
    return acc;
  }, {} as Record<ContactStatus, number>);

  const totalCount = contacts.length;
  const called = contacts.filter((c) => c.callAttempts > 0).length;

  // ── Filter & search ───────────────────────────────────────────
  const filtered = contacts.filter((c) => {
    const matchStatus = filterStatus === 'ALL' || c.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || [c.company, c.person, c.phone, c.area, c.role, c.notes, c.source]
      .some((f) => f?.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  // ── Sort ──────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';
    if (sortField === 'updatedAt') { aVal = a.updatedAt || ''; bVal = b.updatedAt || ''; }
    else if (sortField === 'company') { aVal = a.company || ''; bVal = b.company || ''; }
    else if (sortField === 'status') { aVal = a.status || ''; bVal = b.status || ''; }
    else if (sortField === 'callAttempts') { aVal = a.callAttempts || 0; bVal = b.callAttempts || 0; }
    else if (sortField === 'area') { aVal = a.area || ''; bVal = b.area || ''; }

    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  function sortArrow(field: SortField) {
    if (sortField !== field) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  // ── Hot leads ─────────────────────────────────────────────────
  const hotLeads = contacts.filter((c) => HOT_STATUSES.includes(c.status) && !c.followUpDone);
  const todayCallbacks = contacts.filter((c) => {
    if (c.status !== 'CALLBACK') return false;
    const today = new Date().toISOString().split('T')[0];
    return !c.callbackDate || c.callbackDate <= today;
  });

  // ── Queue ─────────────────────────────────────────────────────
  const queue = buildCallingQueue(contacts);

  function handleFollowUpToggle(contact: Contact) {
    updateContact({ ...contact, followUpDone: !contact.followUpDone });
  }

  function handleContactUpdate(updated: Contact) {
    updateContact(updated);
    // Keep modal open with fresh data so user sees the update
    setSelectedContact(updated);
  }

  if (contacts.length === 0) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-icon">📞</div>
          <h3>No Contacts Loaded</h3>
          <p>Import a CSV or JSON file to begin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {selectedContact && (
        <ContactDetailModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          onUpdate={handleContactUpdate}
          onFollowUpToggle={handleFollowUpToggle}
        />
      )}

      {/* Live sync banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem', background: 'white', padding: '0.6rem 0.875rem', borderRadius: '10px', border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#059669', fontWeight: 700 }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
          Live Cloud Sync
          {state.lastCloudSyncTime && (
            <span style={{ color: 'var(--gray-400)', fontWeight: 500, fontSize: '0.75rem' }}>
              • {state.lastCloudSyncTime}
            </span>
          )}
        </div>
        <button
          className="btn btn-outline btn-sm"
          style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem', minHeight: '30px', borderRadius: '8px', fontWeight: 600 }}
          onClick={async () => {
            setRefreshing(true);
            await refreshCloud();
            setTimeout(() => setRefreshing(false), 500);
          }}
          disabled={refreshing}
        >
          {refreshing ? '⏳ Syncing…' : '🔄 Refresh'}
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard value={totalCount} label="Total" />
        <StatCard value={called} label="Called" color="var(--primary)" />
        <StatCard value={statCounts.NEW || 0} label="New" color="var(--primary)" />
        <StatCard value={statCounts.ASKED_FOR_RESUME || 0} label="Resume" color="var(--success)" />
        <StatCard value={statCounts.INTERESTED || 0} label="Interested" color="#be185d" />
        <StatCard value={statCounts.CALLBACK || 0} label="Callback" color="var(--warning)" />
        <StatCard value={statCounts.NO_ANSWER || 0} label="No Answer" color="var(--gray-500)" />
        <StatCard value={statCounts.NOT_INTERESTED || 0} label="Not Interested" color="var(--danger)" />
        <StatCard value={statCounts.WRONG_NUMBER || 0} label="Wrong No." color="var(--danger)" />
        <StatCard value={statCounts.NOT_RELEVANT || 0} label="Not Relevant" color="var(--gray-500)" />
      </div>

      {/* Tab nav */}
      <div className="filter-bar" style={{ marginBottom: '1.25rem' }}>
        {[
          { key: 'all', label: '📋 All Contacts' },
          { key: 'hot', label: `🔥 Hot Leads (${hotLeads.length})` },
          { key: 'callbacks', label: `🔁 Callbacks (${todayCallbacks.length})` },
          { key: 'queue', label: `📞 Calling Queue (${queue.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`filter-chip ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key as typeof activeTab)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Hot Leads */}
      {activeTab === 'hot' && (
        <div className="dash-section">
          <div className="section-title">🔥 Hot Leads</div>
          {hotLeads.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🔥</div>
              <h3>No hot leads yet</h3>
              <p>Contacts marked Interested, Asked for Resume, or Callback will appear here.</p>
            </div>
          ) : hotLeads.map((c) => (
            <div key={c.id} className="hot-lead-card" onClick={() => setSelectedContact(c)}>
              <div className="flex items-center justify-between gap-2">
                <div className="hot-lead-company">{c.company}</div>
                <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                  <StatusBadge status={c.status} />
                  {buildTelLink(c.phone) && (
                    <a
                      href={buildTelLink(c.phone)}
                      className="btn btn-primary btn-sm"
                      style={{ textDecoration: 'none' }}
                    >
                      📞 Call
                    </a>
                  )}
                </div>
              </div>
              <div className="hot-lead-phone">📱 {c.phone}</div>
              {c.notes && <div className="hot-lead-note">📝 {c.notes}</div>}
              {c.callbackDate && <div className="hot-lead-note">📅 Callback: {c.callbackDate} {c.callbackTime}</div>}
              <div className="hot-lead-time">Updated {formatDate(c.updatedAt)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Callbacks */}
      {activeTab === 'callbacks' && (
        <div className="dash-section">
          <div className="section-title">🔁 Today's Callbacks</div>
          {todayCallbacks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📅</div>
              <h3>No callbacks due today</h3>
              <p>Contacts with a callback date set for today will appear here.</p>
            </div>
          ) : todayCallbacks.map((c) => (
            <div key={c.id} className="hot-lead-card" style={{ borderLeftColor: 'var(--warning)' }} onClick={() => setSelectedContact(c)}>
              <div className="flex items-center justify-between gap-2">
                <div className="hot-lead-company">{c.company}</div>
                <div onClick={(e) => e.stopPropagation()}>
                  {buildTelLink(c.phone) && (
                    <a href={buildTelLink(c.phone)} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                      📞 Call
                    </a>
                  )}
                </div>
              </div>
              <div className="hot-lead-phone">📱 {c.phone}</div>
              {c.callbackDate && <div className="hot-lead-note">⏰ {c.callbackDate} {c.callbackTime && `at ${c.callbackTime}`}</div>}
              {c.notes && <div className="hot-lead-note">📝 {c.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Calling Queue */}
      {activeTab === 'queue' && (
        <div className="dash-section">
          <div className="section-title">📞 Calling Queue</div>
          {queue.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✅</div>
              <h3>Queue is empty</h3>
              <p>All contacts have been called or resolved.</p>
            </div>
          ) : (
            <div className="card">
              {queue.map((c, i) => (
                <div key={c.id} className="caller-list-item" onClick={() => setSelectedContact(c)}>
                  <span className="cli-num">{i + 1}</span>
                  <div className="cli-info">
                    <div className="cli-company">{c.company}</div>
                    <div className="cli-phone">{c.phone}</div>
                  </div>
                  <StatusBadge status={c.status} />
                  <div onClick={(e) => e.stopPropagation()}>
                    {buildTelLink(c.phone) && (
                      <a href={buildTelLink(c.phone)} className="btn btn-primary btn-sm" style={{ textDecoration: 'none', marginLeft: '0.5rem' }}>
                        📞 Call
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All Contacts */}
      {activeTab === 'all' && (
        <div className="dash-section">
          <div className="filter-bar">
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input
                className="form-input"
                placeholder="Search company, phone, area, role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="filter-bar">
            <button className={`filter-chip ${filterStatus === 'ALL' ? 'active' : ''}`} onClick={() => setFilterStatus('ALL')}>
              All ({contacts.length})
            </button>
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                className={`filter-chip ${filterStatus === s ? 'active' : ''}`}
                onClick={() => setFilterStatus(s)}
              >
                {STATUS_LABELS[s]} ({statCounts[s] || 0})
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.875rem', overflowX: 'auto', alignItems: 'center', scrollbarWidth: 'none' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', flexShrink: 0 }}>Sort:</span>
            {(['updatedAt', 'company', 'callAttempts', 'area'] as SortField[]).map((f) => (
              <button
                key={f}
                className={`filter-chip ${sortField === f ? 'active' : ''}`}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', minHeight: '32px' }}
                onClick={() => toggleSort(f)}
              >
                {f === 'updatedAt' ? 'Recent' : f === 'callAttempts' ? 'Attempts' : f.charAt(0).toUpperCase() + f.slice(1)}
                {sortArrow(f)}
              </button>
            ))}
          </div>

          <div className="contact-list-container">
            {sorted.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <p style={{ color: 'var(--gray-400)' }}>No contacts match your filter</p>
              </div>
            ) : (
              sorted.map((c) => (
                <div key={c.id} className="contact-mobile-card" onClick={() => setSelectedContact(c)}>
                  <div className="cmc-info">
                    <div className="cmc-company">{c.company || '—'}</div>
                    <div className="cmc-phone">📱 {c.phone}</div>
                    <div className="cmc-sub">
                      {[c.person, c.area, c.role].filter(Boolean).join(' • ') || 'No extra info'}
                    </div>
                  </div>
                  <div className="cmc-actions" onClick={(e) => e.stopPropagation()}>
                    <StatusBadge status={c.status} />
                    {buildTelLink(c.phone) ? (
                      <a
                        href={buildTelLink(c.phone)}
                        className="btn btn-primary btn-sm"
                        style={{ textDecoration: 'none', padding: '0.4rem 0.75rem', minHeight: '36px', borderRadius: '8px' }}
                        title={`Call ${c.phone}`}
                      >
                        📞 Call
                      </a>
                    ) : (
                      <span style={{ color: 'var(--gray-400)', fontSize: '0.75rem' }}>No #</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--gray-500)' }}>
            Showing {sorted.length} of {contacts.length} contacts · Click any row to view details
          </div>
        </div>
      )}
    </div>
  );
}
