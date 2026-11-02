import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { minorUnits, csv, pricePreview } from '../src/domain.ts';

test('money parsing and CSV remain exact and spreadsheet-safe', () => {
  assert.equal(minorUnits('400'), 40000);
  assert.equal(minorUnits('0.01'), 1);
  assert.equal(minorUnits('100.10'), 10010);
  assert.equal(pricePreview('person_day', 40000, 2, 9, 0), 720000);
  assert.equal(pricePreview('package', 360000, 2, 9, 0), 720000);
  assert.equal(pricePreview('family_day', 40000, 4, 2, 0), 80000);
  assert.equal(pricePreview('free', 40000, 4, 2, 0), 0);
  for (const value of ['-1', '1.001', '1e3', 'NaN', '', ' 1', '1.']) assert.throws(() => minorUnits(value));
  assert.equal(csv([{ name: '=2+2', amount: 10 }]), '"name","amount"\r\n"\'=2+2","10"');
  assert.match(csv([{ name: ' \t@SUM(A1)', note: '"quoted"\nline' }]), /'\s+@SUM/);
});

test('real PostgreSQL migration, tenant boundaries and financial lifecycle', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('../server/bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../supabase/migrations/202610300001_pilot.sql', import.meta.url), 'utf8'));
    const owner = randomUUID(), devotee = randomUUID(), outsider = randomUUID();
    for (const [id, email] of [[owner, 'owner@example.test'], [devotee, 'devotee@example.test'], [outsider, 'other@example.test']]) {
      await db.query('insert into auth.users values($1,$2,now())', [id, email]);
    }
    const identity = async (id, role = 'authenticated') => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
      await db.exec(`set role ${role}`);
    };
    const rpc = async (name, args = []) => {
      const placeholders = args.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await db.query(`select public.${name}(${placeholders}) value`, args);
      return rows[0].value;
    };
    const command = (m, action, payload, key = randomUUID()) => rpc('command', [m, action, payload, key]);
    await identity(owner);
    const mandap = await rpc('create_mandap', ['Pilot Mandap', 'pilot-mandap']);
    await command(mandap, 'settings', { name: 'Pilot Mandap', upi: 'pilot@upi', published: true, transparency: true });
    const { id: festival } = await command(mandap, 'festival', { name: 'Pilot Festival', start_date: '2027-10-01', end_date: '2027-10-09', published: true });
    const { id: pooja } = await command(mandap, 'pooja', {
      festival_id: festival, name: 'Daily pooja', pricing: 'person_day', amount: 40000, capacity: 2,
      dates: ['2027-10-01', '2027-10-02'], opens_at: '2020-01-01', closes_at: '2099-01-01',
    });
    const publicPage = await rpc('public_page', ['pilot-mandap']);
    assert.equal(publicPage.poojas.length, 1);
    const occurrences = publicPage.poojas[0].occurrences.map(o => o.id);
    await identity(devotee);
    await assert.rejects(command(mandap, 'settings', { name: 'Hijacked' }), /Owner permission/);
    const registrationPayload = { pooja_id: pooja, family_name: 'Test family', mobile: '', participants: ['One', 'Two'], occurrence_ids: occurrences, amount: 1 };
    const key = randomUUID();
    const registration = await command(mandap, 'register', registrationPayload, key);
    assert.deepEqual(await command(mandap, 'register', registrationPayload, key), registration);
    await assert.rejects(command(mandap, 'register', { ...registrationPayload, amount: 2 }, key), /different payload/);
    let workspace = await rpc('workspace', [mandap]);
    assert.equal(workspace.commitments[0].amount, 160000, 'server ignores a forged price');
    const commitment = workspace.commitments[0].id;
    await assert.rejects(command(mandap, 'register', registrationPayload), /Not enough places/);
    const { id: payment } = await command(mandap, 'submit_payment', { commitment_id: commitment, amount: 100000, method: 'upi', reference: 'TEST-123' });
    await assert.rejects(command(mandap, 'verify', { payment_id: payment }), /Permission denied/);
    await identity(outsider);
    workspace = await rpc('workspace', [mandap]);
    assert.equal(workspace.commitments.length, 0);
    assert.equal(workspace.families.length, 0);
    await assert.rejects(command(mandap, 'submit_payment', { commitment_id: commitment, amount: 1, method: 'cash' }), /permission denied/i);
    await identity(owner);
    await command(mandap, 'verify', { payment_id: payment });
    await command(mandap, 'verify', { payment_id: payment });
    const { id: duplicate } = await command(mandap, 'submit_payment', { commitment_id: commitment, amount: 100, method: 'upi', reference: ' test-123 ' });
    await assert.rejects(command(mandap, 'verify', { payment_id: duplicate }), /verified_transaction_reference/);
    await command(mandap, 'reject_payment', { payment_id: duplicate });
    workspace = await rpc('workspace', [mandap]);
    assert.equal(workspace.payments.find(p => p.id === payment).receipt.number, 1);
    assert.equal(workspace.summary.collected, 100000);
    assert.equal(workspace.summary.outstanding, 60000);
    const { id: tooMuch } = await command(mandap, 'submit_payment', { commitment_id: commitment, amount: 70000, method: 'cash' });
    await assert.rejects(command(mandap, 'verify', { payment_id: tooMuch }), /exceeds outstanding/);
    await command(mandap, 'reject_payment', { payment_id: tooMuch });
    const { id: expense } = await command(mandap, 'expense', { festival_id: festival, title: 'Flowers', category: 'Decoration', amount: 20000, day: '2027-10-01', paid: true });
    await command(mandap, 'review_expense', { expense_id: expense, version: 1, state: 'approved' });
    await assert.rejects(command(mandap, 'review_expense', { expense_id: expense, version: 1, state: 'approved' }), /changed/);
    await assert.rejects(command(mandap, 'review_expense', { expense_id: expense, state: 'approved' }), /changed/);
    const refundKey = randomUUID();
    const refundData = { payment_id: payment, amount: 10000, reason: 'Recorded bank refund' };
    const refundResult = await command(mandap, 'refund', refundData, refundKey);
    assert.deepEqual(await command(mandap, 'refund', refundData, refundKey), refundResult);
    await assert.rejects(command(mandap, 'refund', { payment_id: payment, amount: 100000, reason: 'Too much' }), /exceeds remaining/);
    workspace = await rpc('workspace', [mandap]);
    assert.equal(workspace.summary.balance, 70000);
    assert.equal(workspace.summary.outstanding, 70000);
    await command(mandap, 'cancel', { commitment_id: commitment });
    workspace = await rpc('workspace', [mandap]);
    assert.equal(workspace.summary.outstanding, 0);
    assert.equal(workspace.summary.balance, 70000, 'cancellation does not fake a refund');
    assert.equal((await rpc('public_page', ['pilot-mandap'])).poojas[0].occurrences[0].booked, 0);
    const { id: slot } = await command(mandap, 'slot', { festival_id: festival, name: 'Prasadam', day: '2027-10-01', amount: 50000, capacity: 1 });
    await identity(devotee);
    await command(mandap, 'book', { slot_id: slot, sponsor: 'Anonymous family', public_name: false });
    await identity(outsider);
    await assert.rejects(command(mandap, 'book', { slot_id: slot, sponsor: 'Other family', public_name: true }), /unavailable/);
    const otherMandap = await rpc('create_mandap', ['Other Mandap', 'other-mandap']);
    await assert.rejects(command(otherMandap, 'slot', { festival_id: festival, name: 'Cross tenant', day: '2027-10-01', amount: 1, capacity: 1 }), /inside this festival/);
    await assert.rejects(db.query('select * from private.payments'), /permission denied/);
    await identity(null, 'anon');
    const published = await rpc('public_page', ['pilot-mandap']);
    assert.equal(published.summary.balance, 70000);
    assert.equal(published.sponsors.length, 0);
    assert.equal(published.summary.pledged, undefined);
    assert.equal(published.payments, undefined);
    await assert.rejects(rpc('workspace', [mandap]), /permission denied/);
    await identity(owner);
    await command(mandap, 'invite', { email: 'other@example.test', role: 'volunteer' });
    await identity(outsider);
    assert.equal(await rpc('accept_invitations'), 1);
    await assert.rejects(command(mandap, 'verify', { payment_id: payment }), /Permission denied/);
    await identity(owner);
    await command(mandap, 'member', { user_id: outsider, active: false, role: 'volunteer', permissions: [] });
    await identity(outsider);
    assert.equal((await rpc('workspace', [mandap])).capabilities.member, false);
    await assert.rejects(command(mandap, 'expense', { festival_id: festival, title: 'Denied', category: 'Test', amount: 1, day: '2027-10-01', paid: true }), /Permission denied/);
    await db.exec('reset role');
    await db.query("insert into auth.mfa_factors values($1,'verified','totp')", [owner]);
    await identity(owner);
    await assert.rejects(rpc('workspace', [mandap]), /Authenticator verification required/);
    await db.query("select set_config('request.jwt.claims','{\"aal\":\"aal2\"}',false)");
    assert.equal((await rpc('workspace', [mandap])).capabilities.owner, true);
    const { id: returned } = await command(mandap, 'expense', { festival_id: festival, title: 'Returned bill', category: 'Test', amount: 100, day: '2027-10-01', paid: false });
    await command(mandap, 'review_expense', { expense_id: returned, version: 1, state: 'correction', note: 'Wrong amount' });
    await command(mandap, 'correct_expense', { expense_id: returned, version: 2, amount: 200, note: 'Correct amount' });
    await command(mandap, 'review_expense', { expense_id: returned, version: 3, state: 'approved' });
    await command(mandap, 'pay_expense', { expense_id: returned, version: 4 });
    assert.equal((await rpc('workspace', [mandap])).summary.balance, 69800);
    for (const [mode, expected] of [['person',80000],['person_day',160000],['family',40000],['family_day',80000],['package',80000],['fixed',40000],['custom',12345],['suggested',12345],['free',0]]) {
      const { id } = await command(mandap, 'pooja', {
        festival_id: festival, name: `Pricing ${mode}`, pricing: mode, amount: 40000, capacity: 2,
        dates: ['2027-10-03','2027-10-04'], opens_at: '2020-01-01', closes_at: '2099-01-01',
      });
      const current = (await rpc('public_page', ['pilot-mandap'])).poojas.find(p => p.id === id);
      const { id: registrationId } = await command(mandap, 'register', {
        pooja_id: id, family_name: 'Pricing test', participants: ['One','Two'],
        occurrence_ids: current.occurrences.map(o => o.id), amount: 12345,
      });
      const record = (await rpc('workspace', [mandap])).registrations.find(r => r.id === registrationId);
      assert.equal(record.amount, expected, mode);
    }
  } finally { await db.close(); }
});
