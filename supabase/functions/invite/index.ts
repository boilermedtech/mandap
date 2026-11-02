import { config, identity, serve } from '../_shared/http.ts';

Deno.serve(request => serve(request, async () => {
  const { client } = await identity(request);
  const input = await request.json();
  if (typeof input.email !== 'string' || typeof input.mandap !== 'string' || typeof input.role !== 'string' || typeof input.key !== 'string') throw new Error('Invalid invitation');
  const { error } = await client.rpc('command', {
    p_mandap: input.mandap, p_action: 'invite',
    p_data: { email: input.email, role: input.role }, p_key: input.key,
  });
  if (error) throw new Error(error.message);
  const { data: spaces, error: spacesError } = await client.rpc('my_workspaces');
  if (spacesError) throw new Error(spacesError.message);
  const mandap = spaces.find((space: { id: string }) => space.id === input.mandap);
  if (!mandap) throw new Error('Mandap unavailable');
  const url = new URL(config('APP_ORIGIN'));
  url.searchParams.set('mandap', mandap.slug);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': input.key },
    body: JSON.stringify({
      from: config('INVITE_FROM'), to: [input.email], subject: 'Your Mandap committee invitation',
      text: `You have been invited to a Mandap committee. Sign in with this email address to accept: ${url.toString()}\nThis invitation expires in seven days.`,
    }),
  });
  if (!response.ok) throw new Error(`Email provider rejected the invitation (HTTP ${response.status}). Invitation remains pending; check email capacity before retrying.`);
  return { sent: true };
}));
