import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing backup configuration: ${name}`);
  return value;
}
const endpoint = required('R2_ENDPOINT');
const bucket = required('R2_BUCKET');
const recipient = required('AGE_RECIPIENT');
const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const database = required('DATABASE_URL');
const prefix = `mandap/${new Date().toISOString().replaceAll(':', '-')}`;
const manifest = { created_at: new Date().toISOString(), database: 'database.dump.age', files: [] };

function exit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${child.spawnfile} failed (${code})`)));
  });
}
async function encryptedUpload(stream, key, producer) {
  const encrypt = spawn('age', ['--encrypt', '--recipient', recipient], { stdio: ['pipe', 'pipe', 'inherit'] });
  const upload = spawn('aws', ['s3', 'cp', '-', `s3://${bucket}/${prefix}/${key}`, '--endpoint-url', endpoint, '--only-show-errors'], { stdio: ['pipe', 'inherit', 'inherit'] });
  try {
    await Promise.all([exit(encrypt), exit(upload), producer ? exit(producer) : Promise.resolve(), pipeline(stream, encrypt.stdin), pipeline(encrypt.stdout, upload.stdin)]);
  } finally {
    for (const child of [producer, encrypt, upload]) if (child && child.exitCode === null) child.kill();
  }
}
async function files(folder = '') {
  let offset = 0;
  for (;;) {
    const { data, error } = await client.storage.from('evidence').list(folder, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error('Cannot enumerate backup files');
    for (const object of data) {
      const path = folder ? `${folder}/${object.name}` : object.name;
      if (!object.id) { await files(path); continue; }
      const { data: blob, error: downloadError } = await client.storage.from('evidence').download(path);
      if (downloadError) throw new Error('Cannot download a backup file');
      const bytes = Buffer.from(await blob.arrayBuffer());
      await encryptedUpload(Readable.from([bytes]), `evidence/${path}.age`);
      manifest.files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    if (data.length < 100) break;
    offset += data.length;
  }
}

const dump = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--schema=private', '--schema=auth', '--schema=storage'], {
  env: { ...process.env, PGDATABASE: database }, stdio: ['ignore', 'pipe', 'inherit'],
});
await encryptedUpload(dump.stdout, 'database.dump.age', dump);
await files();
await encryptedUpload(Readable.from([JSON.stringify(manifest)]), 'manifest.json.age');
console.log(`Encrypted recovery set completed: ${prefix}; ${manifest.files.length} files.`);
