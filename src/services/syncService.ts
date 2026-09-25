import type { Contact, MasterData } from '../types';

const GIST_FILENAME = 'calling-contacts.json';
const STORAGE_KEYS = {
  TOKEN: 'ctm_github_token',
  GIST_ID: 'ctm_gist_id',
  GITHUB_USER: 'ctm_github_user',
};

// ── Persist token/gist locally ─────────────────────────────────

export function saveToken(token: string) {
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
}

export function loadToken(): string {
  return localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
}

export function saveGistId(id: string) {
  localStorage.setItem(STORAGE_KEYS.GIST_ID, id);
}

export function loadGistId(): string {
  return localStorage.getItem(STORAGE_KEYS.GIST_ID) || '';
}

export function saveGithubUser(user: string) {
  localStorage.setItem(STORAGE_KEYS.GITHUB_USER, user);
}

export function loadGithubUser(): string {
  return localStorage.getItem(STORAGE_KEYS.GITHUB_USER) || '';
}

export function clearSyncSettings() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.GIST_ID);
  localStorage.removeItem(STORAGE_KEYS.GITHUB_USER);
}

// ── GitHub Gist API ────────────────────────────────────────────

function headers(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

/**
 * Create a new public Gist containing the contacts.
 * Returns the new Gist ID.
 */
export async function createGist(token: string, contacts: Contact[]): Promise<string> {
  const data: MasterData = {
    appVersion: '1.0',
    exportedAt: new Date().toISOString(),
    contacts,
  };

  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      description: 'Calling Task Manager — shared contacts',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(data, null, 2),
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error ${res.status}`);
  }

  const json = await res.json();
  return json.id as string;
}

/**
 * Update an existing Gist with the latest contacts.
 */
export async function updateGist(token: string, gistId: string, contacts: Contact[]): Promise<void> {
  const data: MasterData = {
    appVersion: '1.0',
    exportedAt: new Date().toISOString(),
    contacts,
  };

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(data, null, 2),
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error ${res.status}`);
  }
}

/**
 * Fetch contacts from a Gist by ID.
 * Works for both public and private (if token provided) gists.
 */
export async function fetchGist(gistId: string, token?: string): Promise<Contact[]> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: token
      ? headers(token)
      : { Accept: 'application/vnd.github+json' },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error('Sync code not found. Check the code and try again.');
    throw new Error(`GitHub API error ${res.status}`);
  }

  const json = await res.json();
  const file = json.files?.[GIST_FILENAME];
  if (!file) throw new Error('Contact file not found in this sync code.');

  // GitHub may truncate large files — fetch raw URL if needed
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const rawRes = await fetch(file.raw_url);
    content = await rawRes.text();
  }

  const parsed = JSON.parse(content);
  if (parsed.contacts && Array.isArray(parsed.contacts)) return parsed.contacts;
  if (Array.isArray(parsed)) return parsed;
  throw new Error('Invalid contact format in cloud sync.');
}

/**
 * Verify a token works and return the GitHub username.
 */
export async function verifyToken(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: headers(token),
  });
  if (!res.ok) throw new Error('Invalid token. Make sure it has "gist" scope.');
  const json = await res.json();
  return json.login as string;
}
