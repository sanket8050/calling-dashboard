import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import type { Contact, AppMode } from '../types';
import {
  loadFromStorage,
  saveToStorage,
  buildCallingQueue,
  isCompleted,
  doImport,
} from '../services/dataStore';
import { pullContacts, pushContacts, getLastSyncTime, subscribeToCloudUpdates } from '../services/supabaseSync';

interface AppState {
  contacts: Contact[];
  mode: AppMode;
  callerQueue: Contact[];
  callerIndex: number;
  lastSaved: string;
  syncing: boolean;
  lastCloudSyncTime: string;
}

type Action =
  | { type: 'SET_CONTACTS'; contacts: Contact[] }
  | { type: 'SET_MODE'; mode: AppMode }
  | { type: 'UPDATE_CONTACT'; contact: Contact }
  | { type: 'START_CALLING' }
  | { type: 'NEXT_CALLER' }
  | { type: 'SKIP_CALLER' }
  | { type: 'SET_CALLER_INDEX'; index: number }
  | { type: 'SET_SYNCING'; syncing: boolean }
  | { type: 'SET_CLOUD_TIME'; time: string };

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

    case 'SET_CLOUD_TIME':
      return { ...state, lastCloudSyncTime: action.time };

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
  refreshCloud: () => Promise<void>;
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
    lastCloudSyncTime: '',
  });

  const lastKnownCloudTimeRef = useRef<string>('');
  const isSyncingRef = useRef<boolean>(false);

  // Core function to merge incoming cloud contacts into local state
  const applyCloudUpdate = useCallback((cloudContacts: Contact[], updatedAt: string) => {
    if (!cloudContacts || cloudContacts.length === 0) return;
    lastKnownCloudTimeRef.current = updatedAt;
    const local = loadFromStorage();
    const merged = doImport(local, cloudContacts);
    dispatch({ type: 'SET_CONTACTS', contacts: merged.contacts });
    dispatch({ type: 'SET_CLOUD_TIME', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
  }, []);

  // Manual or automatic pull from cloud
  const refreshCloud = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const { contacts: cloud, updatedAt } = await pullContacts();
      applyCloudUpdate(cloud, updatedAt);
    } catch {
      // Offline or error — ignore silently
    } finally {
      isSyncingRef.current = false;
      dispatch({ type: 'SET_SYNCING', syncing: false });
    }
  }, [applyCloudUpdate]);

  // 1. On Mount: load local first, then pull initial cloud data
  useEffect(() => {
    const local = loadFromStorage();
    if (local.length > 0) {
      dispatch({ type: 'SET_CONTACTS', contacts: local });
    }
    refreshCloud();
  }, [refreshCloud]);

  // 2. Realtime listener: triggers instantly when database is changed
  useEffect(() => {
    const unsubscribe = subscribeToCloudUpdates((cloudContacts, updatedAt) => {
      applyCloudUpdate(cloudContacts, updatedAt);
    });
    return unsubscribe;
  }, [applyCloudUpdate]);

  // 3. Background live polling: checks every 5 seconds for new caller updates
  useEffect(() => {
    const checkUpdates = async () => {
      if (isSyncingRef.current) return;
      try {
        const cloudTime = await getLastSyncTime();
        if (cloudTime && cloudTime !== lastKnownCloudTimeRef.current) {
          await refreshCloud();
        }
      } catch {
        // Offline / network pause
      }
    };

    const interval = setInterval(checkUpdates, 5000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        checkUpdates();
      }
    };

    window.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkUpdates);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkUpdates);
    };
  }, [refreshCloud]);

  const setContacts = useCallback((contacts: Contact[]) => {
    dispatch({ type: 'SET_CONTACTS', contacts });
  }, []);

  const setMode = useCallback((mode: AppMode) => {
    dispatch({ type: 'SET_MODE', mode });
  }, []);

  // When a caller tags/updates a contact: save locally AND auto-sync to Supabase immediately!
  const updateContact = useCallback((contact: Contact) => {
    dispatch({ type: 'UPDATE_CONTACT', contact });
    const local = loadFromStorage();
    const updated = local.map((c) => (c.id === contact.id ? contact : c));
    saveToStorage(updated);

    // Auto-push the caller's action to Supabase in background
    pushContacts(updated)
      .then(() => {
        dispatch({ type: 'SET_CLOUD_TIME', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
      })
      .catch((err) => {
        console.warn('Background cloud update failed:', err);
      });
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

  const pushToCloud = useCallback(async () => {
    await pushContacts(state.contacts);
    dispatch({ type: 'SET_CLOUD_TIME', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
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
        refreshCloud,
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
