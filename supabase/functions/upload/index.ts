import { createClient } from 'npm:@supabase/supabase-js@2.80.0';
import { Image } from 'npm:imagescript@1.3.0';
import { config, identity, serve } from '../_shared/http.ts';

Deno.serve(request => serve(request, async () => {
  const { client, user } = await identity(request);
  const body = await request.formData();
  const file = body.get('file');
  const mandap = String(body.get('mandap') ?? '');
  const target = String(body.get('target') ?? '');
  const kind = String(body.get('kind') ?? '');
  if (!(file instanceof File) || file.type !== 'image/png' || file.size < 24 || file.size > 5242880) throw new Error('A PNG image under 5 MB is required');
  if (!/^[0-9a-f-]{36}$/i.test(mandap) || !/^[0-9a-f-]{36}$/i.test(target) || !['payment', 'expense'].includes(kind)) throw new Error('Invalid upload target');
  const { data: workspace, error: accessError } = await client.rpc('workspace', { p_mandap: mandap });
  if (accessError) throw new Error(accessError.message);
  const records = kind === 'payment' ? workspace.payments : workspace.expenses;
  if (!records.some((record: { id: string }) => record.id === target)) throw new Error('Upload target is not accessible');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) throw new Error('Invalid PNG signature');
  const header = new DataView(bytes.buffer);
  const width = header.getUint32(16), height = header.getUint32(20);
  if (!width || !height || width > 1600 || height > 1600) throw new Error('Image dimensions must not exceed 1600 pixels');
  const image = await Image.decode(bytes);
  const clean = await image.encode();
  if (clean.length > 5242880) throw new Error('Processed image exceeds 5 MB');
  const path = `${mandap}/${user.id}/${crypto.randomUUID()}.png`;
  const admin = createClient(config('SUPABASE_URL'), config('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { error: uploadError } = await admin.storage.from('evidence').upload(path, clean, { contentType: 'image/png', upsert: false });
  if (uploadError) throw new Error('Storage upload failed');
  const { error: attachError } = await client.rpc('command', {
    p_mandap: mandap, p_action: 'attach', p_key: crypto.randomUUID(),
    p_data: { kind, target_id: target, path },
  });
  if (attachError) {
    const { error: cleanupError } = await admin.storage.from('evidence').remove([path]);
    if (cleanupError) console.error('Orphaned image needs operator cleanup:', path);
    throw new Error(attachError.message);
  }
  return { uploaded: true };
}));
