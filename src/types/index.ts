export type ContactStatus =
  | 'NEW'
  | 'ASKED_FOR_RESUME'
  | 'INTERESTED'
  | 'CALLBACK'
  | 'NO_ANSWER'
  | 'NOT_INTERESTED'
  | 'WRONG_NUMBER'
  | 'NOT_RELEVANT';

export interface HistoryEntry {
  timestamp: string;
  status: ContactStatus;
  note: string;
}

export interface Contact {
  id: string;
  company: string;
  person: string;
  phone: string;
  phones?: string[];
  area: string;
  role: string;
  source: string;
  status: ContactStatus;
  notes: string;
  callbackDate: string;
  callbackTime: string;
  createdAt: string;
  updatedAt: string;
  lastCalledAt: string;
  callAttempts: number;
  history: HistoryEntry[];
  followUpDone?: boolean;
  skipped?: boolean;
}

export interface MasterData {
  appVersion: string;
  exportedAt: string;
  contacts: Contact[];
}

export type AppMode = 'home' | 'caller' | 'dashboard' | 'import' | 'export';

export type SortField = 'updatedAt' | 'company' | 'status' | 'callAttempts' | 'area';
export type SortDir = 'asc' | 'desc';

export interface ImportResult {
  added: number;
  duplicates: number;
  invalid: number;
  invalidReasons: string[];
  contacts: Contact[];
}

export interface CSVPreview {
  filename: string;
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  invalidCount: number;
  invalidReasons: string[];
  contacts: Contact[];
}
