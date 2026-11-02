import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Image } from 'imagescript';
import { createLocalBackend } from '../server/local.mjs';

test('persistent local HTTP backend: authentication, finance, isolation, files and restart', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'mandap-api-test-'));
  const origin = 'http://127.0.0.1:5173';
  let backend = await createLocalBackend({ dataDir, origins: [origin] });
  let port = await backend.listen(0);
  let cookie = '';
  async function send(path, data, session = cookie) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, ...(session ? { Cookie: session } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
    const result = await response.json();
    return { status: response.status, data: result, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function call(name, args, session = cookie) {
    const response = await send('rpc', { name, args }, session);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return response.data;
  }
  const command = (mandap, action, data, key = randomUUID(), session = cookie) => call('command', { p_mandap: mandap, p_action: action, p_data: data, p_key: key }, session);
  async function signin(email) {
    const { data: sent, status } = await send('auth/code', { email });
    assert.equal(status, 200);
    const result = await send('auth/verify', { email, token: sent.localCode });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.match(result.cookie, /^mandap_local_session=/);
    return result.cookie;
  }
  try {
    await assert.rejects(createLocalBackend({ dataDir }), /already open/);
    assert.equal((await send('health')).data.persistent, true);
    assert.equal((await send('rpc', { name: 'workspace', args: { p_mandap: randomUUID() } }, '')).status, 401);
    const blocked = await fetch(`http://127.0.0.1:${port}/api/auth/code`, { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'blocked@example.test' }) });
    assert.equal(blocked.status, 403);
    const wrong = await send('auth/code', { email: 'limited@example.test' });
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await send('auth/verify', { email: 'limited@example.test', token: 'wrong' })).status, 400);
    assert.equal((await send('auth/verify', { email: 'limited@example.test', token: wrong.data.localCode })).status, 400);
    cookie = await signin('organizer@example.test');
    const ownerCookie = cookie;
    const mandap = await call('create_mandap', { p_name: 'Local Community', p_slug: 'local-community' });
    await command(mandap, 'settings', { name: 'Local Community', upi: '', published: true, transparency: true });
    const { id: festival } = await command(mandap, 'festival', { name: 'Community Festival', start_date: '2027-10-01', end_date: '2027-10-09', published: true });
    const { id: pooja } = await command(mandap, 'pooja', { festival_id: festival, name: 'Daily pooja', pricing: 'person_day', amount: 40000, capacity: 2, dates: ['2027-10-01'], opens_at: '2020-01-01', closes_at: '2099-01-01' });
    let page = await call('public_page', { p_slug: 'local-community' });
    await command(mandap, 'register', { pooja_id: pooja, family_name: 'Local family', participants: ['One', 'Two'], occurrence_ids: page.poojas[0].occurrences.map(o => o.id), amount: 1 });
    let workspace = await call('workspace', { p_mandap: mandap });
    assert.equal(workspace.commitments[0].amount, 80000);
    const { id: payment } = await command(mandap, 'submit_payment', { commitment_id: workspace.commitments[0].id, amount: 80000, method: 'cash', reference: '' });
    await Promise.all([command(mandap, 'verify', { payment_id: payment }), command(mandap, 'verify', { payment_id: payment })]);
    workspace = await call('workspace', { p_mandap: mandap });
    assert.equal(workspace.payments[0].receipt.number, 1);
    assert.equal(workspace.summary.collected, 80000);
    const { id: expense } = await command(mandap, 'expense', { festival_id: festival, title: 'Flowers', category: 'Decoration', amount: 10000, day: '2027-10-01', paid: true });
    await command(mandap, 'review_expense', { expense_id: expense, version: 1, state: 'approved' });
    const image = new Image(20, 20).fill(0xffaa44ff);
    const bytes = await image.encode();
    const form = new FormData();
    form.set('file', new Blob([bytes], { type: 'image/png' }), 'proof.png');
    form.set('mandap', mandap); form.set('target', payment); form.set('kind', 'payment');
    const upload = await fetch(`http://127.0.0.1:${port}/api/upload`, { method: 'POST', headers: { Origin: origin, Cookie: cookie }, body: form });
    assert.equal(upload.status, 200, await upload.text());
    workspace = await call('workspace', { p_mandap: mandap });
    const path = workspace.attachments[0].path;
    const link = await send('file-link', { path });
    assert.equal(link.status, 200);
    const file = await fetch(`http://127.0.0.1:${port}${link.data.signedUrl}`, { headers: { Cookie: cookie } });
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('content-type'), 'image/png');
    assert.ok((await file.arrayBuffer()).byteLength > 20);
    const anonymousFile = await fetch(`http://127.0.0.1:${port}${link.data.signedUrl}`);
    assert.equal(anonymousFile.status, 401);
    await backend.db.query("update local_runtime.links set expires_at=now()-interval '1 second'");
    const expiredFile = await fetch(`http://127.0.0.1:${port}${link.data.signedUrl}`, { headers: { Cookie: cookie } });
    assert.equal(expiredFile.status, 403);
    cookie = await signin('stranger@example.test');
    assert.equal((await send('file-link', { path })).status, 403);
    assert.equal((await call('workspace', { p_mandap: mandap })).payments.length, 0);
    await command(mandap, 'invite', { email: 'stranger@example.test', role: 'volunteer' }, randomUUID(), ownerCookie);
    assert.equal(await call('accept_invitations', {}), 1);
    assert.equal((await call('workspace', { p_mandap: mandap })).capabilities.register, true);
    assert.equal((await send('rpc', { name: 'command', args: { p_mandap: mandap, p_action: 'verify', p_data: { payment_id: payment }, p_key: randomUUID() } })).status, 400);
    const { id: slot } = await command(mandap, 'slot', { festival_id: festival, name: 'Prasadam', day: '2027-10-01', amount: 10000, capacity: 1 }, randomUUID(), ownerCookie);
    const bookingRequests = await Promise.all([1, 2].map(n => send('rpc', { name: 'command', args: { p_mandap: mandap, p_action: 'book', p_data: { slot_id: slot, sponsor: `Family ${n}`, public_name: false }, p_key: randomUUID() } })));
    assert.deepEqual(bookingRequests.map(r => r.status).sort(), [200, 400], 'simultaneous HTTP bookings reserve only one slot');
    await backend.close();
    backend = await createLocalBackend({ dataDir, origins: [origin] }); port = await backend.listen(0);
    cookie = ownerCookie;
    workspace = await call('workspace', { p_mandap: mandap });
    assert.equal(workspace.summary.balance, 70000);
    assert.equal(workspace.attachments[0].path, path);
    assert.equal(workspace.payments[0].receipt.number, 1);
    const restoredLink = await send('file-link', { path });
    const restoredFile = await fetch(`http://127.0.0.1:${port}${restoredLink.data.signedUrl}`, { headers: { Cookie: cookie } });
    assert.equal(restoredFile.status, 200);
    assert.ok((await restoredFile.arrayBuffer()).byteLength > 20);
    assert.equal((await send('session')).data.session.user.email, 'organizer@example.test');
    page = await call('public_page', { p_slug: 'local-community' }, '');
    assert.equal(page.summary.balance, 70000);
    await send('auth/signout', {});
    assert.equal((await send('session')).data.session, null);
  } finally { await backend.close(); await rm(dataDir, { recursive: true }); }
});
