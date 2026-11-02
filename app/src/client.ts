import { createClient } from '@supabase/supabase-js';
import { localClient } from './localClient';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const localMode = !(url && key);
const hostedClient = url && key ? createClient(url, key, {
  // Demo-mode convenience: Supabase's default mailer can only send its built-in magic-link
  // template (not the {{ .Token }} code this app's UI asks for) until custom SMTP is configured.
  // Detecting the session from the emailed link's URL lets sign-in work without Resend.
  // Implicit flow (not PKCE) puts the session tokens directly in the link so it also works
  // when the email is opened in a different browser/device than the one that requested it.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
}) : null;
export const client = hostedClient ?? localClient;

export function getClient() {
  if (!client) throw new Error('Backend configuration is missing.');
  return client;
}

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!client) throw new Error('Configure the Supabase URL and publishable key before using the app.');
  const { data, error } = hostedClient ? await hostedClient.rpc(name, args) : await localClient.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
