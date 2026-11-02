import { createServer } from 'node:http';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile, readdir, mkdir, open, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { Image } from 'imagescript';

const hash = value => createHash('sha256').update(value).digest('hex');
const rpcArguments = {
  my_workspaces: [], accept_invitations: [],
  create_mandap: ['p_name', 'p_slug'], public_page: ['p_slug'], workspace: ['p_mandap'],
  command: ['p_mandap', 'p_action', 'p_data', 'p_key'], can_download: ['p_path'],
};
const cookieName = 'mandap_local_session';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function body(request, max = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, 'Request exceeds the upload limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function json(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'JSON content type required.');
  try {
    const data = JSON.parse((await body(request)).toString());
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new HttpError(400, 'Object payload required.');
    return data;
  } catch (error) {
    if (error instanceof SyntaxError) throw new HttpError(400, 'Malformed JSON.');
    throw error;
  }
}

export async function createLocalBackend({ dataDir, origins = ['http://127.0.0.1:5173', 'http://localhost:5173'] } = {}) {
  if (!dataDir) throw new Error('A persistent data directory is required.');
  await mkdir(dataDir, { recursive: true });
  const lockPath = `${resolve(dataDir)}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(`Invalid local database lock at ${lockPath}. Verify no backend is running before removing it.`);
    try { process.kill(pid, 0); }
    catch (processError) {
      if (processError.code !== 'ESRCH') throw processError;
      await unlink(lockPath); lock = await open(lockPath, 'wx');
    }
    if (!lock) throw new Error('This local database is already open in another process. Use the existing API.');
  }
  await lock.writeFile(String(process.pid));
  const db = new PGlite(dataDir);
  try {
    const { rows } = await db.query("select to_regclass('local_runtime.migrations') initialized");
    if (!rows[0].initialized) await db.exec(await readFile(new URL('./bootstrap.sql', import.meta.url), 'utf8'));
    const directory = new URL('../../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      const source = await readFile(new URL(name, directory), 'utf8');
      const { rows: applied } = await db.query('select checksum from local_runtime.migrations where name=$1', [name]);
      if (applied.length) {
        if (applied[0].checksum !== hash(source)) throw new Error(`Applied migration ${name} changed. Add a new migration; do not overwrite local data.`);
      } else {
        await db.transaction(async tx => {
          await tx.exec(source);
          await tx.query('insert into local_runtime.migrations values($1,$2)', [name, hash(source)]);
        });
      }
    }
  } catch (error) { await db.close(); await lock.close(); await unlink(lockPath); throw error; }

  async function session(request) {
    const token = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const { rows } = await db.query('select u.id,u.email from local_runtime.sessions s join auth.users u on u.id=s.user_id where s.hash=$1 and s.expires_at>now()', [hash(token)]);
    return rows[0] ?? null;
  }
  async function call(tx, user, name, args) {
    const keys = rpcArguments[name];
    if (!keys) throw new HttpError(404, 'Unknown backend operation.');
    if (name !== 'public_page' && !user) throw new HttpError(401, 'Sign in first.');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user?.id ?? '']);
    await tx.query("select set_config('request.jwt.claims','{}',true)");
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    const parameters = keys.map(key => {
      if (!(key in args)) throw new HttpError(400, `Missing ${key}.`);
      return args[key];
    });
    const { rows } = await tx.query(`select public.${name}(${parameters.map((_, i) => `$${i + 1}`).join(',')}) value`, parameters);
    await tx.exec('reset role');
    return rows[0].value;
  }
  const rpc = (user, name, args) => db.transaction(tx => call(tx, user, name, args));
  function requireUser(user) { if (!user) throw new HttpError(401, 'Sign in first.'); }
  const rates = new Map();
  function rate(key, limit) {
    const current = rates.get(key);
    const next = !current || current.until < Date.now() ? { count: 0, until: Date.now() + 60000 } : current;
    next.count++; rates.set(key, next);
    if (next.count > limit) throw new HttpError(429, 'Too many requests. Wait a minute before retrying.');
  }
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const reply = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    try {
      if (request.headers.host !== `127.0.0.1:${server.address().port}`) throw new HttpError(403, 'Invalid local API host.');
      const origin = request.headers.origin;
      if ((origin && !origins.includes(origin)) || request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Local API origin denied.');
      if (request.method !== 'GET' && (!origin || !origins.includes(origin))) throw new HttpError(403, 'A trusted local origin is required.');
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/health') return reply(200, { mode: 'local', persistent: true });
      const user = await session(request);
      if (request.method === 'GET' && url.pathname === '/api/session') return reply(200, { session: user ? { user } : null });
      if (request.method === 'POST' && url.pathname === '/api/auth/code') {
        rate('code', 20);
        const { email: raw } = await json(request);
        const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
        const { rows: previous } = await db.query("select 1 from local_runtime.codes where email=$1 and last_sent>now()-interval '30 seconds'", [email]);
        if (previous.length) throw new HttpError(429, 'Wait 30 seconds before requesting another code.');
        const code = String(randomInt(100000, 1000000));
        await db.query("insert into local_runtime.codes(email,hash,expires_at) values($1,$2,now()+interval '5 minutes') on conflict(email) do update set hash=excluded.hash,expires_at=excluded.expires_at,attempts=0,last_sent=now()", [email, hash(`${email}:${code}`)]);
        // ponytail: loopback development inbox, replace with real email delivery before hosting.
        return reply(200, { localCode: code });
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/verify') {
        rate('verify', 30);
        const data = await json(request);
        const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
        const token = typeof data.token === 'string' ? data.token : '';
        const result = await db.transaction(async tx => {
          const { rows } = await tx.query('select * from local_runtime.codes where email=$1 and expires_at>now() and attempts<5 for update', [email]);
          if (!rows.length) return null;
          await tx.query('update local_runtime.codes set attempts=attempts+1 where email=$1', [email]);
          if (!timingSafeEqual(Buffer.from(rows[0].hash, 'hex'), Buffer.from(hash(`${email}:${token}`), 'hex'))) return null;
          await tx.query('delete from local_runtime.codes where email=$1', [email]);
          const { rows: users } = await tx.query('insert into auth.users(email,email_confirmed_at) values($1,now()) on conflict(email) do update set email_confirmed_at=now() returning id,email', [email]);
          const secret = randomBytes(32).toString('hex');
          await tx.query("delete from local_runtime.sessions where expires_at<now()");
          await tx.query("insert into local_runtime.sessions values($1,$2,now()+interval '12 hours')", [hash(secret), users[0].id]);
          return { user: users[0], secret };
        });
        if (!result) throw new HttpError(400, 'Code is invalid, expired or has too many attempts.');
        response.setHeader('Set-Cookie', `${cookieName}=${result.secret}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=43200`);
        return reply(200, { session: { user: result.user } });
      }
      if (request.method === 'POST' && url.pathname === '/api/auth/signout') {
        const token = request.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
        if (token) await db.query('delete from local_runtime.sessions where hash=$1', [hash(token)]);
        response.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0`);
        return reply(200, { signedOut: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/rpc') {
        const { name, args } = await json(request);
        if (typeof name !== 'string' || !Object.hasOwn(rpcArguments, name) || !args || typeof args !== 'object' || Array.isArray(args)) throw new HttpError(400, 'Invalid RPC request.');
        if (name === 'command' && args.p_action === 'attach') throw new HttpError(403, 'Use the authorized upload endpoint.');
        return reply(200, await rpc(user, name, args));
      }
      if (request.method === 'POST' && url.pathname === '/api/invite') {
        requireUser(user); rate('invite', 20);
        const input = await json(request);
        const result = await rpc(user, 'command', { p_mandap: input.mandap, p_action: 'invite', p_key: input.key, p_data: { email: input.email, role: input.role } });
        return reply(200, { ...result, delivery: 'local', message: 'Local invitation saved. Sign in with the invited email to accept; no email was sent.' });
      }
      if (request.method === 'POST' && url.pathname === '/api/upload') {
        requireUser(user);
        const buffer = await body(request, 5400000);
        const form = await new Response(buffer, { headers: { 'Content-Type': request.headers['content-type'] ?? '' } }).formData();
        const file = form.get('file'), mandap = String(form.get('mandap') ?? ''), target = String(form.get('target') ?? ''), kind = String(form.get('kind') ?? '');
        if (!(file instanceof File) || file.type !== 'image/png' || file.size < 24 || file.size > 5242880 || !['payment','expense'].includes(kind)) throw new HttpError(400, 'Choose a PNG under 5 MB and a valid target.');
        const workspace = await rpc(user, 'workspace', { p_mandap: mandap });
        if (!(kind === 'payment' ? workspace.payments : workspace.expenses).some(record => record.id === target)) throw new HttpError(403, 'Upload target unavailable.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (![137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) throw new HttpError(400, 'Invalid PNG image.');
        const header = new DataView(bytes.buffer);
        if (!header.getUint32(16) || !header.getUint32(20) || header.getUint32(16) > 1600 || header.getUint32(20) > 1600) throw new HttpError(400, 'Image exceeds 1600 pixels.');
        let clean;
        try { clean = await (await Image.decode(bytes)).encode(); }
        catch { throw new HttpError(400, 'The image is damaged or could not be decoded.'); }
        if (clean.length > 5242880) throw new HttpError(413, 'Processed image exceeds 5 MB.');
        const path = `${mandap}/${user.id}/${crypto.randomUUID()}.png`;
        await db.transaction(async tx => {
          await tx.query("insert into storage.objects(bucket_id,name) values('evidence',$1)", [path]);
          await tx.query('insert into local_runtime.files values($1,$2)', [path, clean]);
          await call(tx, user, 'command', { p_mandap: mandap, p_action: 'attach', p_key: crypto.randomUUID(), p_data: { kind, target_id: target, path } });
        });
        return reply(200, { uploaded: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/file-link') {
        requireUser(user);
        const { path } = await json(request);
        if (typeof path !== 'string' || !await rpc(user, 'can_download', { p_path: path })) throw new HttpError(403, 'File access denied.');
        const token = randomBytes(32).toString('hex');
        await db.query('delete from local_runtime.links where expires_at<now()');
        await db.query("insert into local_runtime.links values($1,$2,$3,now()+interval '60 seconds')", [hash(token), path, user.id]);
        return reply(200, { signedUrl: `/api/files/${token}` });
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/files/')) {
        requireUser(user);
        const { rows } = await db.query('select path from local_runtime.links where token=$1 and user_id=$2 and expires_at>now()', [hash(url.pathname.slice(11)), user.id]);
        if (!rows.length || !await rpc(user, 'can_download', { p_path: rows[0].path })) throw new HttpError(403, 'File link expired or access denied.');
        const { rows: files } = await db.query('select bytes from local_runtime.files where path=$1', [rows[0].path]);
        if (!files.length) throw new HttpError(404, 'File not found.');
        response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="mandap-evidence.png"' });
        return response.end(Buffer.from(files[0].bytes));
      }
      throw new HttpError(404, 'Endpoint not found.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error.code ? 400 : 500;
      if (status >= 500) console.error('Local API failure:', error.message);
      reply(status, { error: status >= 500 ? 'Local backend failed. Check the server output.' : error.message });
    }
  });
  server.requestTimeout = 15000;
  return {
    server, db,
    async listen(port = 4318) {
      await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
      return server.address().port;
    },
    async close() {
      await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
      await db.close();
      await lock.close(); await unlink(lockPath);
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.MANDAP_DATA_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../.mandap-data');
  const backend = await createLocalBackend({ dataDir, ...(process.env.MANDAP_WEB_ORIGIN ? { origins: [process.env.MANDAP_WEB_ORIGIN] } : {}) });
  const port = await backend.listen(Number(process.env.MANDAP_API_PORT ?? 4318));
  console.log(`Mandap local API ready at http://127.0.0.1:${port} (persistent local development; not for public hosting)`);
  let closing = false;
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => {
    if (closing) return;
    closing = true; await backend.close(); process.exit(0);
  });
}
