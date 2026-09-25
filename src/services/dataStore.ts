import type { Contact, MasterData, ContactStatus, ImportResult, CSVPreview } from '../types';
import { generateId, escapeCSV, downloadFile, exportDateStr } from '../utils';

const STORAGE_KEY = 'calling_task_manager_v1';

// ─── Status helpers ──────────────────────────────────────────────────────────

export const FINAL_STATUSES: ContactStatus[] = [
  'NOT_INTERESTED',
  'WRONG_NUMBER',
  'NOT_RELEVANT',
];

export const QUEUE_STATUSES: ContactStatus[] = [
  'NEW',
  'CALLBACK',
  'NO_ANSWER',
];

export function isCompleted(status: ContactStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

// ─── Local Storage ───────────────────────────────────────────────────────────

export function loadFromStorage(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveToStorage(contacts: Contact[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  } catch (e) {
    console.error('localStorage save failed', e);
  }
}

// ─── Merge algorithm ─────────────────────────────────────────────────────────

export function mergeContacts(existing: Contact[], incoming: Contact[]): Contact[] {
  const map = new Map<string, Contact>();

  // Build map from existing
  for (const c of existing) {
    map.set(c.id, c);
  }

  for (const inc of incoming) {
    const ex = map.get(inc.id);
    if (!ex) {
      // New contact — add it
      map.set(inc.id, inc);
    } else {
      // Merge: preserve the most recent calling activity
      const exUpdated = new Date(ex.updatedAt || 0).getTime();
      const incUpdated = new Date(inc.updatedAt || 0).getTime();

      let merged: Contact;
      if (incUpdated >= exUpdated) {
        // Incoming is newer — use its calling data
        merged = {
          ...ex,
          ...inc,
          // Never erase existing notes with blank
          notes: inc.notes || ex.notes,
          // Preserve higher attempt count
          callAttempts: Math.max(ex.callAttempts || 0, inc.callAttempts || 0),
          // Merge fields: use incoming if ex is blank
          company: inc.company || ex.company,
          person: inc.person || ex.person,
          area: inc.area || ex.area,
          role: inc.role || ex.role,
          source: inc.source || ex.source,
          // Merge history — deduplicate by timestamp
          history: mergeHistory(ex.history || [], inc.history || []),
        };
      } else {
        // Existing is newer — keep its calling data but merge missing fields
        merged = {
          ...inc,
          ...ex,
          // Merge missing fields from incoming
          company: ex.company || inc.company,
          person: ex.person || inc.person,
          area: ex.area || inc.area,
          role: ex.role || inc.role,
          source: ex.source || inc.source,
          notes: ex.notes || inc.notes,
          callAttempts: Math.max(ex.callAttempts || 0, inc.callAttempts || 0),
          history: mergeHistory(ex.history || [], inc.history || []),
        };
      }
      map.set(inc.id, merged);
    }
  }

  return Array.from(map.values());
}

function mergeHistory(a: Contact['history'], b: Contact['history']): Contact['history'] {
  const combined = [...a, ...b];
  const seen = new Set<string>();
  return combined.filter((h) => {
    if (seen.has(h.timestamp)) return false;
    seen.add(h.timestamp);
    return true;
  }).sort((x, y) => x.timestamp.localeCompare(y.timestamp));
}

// ─── CSV Import ───────────────────────────────────────────────────────────────

const COL_MAPS: Record<string, string[]> = {
  company: ['company', 'company_name', 'company name', 'organization', 'Organisation', 'org'],
  person: ['name', 'person', 'contact', 'contact name', 'contact_name'],
  phone: ['phone', 'mobile', 'number', 'phone_number', 'phone number', 'mobile_number', 'mobile number', 'tel'],
  area: ['area', 'location', 'city', 'district', 'zone'],
  role: ['role', 'potential_fit', 'potential fit', 'job_role', 'job role', 'designation', 'department'],
  source: ['source', 'list', 'list_name', 'list name'],
};

function detectColumn(headers: string[], field: string): number {
  const aliases = COL_MAPS[field] || [field];
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === alias.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export function parseCSV(text: string, sourceName: string = ''): { contacts: Contact[]; invalidRows: { row: number; reason: string }[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { contacts: [], invalidRows: [] };

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  const colCompany = detectColumn(headers, 'company');
  const colPerson = detectColumn(headers, 'person');
  const colPhone = detectColumn(headers, 'phone');
  const colArea = detectColumn(headers, 'area');
  const colRole = detectColumn(headers, 'role');
  const colSource = detectColumn(headers, 'source');

  const contacts: Contact[] = [];
  const invalidRows: { row: number; reason: string }[] = [];
  const now = new Date().toISOString();

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const company = colCompany >= 0 ? cells[colCompany]?.trim() || '' : '';
    const person = colPerson >= 0 ? cells[colPerson]?.trim() || '' : '';
    const phone = colPhone >= 0 ? cells[colPhone]?.trim() || '' : '';
    const area = colArea >= 0 ? cells[colArea]?.trim() || '' : '';
    const role = colRole >= 0 ? cells[colRole]?.trim() || '' : '';
    const source = colSource >= 0 ? cells[colSource]?.trim() || '' : sourceName;

    if (!phone && !company) {
      invalidRows.push({ row: i + 1, reason: 'Missing phone and company' });
      continue;
    }

    const id = generateId(phone, company, person, area);
    contacts.push({
      id,
      company,
      person,
      phone,
      area,
      role,
      source: source || sourceName,
      status: 'NEW',
      notes: '',
      callbackDate: '',
      callbackTime: '',
      createdAt: now,
      updatedAt: now,
      lastCalledAt: '',
      callAttempts: 0,
      history: [],
    });
  }

  return { contacts, invalidRows };
}

export function previewCSVImport(text: string, existing: Contact[], filename: string, sourceName: string): CSVPreview {
  const { contacts, invalidRows } = parseCSV(text, sourceName);
  const existingIds = new Set(existing.map((c) => c.id));
  const newCount = contacts.filter((c) => !existingIds.has(c.id)).length;
  const dupCount = contacts.filter((c) => existingIds.has(c.id)).length;

  return {
    filename,
    totalRows: contacts.length + invalidRows.length,
    newCount,
    duplicateCount: dupCount,
    invalidCount: invalidRows.length,
    invalidReasons: invalidRows.map((r) => `Row ${r.row}: ${r.reason}`),
    contacts,
  };
}

// ─── JSON Import ──────────────────────────────────────────────────────────────

export function parseJSONImport(text: string): Contact[] {
  const parsed = JSON.parse(text);
  let contacts: Contact[] = [];

  if (Array.isArray(parsed)) {
    contacts = parsed;
  } else if (parsed.contacts && Array.isArray(parsed.contacts)) {
    contacts = parsed.contacts;
  } else {
    throw new Error('No contacts array found in JSON file.');
  }

  const now = new Date().toISOString();
  return contacts.map((c: Partial<Contact>) => {
    const phone = c.phone || '';
    const id = c.id || generateId(phone, c.company || '', c.person || '', c.area || '');
    return {
      id,
      company: c.company || '',
      person: c.person || '',
      phone,
      area: c.area || '',
      role: c.role || '',
      source: c.source || '',
      status: (c.status as ContactStatus) || 'NEW',
      notes: c.notes || '',
      callbackDate: c.callbackDate || '',
      callbackTime: c.callbackTime || '',
      createdAt: c.createdAt || now,
      updatedAt: c.updatedAt || now,
      lastCalledAt: c.lastCalledAt || '',
      callAttempts: c.callAttempts || 0,
      history: c.history || [],
      followUpDone: c.followUpDone || false,
    };
  });
}

// ─── Import result helper ─────────────────────────────────────────────────────

export function doImport(existing: Contact[], incoming: Contact[]): ImportResult {
  const existingIds = new Set(existing.map((c) => c.id));
  const newContacts = incoming.filter((c) => !existingIds.has(c.id));
  const dups = incoming.filter((c) => existingIds.has(c.id));
  const merged = mergeContacts(existing, incoming);

  return {
    added: newContacts.length,
    duplicates: dups.length,
    invalid: 0,
    invalidReasons: [],
    contacts: merged,
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function exportMasterJSON(contacts: Contact[]): void {
  const data: MasterData = {
    appVersion: '1.0',
    exportedAt: new Date().toISOString(),
    contacts,
  };
  const dateStr = exportDateStr();
  downloadFile(JSON.stringify(data, null, 2), `calling-master-${dateStr}.json`, 'application/json');
}

export function exportProgressJSON(contacts: Contact[]): void {
  const data: MasterData = {
    appVersion: '1.0',
    exportedAt: new Date().toISOString(),
    contacts,
  };
  const dateStr = exportDateStr();
  downloadFile(JSON.stringify(data, null, 2), `calling-progress-${dateStr}.json`, 'application/json');
}

const CSV_HEADERS = [
  'id', 'company', 'person', 'phone', 'area', 'role', 'source',
  'status', 'notes', 'callbackDate', 'callbackTime', 'callAttempts',
  'createdAt', 'updatedAt', 'lastCalledAt',
];

export function exportCSV(contacts: Contact[]): void {
  const rows = [CSV_HEADERS.join(',')];
  for (const c of contacts) {
    rows.push([
      escapeCSV(c.id),
      escapeCSV(c.company),
      escapeCSV(c.person),
      escapeCSV(c.phone),
      escapeCSV(c.area),
      escapeCSV(c.role),
      escapeCSV(c.source),
      escapeCSV(c.status),
      escapeCSV(c.notes),
      escapeCSV(c.callbackDate),
      escapeCSV(c.callbackTime),
      escapeCSV(c.callAttempts),
      escapeCSV(c.createdAt),
      escapeCSV(c.updatedAt),
      escapeCSV(c.lastCalledAt),
    ].join(','));
  }
  const dateStr = exportDateStr();
  downloadFile(rows.join('\n'), `calling-export-${dateStr}.csv`, 'text/csv');
}

// ─── Calling queue ────────────────────────────────────────────────────────────

export function buildCallingQueue(contacts: Contact[]): Contact[] {
  const pending = contacts.filter((c) => !isCompleted(c.status));

  const callbacks: Contact[] = [];
  const newContacts: Contact[] = [];
  const noAnswer: Contact[] = [];
  const others: Contact[] = [];

  for (const c of pending) {
    if (c.status === 'CALLBACK') {
      callbacks.push(c);
    } else if (c.status === 'NEW') {
      newContacts.push(c);
    } else if (c.status === 'NO_ANSWER') {
      noAnswer.push(c);
    } else {
      others.push(c);
    }
  }

  // Sort callbacks: due today first
  callbacks.sort((a, b) => {
    const aToday = a.callbackDate && a.callbackDate <= new Date().toISOString().split('T')[0];
    const bToday = b.callbackDate && b.callbackDate <= new Date().toISOString().split('T')[0];
    if (aToday && !bToday) return -1;
    if (!aToday && bToday) return 1;
    return 0;
  });

  return [...callbacks, ...newContacts, ...noAnswer, ...others];
}

// ─── Demo data ────────────────────────────────────────────────────────────────

export function getDemoContacts(): Contact[] {
  const now = new Date().toISOString();
  const demos = [
    { company: 'Bright Precision Machining Works', phone: '7722013548', area: 'Hadapsar', role: 'Quality / Operations' },
    { company: 'East Sun Electronics Pvt Ltd', phone: '9876543210', area: 'Kharadi', role: 'Electronics / Technical' },
    { company: 'Revine Technologies', phone: '8484849617', area: 'Kharadi', role: 'IT / Software' },
    { company: 'Hi-Tech Automation', phone: '8390000301', area: 'Narhe', role: 'Automation / Electrical' },
    { company: 'Global Precision Tools', phone: '9422323127', area: 'Pimpri', role: 'Manufacturing' },
    { company: 'Sunrise Fabricators', phone: '9175604246', area: 'Bhosari', role: 'Fabrication / Welding' },
    { company: 'Metro Industrial Solutions', phone: '7890123456', area: 'Chakan', role: 'Industrial Sales' },
    { company: 'Apex Engineering Works', phone: '8765432109', area: 'Talegaon', role: 'Engineering / Design' },
    { company: 'Prime Components Ltd', phone: '9988776655', area: 'Sanaswadi', role: 'Components / Procurement' },
    { company: 'Delta Hydraulics', phone: '7654321098', area: 'Ranjangaon', role: 'Hydraulics / Maintenance' },
  ];

  return demos.map((d, i) => ({
    id: generateId(d.phone, d.company, '', d.area),
    company: d.company,
    person: '',
    phone: d.phone,
    area: d.area,
    role: d.role,
    source: 'Demo Data',
    status: 'NEW' as ContactStatus,
    notes: '',
    callbackDate: '',
    callbackTime: '',
    createdAt: new Date(Date.now() - i * 60000).toISOString(),
    updatedAt: now,
    lastCalledAt: '',
    callAttempts: 0,
    history: [],
  }));
}
