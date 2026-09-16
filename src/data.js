import { createClient } from '@supabase/supabase-js';
import { validateSnapshot } from './model.js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key, { auth: { storageKey: 'beu-work-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
export async function loadSnapshot(signal) {
  // No direct tasks query or fallback: an absent/denied endpoint fails closed.
  const { data, error } = await supabase.rpc('beu_work_snapshot').abortSignal(signal);
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Shared-work monitoring is awaiting the approved database setup. No personal tasks have been loaded.');
    if (error.code === '42501') throw new Error('Your account does not yet have BEU Work monitoring access. Contact your administrator.');
    throw new Error('Could not refresh shared work. Check your connection and try again.');
  }
  const snapshot = validateSnapshot(data);
  const people = await Promise.all(snapshot.people.map(async person => {
    if (!person.avatar_path) return person;
    const { data: signed, error: avatarError } = await supabase.storage.from('profile-avatars').createSignedUrl(person.avatar_path, 3600);
    return avatarError ? person : { ...person, avatar_url: signed.signedUrl };
  }));
  return { ...snapshot, people };
}
