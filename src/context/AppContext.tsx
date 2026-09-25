import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { Contact, AppMode } from '../types';
import {
  loadFromStorage,
  saveToStorage,
  buildCallingQueue,
  isCompleted,
  doImport,
} from '../services/dataStore';
import { pullContacts, pushContacts } from '../services/supabaseSync';

interface AppState {
  contacts: Contact[];
  mode: AppMode;
  callerQueue: Contact[];
  callerIndex: number;
  lastSaved: string;
  syncing: boolean;  // true while auto-loading from cloud on startup
}

type Action =
  | { type: 'SET_CONTACTS'; contacts: Contact[] }
  | { type: 'SET_MODE'; mode: AppMode }
  | { type: 'UPDATE_CONTACT'; contact: Contact }
  | { type: 'START_CALLING' }
  | { type: 'NEXT_CALLER' }
  | { type: 'SKIP_CALLER' }
  | { type: 'SET_CALLER_INDEX'; index: number }
  | { type: 'SET_SYNCING'; syncing: boolean };

function buildQueue(contacts: Contact[]): Contact[] {
  return buildCallingQueue(contacts);
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CONTACTS': {
      const queue = buildQueue(action.contacts);
      saveToStorage(action.contacts);
      return {
        ...state,
        contacts: action.contacts,
        callerQueue: queue,
        callerIndex: 0,
        lastSaved: new Date().toLocaleTimeString('en-IN'),
      };
    }
    case 'SET_MODE':
      return { ...state, mode: action.mode };

    case 'UPDATE_CONTACT': {
      const updated = state.contacts.map((c) =>
        c.id === action.contact.id ? action.contact : c
      );
      saveToStorage(updated);
      const queue = buildQueue(updated);
      return {
        ...state,
        contacts: updated,
        callerQueue: queue,
        lastSaved: new Date().toLocaleTimeString('en-IN'),
      };
    }

    case 'START_CALLING': {
      const queue = buildQueue(state.contacts);
      return { ...state, callerQueue: queue, callerIndex: 0, mode: 'caller' };
    }

    case 'NEXT_CALLER': {
      const nextIdx = state.callerIndex + 1;
      return { ...state, callerIndex: nextIdx };
    }

    case 'SKIP_CALLER': {
      const queue = [...state.callerQueue];
      const [skipped] = queue.splice(state.callerIndex, 1);
      queue.push(skipped);
      return { ...state, callerQueue: queue };
    }

    case 'SET_CALLER_INDEX':
      return { ...state, callerIndex: action.index };

    case 'SET_SYNCING':
      return { ...state, syncing: action.syncing };

    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  setContacts: (contacts: Contact[]) => void;
  setMode: (mode: AppMode) => void;
  updateContact: (contact: Contact) => void;
  startCalling: () => void;
  nextCaller: () => void;
  skipCaller: () => void;
  setCallerIndex: (index: number) => void;
  currentCallerContact: Contact | null;
  remainingCount: number;
  completedCount: number;
  totalPending: number;
  pushToCloud: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    contacts: [],
    mode: 'home',
    callerQueue: [],
    callerIndex: 0,
    lastSaved: '',
    syncing: true,
  });

  // ── On mount: load local first, then auto-sync from Supabase ──
  useEffect(() => {
    async function init() {
      // 1. Load from localStorage immediately (instant)
      const local = loadFromStorage();
      if (local.length > 0) {
        dispatch({ type: 'SET_CONTACTS', contacts: local });
      }

      // 2. Fetch from Supabase and merge (may take 1-2 seconds)
      try {
        const { contacts: cloud } = await pullContacts();
        if (cloud.length > 0) {
          // Merge cloud into local — cloud wins for newer records, local wins for calling progress
          const merged = doImport(local, cloud);
          dispatch({ type: 'SET_CONTACTS', contacts: merged.contacts });
        }
      } catch {
        // Supabase unavailable or no data yet — use local only, silently ignore
      } finally {
        dispatch({ type: 'SET_SYNCING', syncing: false });
      }
    }
    init();
  }, []);

  const setContacts = useCallback((contacts: Contact[]) => {
    dispatch({ type: 'SET_CONTACTS', contacts });
  }, []);

  const setMode = useCallback((mode: AppMode) => {
    dispatch({ type: 'SET_MODE', mode });
  }, []);

  const updateContact = useCallback((contact: Contact) => {
    dispatch({ type: 'UPDATE_CONTACT', contact });
  }, []);

  const startCalling = useCallback(() => {
    dispatch({ type: 'START_CALLING' });
  }, []);

  const nextCaller = useCallback(() => {
    dispatch({ type: 'NEXT_CALLER' });
  }, []);

  const skipCaller = useCallback(() => {
    dispatch({ type: 'SKIP_CALLER' });
  }, []);

  const setCallerIndex = useCallback((index: number) => {
    dispatch({ type: 'SET_CALLER_INDEX', index });
  }, []);

  // Push current contacts to Supabase (called from SupabaseSyncPanel)
  const pushToCloud = useCallback(async () => {
    await pushContacts(state.contacts);
  }, [state.contacts]);

  const currentCallerContact = state.callerQueue[state.callerIndex] ?? null;
  const remainingCount = Math.max(0, state.callerQueue.length - state.callerIndex);
  const completedCount = state.contacts.filter((c) => isCompleted(c.status)).length;
  const totalPending = state.callerQueue.length;

  return (
    <AppContext.Provider
      value={{
        state,
        setContacts,
        setMode,
        updateContact,
        startCalling,
        nextCaller,
        skipCaller,
        setCallerIndex,
        currentCallerContact,
        remainingCount,
        completedCount,
        totalPending,
        pushToCloud,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
