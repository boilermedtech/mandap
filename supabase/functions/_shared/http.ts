import { createClient } from 'npm:@supabase/supabase-js@2.80.0';

export function config(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

export function headers(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = config('APP_ORIGIN');
  if (origin && origin !== allowed) throw new Error('Origin not allowed');
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
}

export async function identity(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new Error('Authentication required');
  const client = createClient(config('SUPABASE_URL'), config('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Authentication required');
  return { client, user: data.user };
}

export async function serve(request: Request, action: () => Promise<unknown>) {
  let cors: Record<string, string>;
  try { cors = headers(request); }
  catch { return Response.json({ error: 'Origin not allowed or server misconfigured' }, { status: 403 }); }
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  try { return Response.json(await action(), { headers: cors }); }
  catch (error) {
    console.error('Mandap function failed:', error instanceof Error ? error.message : 'Unexpected failure');
    return Response.json({ error: error instanceof Error ? error.message : 'Operation failed' }, { status: 400, headers: cors });
  }
}
