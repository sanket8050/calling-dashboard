import { supabase } from './supabaseClient';
import type { Contact } from '../types';

const TABLE = 'calling_contacts';
const ROW_ID = 'default';

export interface SyncResult {
  contacts: Contact[];
  updatedAt: string;
}

/**
 * Push all contacts to Supabase (upsert single row).
 */
export async function pushContacts(contacts: Contact[]): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({
      id: ROW_ID,
      data: contacts,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) throw new Error(error.message);
}

/**
 * Pull latest contacts from Supabase.
 */
export async function pullContacts(): Promise<SyncResult> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('data, updated_at')
    .eq('id', ROW_ID)
    .single();

  if (error) {
    if (error.code === 'PGRST116') throw new Error('No contacts found in cloud. Upload from your laptop first.');
    throw new Error(error.message);
  }

  return {
    contacts: data.data as Contact[],
    updatedAt: data.updated_at as string,
  };
}

/**
 * Get last sync timestamp without fetching all data.
 */
export async function getLastSyncTime(): Promise<string | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('updated_at')
    .eq('id', ROW_ID)
    .single();

  if (error || !data) return null;
  return data.updated_at as string;
}
