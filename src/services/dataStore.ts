import type { Contact, MasterData, ContactStatus, ImportResult, CSVPreview } from '../types';
import { generateId, escapeCSV, downloadFile, exportDateStr, normalizePhone } from '../utils';

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

const PHONE_ALIASES = [
  'phone', 'phoneno', 'phonenumber', 'phone1', 'phone2', 'primaryphone', 'contactphone',
  'mobile', 'mobileno', 'mobilenumber', 'mobile1', 'mobile2', 'primarymobile',
  'contactno', 'contactnumber', 'contactnum', 'contact1', 'contact2',
  'mob', 'ph', 'phno', 'phnum', 'cell', 'cellno', 'cellphone',
  'tel', 'telno', 'telephone', 'telephoneno',
  'whatsapp', 'whatsappno', 'whatsappnumber',
  'callingno', 'callingnumber', 'callno', 'calling',
  'number', 'numbers'
];

const COMPANY_ALIASES = [
  'company', 'companyname', 'organization', 'organisation', 'org', 'orgname',
  'firm', 'firmname', 'business', 'businessname', 'client', 'clientname',
  'shop', 'shopname', 'enterprise', 'account', 'employer', 'agency', 'accountname'
];

const PERSON_ALIASES = [
  'person', 'personname', 'contactperson', 'contactname', 'name', 'fullname',
  'candidate', 'candidatename', 'owner', 'proprietor', 'manager', 'lead', 'clientperson'
];

const AREA_ALIASES = [
  'area', 'location', 'city', 'district', 'zone', 'address', 'place', 'region', 'state', 'town'
];

const ROLE_ALIASES = [
  'role', 'potentialfit', 'jobrole', 'designation', 'department', 'title', 'position', 'profile', 'category'
];

const SOURCE_ALIASES = [
  'source', 'list', 'listname', 'sourcename', 'campaign', 'batch'
];

function cleanHeaderKey(h: string): string {
  return (h || '').replace(/^\uFEFF/, '').replace(/['"]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectColumnByHeader(headers: string[], aliases: string[]): number {
  const normHeaders = headers.map(cleanHeaderKey);
  // 1. Exact alias match
  for (const alias of aliases) {
    const idx = normHeaders.indexOf(alias);
    if (idx >= 0) return idx;
  }
  // 2. Substring match
  for (let i = 0; i < normHeaders.length; i++) {
    const h = normHeaders[i];
    if (!h) continue;
    for (const alias of aliases) {
      if (h.length >= 4 && alias.length >= 4 && (h.includes(alias) || alias.includes(h))) {
        return i;
      }
    }
  }
  return -1;
}

function detectPhoneColumnByContent(rows: string[][]): number {
  if (rows.length === 0) return -1;
  const sample = rows.slice(0, 30);
  const maxCols = Math.max(...sample.map(r => r.length));
  let bestCol = -1;
  let maxCount = 0;

  for (let c = 0; c < maxCols; c++) {
    let count = 0;
    let totalNonEmpty = 0;
    for (const r of sample) {
      const val = (r[c] || '').trim();
      if (!val) continue;
      totalNonEmpty++;
      const digits = val.replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15) {
        count++;
      }
    }
    if (totalNonEmpty >= 2 && count / totalNonEmpty >= 0.35 && count > maxCount) {
      maxCount = count;
      bestCol = c;
    }
  }
  return bestCol;
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
  const cleanText = text.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { contacts: [], invalidRows: [] };

  const parsedRows = lines.map(parseCSVLine);
  const rawHeaders = parsedRows[0];
  const dataRows = parsedRows.slice(1);

  let colCompany = detectColumnByHeader(rawHeaders, COMPANY_ALIASES);
  const colPerson = detectColumnByHeader(rawHeaders, PERSON_ALIASES);
  let colPhone = detectColumnByHeader(rawHeaders, PHONE_ALIASES);
  const colArea = detectColumnByHeader(rawHeaders, AREA_ALIASES);
  const colRole = detectColumnByHeader(rawHeaders, ROLE_ALIASES);
  const colSource = detectColumnByHeader(rawHeaders, SOURCE_ALIASES);

  // If phone column not found by header, inspect data content!
  if (colPhone === -1) {
    colPhone = detectPhoneColumnByContent(dataRows);
  }

  // If company not found by header, pick first column that is not phone or person
  if (colCompany === -1) {
    for (let c = 0; c < rawHeaders.length; c++) {
      if (c !== colPhone && c !== colPerson && c !== colArea && c !== colRole) {
        colCompany = c;
        break;
      }
    }
  }

  const contacts: Contact[] = [];
  const invalidRows: { row: number; reason: string }[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const company = colCompany >= 0 ? cells[colCompany]?.trim() || '' : '';
    const person = colPerson >= 0 ? cells[colPerson]?.trim() || '' : '';
    let rawPhone = colPhone >= 0 ? cells[colPhone]?.trim() || '' : '';
    const area = colArea >= 0 ? cells[colArea]?.trim() || '' : '';
    const role = colRole >= 0 ? cells[colRole]?.trim() || '' : '';
    const source = colSource >= 0 ? cells[colSource]?.trim() || '' : sourceName;

    // Row-level fallback: scan all cells in this row for any phone-like value if rawPhone is missing
    if (!rawPhone) {
      for (let c = 0; c < cells.length; c++) {
        if (c === colCompany) continue;
        const val = (cells[c] || '').trim();
        const digits = val.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 13) {
          rawPhone = val;
          break;
        }
      }
    }

    const phone = normalizePhone(rawPhone) || rawPhone;

    if (!phone && !company) {
      invalidRows.push({ row: i + 2, reason: 'Missing phone and company' });
      continue;
    }

    const id = generateId(phone, company, person, area);
    contacts.push({
      id,
      company: company || (person ? `${person}'s Contact` : 'Unnamed Contact'),
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
