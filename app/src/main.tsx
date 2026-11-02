import { Children, cloneElement, isValidElement, StrictMode, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, Button, Badge, Avatar, Progress, Tooltip, createTheme, useMantineColorScheme, useComputedColorScheme } from '@mantine/core';
import { LayoutDashboard, CalendarDays, Wallet, ReceiptText, Settings2, ArrowUpRight, ArrowRight, ShieldCheck, Database, CircleHelp, LogOut, Bell, HeartHandshake, Plus, ChevronRight, Landmark, Sun, Moon } from 'lucide-react';
import '@mantine/core/styles.css';
import QRCode from 'qrcode';
import { client, getClient, localMode, rpc } from './client';
import { Captcha } from './Captcha';
import { csv, minorUnits, money, pricePreview } from './domain';
import type { Page, Payment, Summary, Workspace, WorkspaceLink } from './types';
import './style.css';

type FormValues = FormData;
const field = (data: FormValues, key: string) => String(data.get(key) ?? '').trim();
const amount = (data: FormValues, key = 'amount') => minorUnits(field(data, key));
const today = () => new Date().toLocaleDateString('en-CA');
const tabs = ['Home', 'Register', 'Payments', 'Expenses', 'Manage'] as const;
type Tab = typeof tabs[number];
const tabIcons = { Home: LayoutDashboard, Register: CalendarDays, Payments: Wallet, Expenses: ReceiptText, Manage: Settings2 };
const theme = createTheme({
  primaryColor: 'teal', primaryShade: { light: 8, dark: 8 }, defaultRadius: 'sm',
  fontFamily: 'var(--font-body)', headings: { fontFamily: 'var(--font-body)' },
  colors: {
    dark: ['#eff4f1', '#d1ded7', '#b0c1b9', '#8caaa0', '#637d72', '#425b50', '#30463c', '#24362d', '#192a23', '#13211b'],
    teal: ['#edf8f3', '#d5eee3', '#b0dfcb', '#88cdb1', '#5fb697', '#3d9b7d', '#27846a', '#1d7563', '#126354', '#104e43'],
  },
});

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const dark = useComputedColorScheme('light') === 'dark';
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim());
  }, [dark]);
  return <button className="theme-toggle" aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`} onClick={() => setColorScheme(dark ? 'light' : 'dark')}>
    {dark ? <Sun size={18} /> : <Moon size={18} />}<span>{dark ? 'Light mode' : 'Dark mode'}</span>
  </button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{Children.map(children, child =>
    isValidElement<{ id?: string }>(child) && typeof child.type === 'string' && ['input', 'textarea', 'select'].includes(child.type)
      ? cloneElement(child, { id }) : child)}</div>;
}

function ActionForm({ title, children, submit, onSubmit, disabled = false, preview }: {
  title: string; children: ReactNode; submit: string;
  onSubmit: (data: FormData) => Promise<void>; disabled?: boolean;
  preview?: (data: FormData | null) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [values, setValues] = useState<FormData | null>(null);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setMessage(''); setFailed(false);
    try { await onSubmit(data); setMessage('Saved successfully.'); }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Operation failed. Please retry.'); }
    finally { setBusy(false); }
  }
  return <form className="card" onSubmit={handle} onChange={event => setValues(new FormData(event.currentTarget))}>
    <h2>{title}</h2><fieldset disabled={busy || disabled}>{children}{preview && <p className="estimate" role="status">{preview(values)}</p>}<Button type="submit" fullWidth loading={busy} disabled={disabled} rightSection={<ArrowRight size={16} />}>{submit}</Button></fieldset>
    <p className={failed ? 'error' : 'success'} role={failed ? 'alert' : 'status'}>{message}</p>
  </form>;
}

function UpiQr({ value }: { value: string }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 240, margin: 2 }).then(data => { if (active) setImage(data); }).catch(() => { if (active) setError('QR generation failed. Use the displayed UPI ID instead.'); });
    return () => { active = false; };
  }, [value]);
  return error ? <p role="alert">{error}</p> : image ? <img className="qr" src={image} alt="Scan to pay this Mandap using UPI" /> : <p role="status">Preparing UPI QR...</p>;
}

function SummaryCards({ summary }: { summary: Summary }) {
  const labels: [keyof Summary, string][] = [
    ['balance', 'Available balance'], ['collected', 'Confirmed collections'], ['refunded', 'Refunds'], ['expenses', 'Approved paid expenses'],
    ['approved_unpaid', 'Approved, not yet paid'],
    ['pledged', 'Net pledged'], ['outstanding', 'Outstanding commitments'],
  ];
  return <div className="metrics">{labels.filter(([key]) => summary[key] !== undefined).map(([key, label]) =>
    <article key={key} className={key === 'balance' ? 'metric-primary' : undefined}><span>{label}</span><strong>{money(summary[key] ?? 0)}</strong>{key === 'balance' && <small>After refunds and paid expenses</small>}</article>)}</div>;
}

function App() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [localCode, setLocalCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaEpoch, setCaptchaEpoch] = useState(0);
  const siteKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '');
  const [links, setLinks] = useState<WorkspaceLink[]>([]);
  const [slug, setSlug] = useState(new URLSearchParams(location.search).get('mandap') ?? '');
  const [page, setPage] = useState<Page | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>('Home');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [mfa, setMfa] = useState<{ id: string; qr: string } | null>(null);
  const [mfaLogin, setMfaLogin] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState('');
  const pendingRequests = useRef(new Map<string, string>());
  const authEpoch = useRef(0);
  const authUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!client) { setAuthReady(true); return; }
    let active = true;
    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      authUserId.current = data.session?.user.id ?? null;
      setUser(data.session?.user ?? null); setAuthReady(true);
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id ?? null;
      if (authUserId.current !== nextId) {
        authEpoch.current++; setWorkspace(null); setLinks([]);
        authUserId.current = nextId;
      }
      if (event === 'SIGNED_OUT') { pendingRequests.current.clear(); setReceipt(null); setFamilyId(''); }
      setUser(session?.user ?? null); setAuthReady(true);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user || !client || localMode) { setMfaLogin(null); return; }
    let active = true;
    async function check() {
      const { data: assurance, error: issue } = await getClient().auth.mfa.getAuthenticatorAssuranceLevel();
      if (issue) throw issue;
      if (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
        const { data, error: factorError } = await getClient().auth.mfa.listFactors();
        if (factorError) throw factorError;
        const factor = data.totp.find(f => f.status === 'verified');
        if (active && factor) setMfaLogin(factor.id);
      }
    }
    void check().catch(issue => { if (active) setError(issue instanceof Error ? issue.message : 'Could not check authenticator status.'); });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener('online', changed); window.addEventListener('offline', changed);
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed); };
  }, []);

  async function refresh() {
    if (!client) return;
    const epoch = authEpoch.current;
    setLoading(true);
    try {
      const spaces = user ? await rpc<WorkspaceLink[]>('my_workspaces') : [];
      if (slug) {
        const next = await rpc<Page>('public_page', { p_slug: slug });
        const data = user ? await rpc<Workspace>('workspace', { p_mandap: next.id }) : null;
        if (epoch !== authEpoch.current) return;
        setLinks(spaces); setPage(next); setWorkspace(data);
      } else if (epoch === authEpoch.current) { setLinks(spaces); setPage(null); setWorkspace(null); }
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let cancelled = false;
    setPage(null); setWorkspace(null); setReceipt(null); setError('');
    async function load() {
      if (!client || !authReady) return;
      setLoading(true);
      try {
        if (user) {
          await rpc<number>('accept_invitations');
          const spaces = await rpc<WorkspaceLink[]>('my_workspaces');
          if (!cancelled) setLinks(spaces);
        }
        if (slug) {
          const next = await rpc<Page>('public_page', { p_slug: slug });
          const data = user ? await rpc<Workspace>('workspace', { p_mandap: next.id }) : null;
          if (!cancelled) { setPage(next); setWorkspace(data); }
        }
      } catch (issue) { if (!cancelled) setError(issue instanceof Error ? issue.message : 'Could not load records.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [slug, user?.id, authReady]);

  function navigate(next: string) {
    const url = new URL(location.href);
    if (next) url.searchParams.set('mandap', next); else url.searchParams.delete('mandap');
    history.pushState(null, '', url);
    setSlug(next); setTab('Home');
  }
  useEffect(() => {
    const pop = () => { setSlug(new URLSearchParams(location.search).get('mandap') ?? ''); setTab('Home'); };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);

  async function run(action: string, data: Record<string, unknown>, key: string) {
    if (!page || !online) throw new Error('Connect to the internet and select a Mandap.');
    const fingerprint = JSON.stringify([page.id, action, data]);
    const requestKey = pendingRequests.current.get(fingerprint) ?? key;
    pendingRequests.current.set(fingerprint, requestKey);
    const result = await rpc<{ id: string }>('command', { p_mandap: page.id, p_action: action, p_data: data, p_key: requestKey });
    pendingRequests.current.delete(fingerprint);
    try { await refresh(); }
    catch (issue) { setError(`The change was saved, but refreshing failed: ${issue instanceof Error ? issue.message : 'reload to see the latest records'}`); }
    return result;
  }

  async function button(action: () => Promise<unknown>) {
    setError(''); setNotice('');
    try { await action(); setNotice('Done.'); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Operation failed.'); }
  }
  function download(name: string, rows: Record<string, string | number | null>[]) {
    const url = URL.createObjectURL(new Blob(['\ufeff', csv(rows)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function upload(data: FormData, target: string, kind: string) {
    if (!client || !page) throw new Error('Select a Mandap first.');
    const input = data.get('file');
    if (!(input instanceof File) || !input.size || input.size > 5 * 1024 * 1024) throw new Error('Choose an image no larger than 5 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
    const bitmap = await createImageBitmap(input);
    try {
      const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image processing is unavailable in this browser.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not prepare image.')), 'image/png'));
      const body = new FormData();
      body.set('file', blob, 'evidence.png'); body.set('mandap', page.id); body.set('target', target); body.set('kind', kind);
      const { error: uploadError } = await client.functions.invoke('upload', { body });
      if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
      await refresh();
    } finally { bitmap.close(); }
  }
  async function openFile(path: string) {
    if (!client) return;
    const { data, error: fileError } = await client.storage.from('evidence').createSignedUrl(path, 60);
    if (fileError) throw new Error(fileError.message);
    location.assign(data.signedUrl);
  }
  const cap = workspace?.capabilities ?? {};
  const festivalSelect = <Field label="Festival"><select name="festival_id" required><option value="">Select a festival</option>{page?.festivals.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>;
  const uploadForm = (id: string, kind: string) => <details><summary>Attach an image</summary><ActionForm title="Private evidence" submit="Upload" onSubmit={data => upload(data, id, kind)}><Field label="Bill or payment proof (maximum 5 MB)"><input name="file" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" required /></Field></ActionForm></details>;
  const files = (id: string) => workspace?.attachments.filter(a => a.payment_id === id || a.expense_id === id).map(a => <button className="secondary" key={a.id} onClick={() => void button(() => openFile(a.path))}>View private image</button>);

  if (!client) return <main className="setup"><span className="eyebrow">MANDAP</span><h1>Your community.<br />One clear picture.</h1><p>Registrations, sponsorships and transparent festival finances.</p><section className="card"><h2>Backend setup required</h2><p>No demo records or fake payments are shown. Configure the Supabase URL and publishable key in your local environment, apply the database migration, then restart the app.</p><p>See the project README for setup and release checks.</p></section></main>;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark"><Landmark size={23} /></span><span>mandap<span className="brand-dot">.</span><small>Community workspace</small></span></a>
      <div className="sidebar-label">Workspace</div>
      <nav aria-label="Workspace navigation">{tabs.filter(t => t !== 'Expenses' || cap.expenses || cap.finance || cap.approve || !page).filter(t => t !== 'Manage' || cap.member || !page).map(t => {
        const Icon = tabIcons[t];
        const label = t === 'Home' ? 'Overview' : t === 'Register' ? 'Registrations' : t === 'Manage' ? 'Workspace settings' : t;
        return <button key={t} aria-label={label} disabled={!page && t !== 'Home'} aria-current={tab === t ? 'page' : undefined} onClick={() => { setTab(t); setReceipt(null); }}><Icon size={19} /><span>{t === 'Register' ? 'Register' : t === 'Manage' ? 'Settings' : label}</span></button>;
      })}</nav>
      <div className="sidebar-label">Your community</div>
      <div className="sidebar-spaces">{links.map(link => <button key={link.id} className={link.slug === slug ? 'space-selected' : ''} onClick={() => navigate(link.slug)}><Avatar size={28} color="teal" radius="md">{link.name.slice(0, 1)}</Avatar><span>{link.name}</span></button>)}
        <button onClick={() => navigate('')}><Plus size={18} /><span>New workspace</span></button>
      </div>
      <div className="sidebar-bottom"><div className="trust-card"><ShieldCheck size={22} /><strong>Your community, connected.</strong><p>Every contribution counts. Every record matters.</p></div><a href="#runtime-note"><CircleHelp size={17} /> About this environment</a></div>
    </aside>
    <div className="workspace-main">
    <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14} /><strong>{page?.name ?? 'Welcome'}</strong></div><div className="account"><ThemeToggle /><Badge className="environment-badge" color="teal" variant="light">{localMode ? 'Local workspace' : 'Connected'}</Badge>{user ? <><Tooltip label={user.email}><Avatar color="teal" radius="xl" size={34}>{user.email?.slice(0, 1).toUpperCase()}</Avatar></Tooltip><button className="icon-button" aria-label="Sign out" onClick={() => void button(async () => { const { error: issue } = await getClient().auth.signOut(); if (issue) throw issue; setWorkspace(null); setLinks([]); })}><LogOut size={18} /></button></> : <a className="topbar-signin" href="#login">Sign in</a>}</div></header>
    <main id="main-content" tabIndex={-1}>
      <div className="page-heading"><div><h1>{page ? tab === 'Home' ? 'Workspace overview' : tab === 'Manage' ? 'Workspace settings' : tab === 'Register' ? 'Poojas & registrations' : tab : 'A new way to come together.'}</h1></div>{page && <Button variant="light" color="gray" leftSection={<CalendarDays size={16} />} onClick={() => setTab('Register')}>Explore schedule</Button>}</div>
      {!online && <p className="banner" role="alert">You are offline. Changes cannot be submitted; no payment is queued.</p>}
      {error && <div className="banner error" role="alert">{error}<button className="secondary" onClick={() => void button(refresh)}>Reload records</button></div>}
      <p className={notice ? 'notice' : 'sr-only'} role="status">{notice}{loading ? ' Loading records.' : ''}</p>
      {!page && <section className="hero landing-hero"><div className="hero-copy"><h2>Less admin.<br />More celebration.</h2><p>Bring your festivals, families and finances into one shared workspace.</p>{!user && <Button component="a" href="#login" size="md">Get started</Button>}</div><div className="hero-note"><Landmark size={32} strokeWidth={1.4} /><p>Poojas & registrations<br />Contributions & receipts<br />Committee finances</p></div></section>}
      <div className="toolbar">
        <form className="inline" onSubmit={event => { event.preventDefault(); navigate(field(new FormData(event.currentTarget), 'slug')); }}><label htmlFor="slug">Mandap link</label><input id="slug" name="slug" placeholder="sri-durga-mandap" defaultValue={slug} required /><button>Open</button></form>
        {!!links.length && <label>My workspaces<select value={slug} onChange={event => navigate(event.target.value)}><option value="">Choose workspace</option>{links.map(link => <option value={link.slug} key={link.id}>{link.name} ({link.role})</option>)}</select></label>}
      </div>
      {!page && <div className="feature-grid">{[
        { icon: CalendarDays, title: 'Bring every moment together', text: 'Configure poojas, manage family registrations and reserve sponsorships.', tone: 'teal' },
        { icon: Wallet, title: 'Clarity in every contribution', text: 'Separate promises from payments. Verify collections, then issue receipts.', tone: 'teal' },
        { icon: HeartHandshake, title: 'Transparency builds trust', text: 'Approve expenses and share only the financial summaries you choose.', tone: 'amber' },
      ].map(({ icon: Icon, title, text, tone }) => <article className="feature-card" key={title}><span className={`feature-icon ${tone}`}><Icon size={21} /></span><h2>{title}</h2><p>{text}</p></article>)}</div>}
      {!page && user && !!links.length && <section><div className="section-title"><h2>Your workspaces</h2><Badge color="teal">{links.length} connected</Badge></div><div className="grid">{links.map(link => <button className="workspace-card" key={link.id} onClick={() => navigate(link.slug)}><Avatar color="teal" size={46} radius="md">{link.name.slice(0, 1)}</Avatar><span><strong>{link.name}</strong><small>{link.role} / {link.slug}</small></span><ArrowUpRight size={19} /></button>)}</div></section>}
      {!user && <section id="login" className="grid">
        <ActionForm title="Sign in by email" submit="Send sign-in code" onSubmit={async data => {
          const address = field(data, 'email');
          if (!localMode && import.meta.env.PROD && (!siteKey || !captchaToken)) throw new Error('Complete the configured security check before requesting a code.');
          if (!localMode && siteKey && !captchaToken) throw new Error('Complete the security check first.');
          const result = await getClient().auth.signInWithOtp({ email: address, options: { captchaToken: captchaToken || undefined } });
          setCaptchaToken(''); setCaptchaEpoch(value => value + 1);
          if (result.error) throw result.error;
          if ('localCode' in result.data) setLocalCode(result.data.localCode);
          setEmail(address);
        }}><p className="form-intro">Your next celebration starts here. Sign in to create a workspace or join your committee.</p><Field label="Email"><input type="email" name="email" autoComplete="email" placeholder="you@community.in" required /></Field>{!localMode && siteKey && <Captcha key={captchaEpoch} siteKey={siteKey} onToken={setCaptchaToken} />}<p className="muted">{localMode ? 'Local development: your one-time code appears in a local inbox below. No email will be sent.' : 'Public browsing needs no account. A code is sent only if the email service accepts the request.'}</p></ActionForm>
        {email && <ActionForm title="Verify your code" submit="Sign in" onSubmit={async data => {
          const { error: issue } = await getClient().auth.verifyOtp({ email, token: field(data, 'code'), type: 'email' });
          if (issue) throw issue;
        }}><p>{localMode ? `Local inbox for ${email}` : `Check ${email}, including spam.`}</p>{localMode && localCode && <div className="local-inbox"><span>Development inbox / not sent by email</span><output aria-label="Local sign-in code">{localCode}</output><small>Expires in 5 minutes. For this computer only.</small></div>}<Field label="Email code"><input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" required /></Field></ActionForm>}
      </section>}
      {mfaLogin && <ActionForm title="Verify your authenticator" submit="Verify and continue" onSubmit={async data => {
        const { error: issue } = await getClient().auth.mfa.challengeAndVerify({ factorId: mfaLogin, code: field(data, 'code') });
        if (issue) throw issue;
        setMfaLogin(null); setError(''); await refresh();
      }}><Field label="Authenticator code"><input name="code" inputMode="numeric" autoComplete="one-time-code" required /></Field></ActionForm>}
      {!page && user && <ActionForm title="Create your Mandap" submit="Create private workspace" onSubmit={async data => {
        await rpc<string>('create_mandap', { p_name: field(data, 'name'), p_slug: field(data, 'slug') });
        navigate(field(data, 'slug').toLowerCase());
      }}><Field label="Mandap name"><input name="name" minLength={2} maxLength={120} required /></Field><Field label="Public link slug"><input name="slug" pattern="[a-z0-9][a-z0-9-]{2,59}" minLength={3} maxLength={60} required /></Field><p>Starts private. Publish it from Manage when ready.</p></ActionForm>}
      {page && <>
        <section className="hero workspace-hero"><div className="hero-copy"><h2>{page.name}</h2><p>Festivals, registrations and community finances.</p></div><div className="actions"><Button onClick={() => setTab('Register')}>View poojas</Button><Button variant="light" color="gray" onClick={() => void button(refresh)} loading={loading}>Refresh records</Button></div></section>
        {tab === 'Home' && <>
          {(workspace?.summary ?? page.summary) && <SummaryCards summary={(workspace?.summary ?? page.summary)!} />}
          {workspace?.summary && <div className="overview-grid"><section className="card collection-card"><div className="section-title"><h2><Wallet size={19} /> Collection progress</h2><Badge color="teal">Verified only</Badge></div><strong>{money(workspace.summary.collected - workspace.summary.refunded)}</strong><p className="muted">Net collected against {money(workspace.summary.pledged ?? 0)} in active pledges</p><Progress value={Math.min(100, Math.max(0, workspace.summary.pledged ? (workspace.summary.collected - workspace.summary.refunded) / workspace.summary.pledged * 100 : 0))} color="violet" size={9} radius="xl" /><p className="muted">Unverified payments are never counted as collected.</p></section><section className="card"><div className="section-title"><h2><Bell size={19} /> Needs attention</h2><Badge color="orange">{workspace.payments.filter(p => p.state === 'submitted').length + workspace.expenses.filter(e => e.state === 'pending').length}</Badge></div><button className="review-row" onClick={() => setTab('Payments')}><span><Wallet size={17} /> Payments awaiting verification</span><strong>{workspace.payments.filter(p => p.state === 'submitted').length}</strong><ChevronRight size={16} /></button><button className="review-row" onClick={() => setTab('Expenses')}><span><ReceiptText size={17} /> Expenses awaiting approval</span><strong>{workspace.expenses.filter(e => e.state === 'pending').length}</strong><ChevronRight size={16} /></button></section></div>}
          {!workspace?.summary && !page.summary && <p className="muted">Financial summaries have not been published.</p>}
          {page.updated_at && <p className="muted">Last recorded activity: {new Date(page.updated_at).toLocaleString()}</p>}
          <div className="section-title"><h2>Festival schedule</h2><span className="muted">{page.festivals.length} festivals</span></div>{!page.festivals.length && <section className="empty-state"><CalendarDays size={30} /><h3>A celebration waiting to happen</h3><p>Create your first festival in Workspace settings to bring this space to life.</p>{cap.configure && <Button variant="light" onClick={() => setTab('Manage')}>Set up a festival <ArrowRight size={15} /></Button>}</section>}<div className="grid">{page.festivals.map(f => <article className="card festival-card" key={f.id}><div className="section-title"><span className="feature-icon violet"><CalendarDays size={22} /></span><Badge variant="light" color={f.published ? 'teal' : 'gray'}>{f.published ? 'Published' : 'Draft'}</Badge></div><h3>{f.name}</h3><p>{f.start_date} to {f.end_date}</p><p className="muted">{f.venue || 'Venue to be announced'}</p><Button variant="light" fullWidth rightSection={<ArrowUpRight size={16} />} onClick={() => setTab('Register')}>View poojas</Button></article>)}</div>
          <div className="section-title"><h2>Sponsorships</h2><HeartHandshake size={20} /></div>{!page.slots.length && <section className="empty-state"><HeartHandshake size={28} /><p>Sponsorship opportunities will appear here when the committee adds them.</p></section>}<div className="grid">{page.slots.map(slot => <article className="card" key={slot.id}><h3>{slot.name}</h3><p>{slot.day} / {money(slot.amount)}</p><p>{slot.capacity - slot.booked} of {slot.capacity} slots available</p><p>{page.sponsors.filter(s => s.slot_id === slot.id).map(s => s.sponsor).join(', ')}</p>{user && slot.booked < slot.capacity ? <ActionForm title="Reserve sponsorship" submit="Reserve and pledge" onSubmit={data => run('book', { slot_id: slot.id, sponsor: field(data, 'sponsor'), public_name: data.has('public_name') }, crypto.randomUUID()).then(() => {})}><Field label="Sponsor or family name"><input name="sponsor" minLength={2} maxLength={160} required /></Field><label className="check"><input name="public_name" type="checkbox" /> Show this name publicly (optional)</label></ActionForm> : <p>{!user ? 'Sign in to sponsor.' : 'Fully booked'}</p>}</article>)}</div>
        </>}
        {tab === 'Register' && <>
          {!user && <p className="banner">Sign in above to register your family.</p>}
          <div className="grid">{page.poojas.filter(p => p.active).map(pooja => <article className="card" key={pooja.id}><h2>{pooja.name}</h2><p className="price">{money(pooja.amount)} <span>{pooja.pricing.replaceAll('_', ' ')}</span></p><p>{pooja.eligibility}</p><p>{pooja.instructions}</p><p className="muted">Registration closes {new Date(pooja.closes_at).toLocaleString()}</p>
            <ActionForm title="Register participants" submit="Register and create pledge" disabled={!user || !online} preview={data => {
              const people = data ? field(data, 'participants').split('\n').filter(n => n.trim()).length : 0;
              const days = data ? data.getAll('occurrence_ids').length : pooja.pricing === 'package' ? pooja.occurrences.length : 0;
              const custom = data && field(data, 'amount') ? Number(field(data, 'amount')) * 100 : pooja.amount;
              return `Estimated pledge: ${money(pricePreview(pooja.pricing, pooja.amount, people, days, custom))}. The server confirms this amount.`;
            }} onSubmit={async data => {
              const ids = data.getAll('occurrence_ids').map(String);
              if (!ids.length) throw new Error('Select at least one day.');
              await run('register', { pooja_id: pooja.id, family_name: field(data, 'family_name'), mobile: field(data, 'mobile'), participants: field(data, 'participants').split('\n').map(n => n.trim()).filter(Boolean), occurrence_ids: ids, amount: ['custom', 'suggested'].includes(pooja.pricing) ? amount(data) : 0, helpdesk: data.has('helpdesk') }, crypto.randomUUID());
              setTab('Payments');
            }}>
              {!!workspace?.families.length && <Field label="Copy an existing family"><select value={familyId} onChange={event => setFamilyId(event.target.value)}><option value="">Enter a new family</option>{workspace.families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
              <Field label="Family/contact name"><input key={`family-${familyId}`} name="family_name" defaultValue={workspace?.families.find(f => f.id === familyId)?.name ?? ''} required minLength={2} maxLength={160} /></Field>
              <Field label="Mobile (optional; not used to claim an account)"><input key={`mobile-${familyId}`} name="mobile" type="tel" defaultValue={workspace?.families.find(f => f.id === familyId)?.mobile ?? ''} maxLength={24} /></Field>
              <Field label="Participant names, one per line"><textarea key={`names-${familyId}`} name="participants" defaultValue={workspace?.families.find(f => f.id === familyId)?.participants.join('\n') ?? ''} required rows={3} /></Field>
              <fieldset><legend>Select dates (package: select every day)</legend>{pooja.occurrences.map(o => <label className="check" key={o.id}><input type="checkbox" name="occurrence_ids" value={o.id} defaultChecked={pooja.pricing === 'package'} />{o.day} / {pooja.capacity - o.booked} places</label>)}</fieldset>
              {['custom', 'suggested'].includes(pooja.pricing) && <Field label="Your amount (INR)"><input name="amount" type="number" min="0" step="0.01" defaultValue={pooja.amount / 100} required /></Field>}
              {cap.register && <label className="check"><input name="helpdesk" type="checkbox" /> Help-desk entry for someone else (not linked to my account)</label>}
              <p className="muted">The server calculates the final pledge. A registration does not confirm payment.</p>
            </ActionForm></article>)}</div>
          {user && <ActionForm title="Make a donation pledge" submit="Create pledge" onSubmit={data => run('donate', { festival_id: field(data, 'festival_id'), amount: amount(data) }, crypto.randomUUID()).then(() => { setTab('Payments'); })}>{festivalSelect}<Field label="Amount (INR)"><input name="amount" type="number" min="0.01" step="0.01" required /></Field></ActionForm>}
          {!!workspace?.registrations.length && <section className="card"><h2>Registrations</h2>{workspace.registrations.map(r => <p key={r.id}>{page.poojas.find(p => p.id === r.pooja_id)?.name ?? 'Pooja'}: {r.participant_names.join(', ')} / {money(r.amount)} / {r.state}</p>)}{cap.register && <button className="secondary" onClick={() => download('registrations.csv', workspace.registrations.map(r => ({ pooja: page.poojas.find(p => p.id === r.pooja_id)?.name ?? '', participants: r.participant_names.join('; '), amount_minor: r.amount, state: r.state })))}>Export participant CSV</button>}</section>}
        </>}
        {tab === 'Payments' && <>
          {!user && <p>Sign in to view your commitments and payments.</p>}
          {page.upi && <section className="card"><h2>Pay the Mandap directly</h2><p>UPI ID: <strong>{page.upi}</strong></p><UpiQr value={`upi://pay?pa=${encodeURIComponent(page.upi)}&pn=${encodeURIComponent(page.name)}&cu=INR`} /><a className="button" href={`upi://pay?pa=${encodeURIComponent(page.upi)}&pn=${encodeURIComponent(page.name)}&cu=INR`}>Open UPI app</a><p>Return here to submit the transaction reference. Opening your UPI app is not payment confirmation.</p></section>}
          <div className="grid">{workspace?.commitments.map(k => <article className="card" key={k.id}><h2>{k.label}</h2><p>Pledged {money(k.amount)} / paid {money(k.paid)} / refunded {money(k.refunded)} / waived {money(k.waived)}</p><strong>{k.cancelled ? 'Cancelled' : `Outstanding ${money(Math.max(0, k.amount - k.waived - k.paid + k.refunded))}`}</strong>{!k.cancelled && <ActionForm title="Submit payment for verification" submit="Submit payment" onSubmit={async data => {
            await run('submit_payment', { commitment_id: k.id, amount: amount(data), method: field(data, 'method'), reference: field(data, 'reference') }, crypto.randomUUID());
          }}><Field label="Amount (INR)"><input name="amount" type="number" min="0.01" step="0.01" required /></Field><Field label="Method"><select name="method"><option value="upi">UPI</option><option value="cash">Cash</option><option value="bank">Bank transfer</option></select></Field><Field label="Transaction reference (required for UPI/bank)"><input name="reference" maxLength={160} /></Field><p>Do not resubmit if your payment is already awaiting verification.</p></ActionForm>}
            {cap.verify && <details><summary>Corrections</summary><button className="secondary" disabled={k.cancelled} onClick={() => void button(() => run('cancel', { commitment_id: k.id }, crypto.randomUUID()))}>Cancel commitment and release booking</button><p>Cancellation does not refund any collected money.</p><ActionForm title="Set unpaid waiver" submit="Set waiver" onSubmit={data => run('waive', { commitment_id: k.id, amount: amount(data) }, crypto.randomUUID()).then(() => {})}><Field label="Total amount waived (INR)"><input name="amount" type="number" min="0" step="0.01" required /></Field></ActionForm></details>}
          </article>)}</div>
          <h2>Payment history</h2><div className="grid">{workspace?.payments.map(p => <article className="card" key={p.id}><h3>{money(p.amount)} / {p.method}</h3><p>{workspace.commitments.find(k => k.id === p.commitment_id)?.label}</p><p><strong>{p.state === 'submitted' ? 'Submitted for verification' : p.state}</strong></p><p>{p.reference || 'No reference (cash)'}</p><p>{new Date(p.created_at).toLocaleString()}</p>
            {cap.verify && p.state === 'submitted' && <div className="actions"><button onClick={() => void button(() => run('verify', { payment_id: p.id }, crypto.randomUUID()))}>Verify payment</button><button className="secondary" onClick={() => void button(() => run('reject_payment', { payment_id: p.id }, crypto.randomUUID()))}>Reject</button></div>}
            {p.receipt && <button className="secondary" onClick={() => setReceipt(p)}>View receipt #{p.receipt?.number}</button>}
            {files(p.id)}{uploadForm(p.id, 'payment')}
            {cap.verify && p.state === 'confirmed' && <details><summary>Record refund</summary><ActionForm title="Record money already refunded" submit="Record refund" onSubmit={data => run('refund', { payment_id: p.id, amount: amount(data), reason: field(data, 'reason') }, crypto.randomUUID()).then(() => {})}><p>Already refunded: {money(p.refunded)}. This records an external refund; it does not send money.</p><Field label="Refund amount (INR)"><input type="number" name="amount" min="0.01" step="0.01" required /></Field><Field label="Reason / external reference"><input name="reason" minLength={3} maxLength={500} required /></Field></ActionForm></details>}
          </article>)}</div>
          {receipt && <section className="receipt card" aria-label="Receipt"><h2>{page.name} - Receipt #{receipt.receipt?.number}</h2><p>{workspace?.commitments.find(k => k.id === receipt.commitment_id)?.label}</p><p>Confirmed amount: <strong>{money(receipt.amount)}</strong></p><p>Method: {receipt.method} / reference: {receipt.reference || 'Cash'}</p><p>{receipt.receipt && new Date(receipt.receipt.created_at).toLocaleString()}</p><p>Refunded to date: {money(receipt.refunded)}. Original payment history is retained.</p><p>Not a tax-exemption certificate.</p><button onClick={() => window.print()}>Print / save PDF</button><button className="secondary" onClick={() => setReceipt(null)}>Close</button></section>}
          {cap.finance && workspace && <button className="secondary" onClick={() => download('payments.csv', workspace.payments.map(p => ({ amount_minor: p.amount, method: p.method, state: p.state, reference: p.reference, refunded_minor: p.refunded, receipt: p.receipt?.number ?? null })))}>Export payments CSV</button>}
        </>}
        {tab === 'Expenses' && workspace && <>
          {cap.expenses && <ActionForm title="Submit an expense" submit="Send for approval" onSubmit={data => run('expense', { festival_id: field(data, 'festival_id'), title: field(data, 'title'), category: field(data, 'category'), amount: amount(data), day: field(data, 'day'), paid: data.has('paid'), note: field(data, 'note') }, crypto.randomUUID()).then(() => {})}>{festivalSelect}<Field label="Title"><input name="title" minLength={2} maxLength={160} required /></Field><Field label="Category"><input name="category" maxLength={80} required list="categories" /><datalist id="categories"><option>Flowers</option><option>Prasadam</option><option>Decoration</option><option>Priest charges</option><option>Other</option></datalist></Field><Field label="Amount (INR)"><input type="number" name="amount" min="0.01" step="0.01" required /></Field><Field label="Expense date"><input type="date" name="day" defaultValue={today()} required /></Field><Field label="Note / vendor / paid by"><input name="note" maxLength={500} /></Field><label className="check"><input name="paid" type="checkbox" defaultChecked /> Already paid</label></ActionForm>}
          <div className="grid">{workspace.expenses.map(e => <article className="card" key={e.id}><h2>{e.title}</h2><p>{e.category} / {e.day}</p><p>{money(e.amount)} / {e.paid ? 'Paid' : 'Not paid'} / <strong>{e.state}</strong></p><p>{e.note}</p>{cap.approve && ['pending', 'correction'].includes(e.state) && <ActionForm title="Review expense" submit="Save review" onSubmit={data => run('review_expense', { expense_id: e.id, version: e.version, state: field(data, 'state'), note: field(data, 'note') }, crypto.randomUUID()).then(() => {})}><Field label="Decision"><select name="state"><option value="approved">Approve</option><option value="rejected">Reject</option><option value="correction">Request correction</option></select></Field><Field label="Review note"><input name="note" maxLength={500} /></Field></ActionForm>}{cap.approve && e.state === 'approved' && !e.paid && <button onClick={() => void button(() => run('pay_expense', { expense_id: e.id, version: e.version }, crypto.randomUUID()))}>Record as paid</button>}{files(e.id)}{cap.expenses && uploadForm(e.id, 'expense')}</article>)}</div>
          {cap.expenses && workspace.expenses.filter(e => e.state === 'correction' && e.created_by === user?.id).map(e => <ActionForm key={`correct-${e.id}`} title={`Correct and resubmit: ${e.title}`} submit="Resubmit for approval" onSubmit={data => run('correct_expense', { expense_id: e.id, version: e.version, amount: amount(data), note: field(data, 'note') }, crypto.randomUUID()).then(() => {})}><Field label="Corrected amount (INR)"><input name="amount" type="number" min="0.01" step="0.01" defaultValue={e.amount / 100} required /></Field><Field label="Correction explanation"><textarea name="note" maxLength={500} required /></Field></ActionForm>)}
          {cap.finance && <button className="secondary" onClick={() => download('expenses.csv', workspace.expenses.map(e => ({ title: e.title, category: e.category, amount_minor: e.amount, date: e.day, state: e.state, paid: e.paid ? 'yes' : 'no' })))}>Export expenses CSV</button>}
        </>}
        {tab === 'Manage' && workspace && <>
          <div className="grid">
            {cap.owner && workspace.settings && <ActionForm title="Mandap settings" submit="Save settings" onSubmit={data => run('settings', { name: field(data, 'name'), upi: field(data, 'upi'), published: data.has('published'), transparency: data.has('transparency') }, crypto.randomUUID()).then(() => {})}><Field label="Name"><input name="name" defaultValue={workspace.settings.name} required minLength={2} maxLength={120} /></Field><Field label="UPI ID (public)"><input name="upi" defaultValue={workspace.settings.upi} maxLength={120} /></Field><label className="check"><input name="published" type="checkbox" defaultChecked={workspace.settings.published} /> Publish public page</label><label className="check"><input name="transparency" type="checkbox" defaultChecked={workspace.settings.transparency} /> Publish approved aggregate finances</label><p>Public link: {location.origin}/?mandap={page.slug}</p></ActionForm>}
            {cap.configure && <ActionForm title="Create festival" submit="Create festival" onSubmit={data => run('festival', { name: field(data, 'name'), start_date: field(data, 'start_date'), end_date: field(data, 'end_date'), venue: field(data, 'venue'), published: data.has('published') }, crypto.randomUUID()).then(() => {})}><Field label="Name"><input name="name" minLength={2} maxLength={160} required /></Field><Field label="Start"><input type="date" name="start_date" required /></Field><Field label="End"><input type="date" name="end_date" required /></Field><Field label="Venue"><input name="venue" /></Field><label className="check"><input name="published" type="checkbox" /> Publish festival</label></ActionForm>}
            {cap.configure && <ActionForm title="Configure pooja" submit="Create pooja and dates" onSubmit={async data => {
              const dates = field(data, 'dates').split(/[\s,]+/).filter(Boolean);
              await run('pooja', { festival_id: field(data, 'festival_id'), name: field(data, 'name'), instructions: field(data, 'instructions'), eligibility: field(data, 'eligibility'), pricing: field(data, 'pricing'), amount: amount(data), capacity: Number(field(data, 'capacity')), opens_at: new Date(field(data, 'opens_at')).toISOString(), closes_at: new Date(field(data, 'closes_at')).toISOString(), dates }, crypto.randomUUID());
            }}>{festivalSelect}<Field label="Name"><input name="name" required minLength={2} maxLength={160} /></Field><Field label="Dates (YYYY-MM-DD, separated by commas)"><textarea name="dates" required placeholder="2027-10-01, 2027-10-02" /></Field><Field label="Pricing unit"><select name="pricing">{['person', 'person_day', 'family', 'family_day', 'package', 'fixed', 'custom', 'suggested', 'free'].map(mode => <option key={mode}>{mode}</option>)}</select></Field><Field label="Amount (INR; package is per participant)"><input type="number" name="amount" min="0" step="0.01" required /></Field><Field label="Capacity per day"><input type="number" name="capacity" min="1" max="100000" required /></Field><Field label="Registration opens"><input name="opens_at" type="datetime-local" required /></Field><Field label="Registration closes"><input name="closes_at" type="datetime-local" required /></Field><Field label="Eligibility note"><input name="eligibility" defaultValue="Everyone" /></Field><Field label="Instructions"><textarea name="instructions" /></Field></ActionForm>}
            {cap.configure && <ActionForm title="Create sponsorship slots" submit="Create dated slots" onSubmit={data => run('slot', { festival_id: field(data, 'festival_id'), name: field(data, 'name'), day: field(data, 'day'), capacity: Number(field(data, 'capacity')), amount: amount(data) }, crypto.randomUUID()).then(() => {})}>{festivalSelect}<Field label="Name / category"><input name="name" required minLength={2} maxLength={160} /></Field><Field label="Date"><input name="day" type="date" required /></Field><Field label="Available slots"><input name="capacity" type="number" min="1" max="10000" defaultValue="1" required /></Field><Field label="Amount per slot (INR)"><input name="amount" type="number" min="0" step="0.01" required /></Field></ActionForm>}
            {cap.owner && <ActionForm title="Invite committee member" submit={localMode ? 'Save local invitation' : 'Email invitation'} onSubmit={async data => {
              const { error: issue } = await getClient().functions.invoke('invite', { body: { mandap: page.id, email: field(data, 'email'), role: field(data, 'role'), key: crypto.randomUUID() } });
              if (issue) throw new Error(`Invitation failed: ${issue.message}. Check backend output before retrying.`);
            }}>{localMode && <p className="muted">Local inbox mode: no email is sent. Sign in with the invited email on this computer to accept.</p>}<Field label="Email"><input type="email" name="email" required /></Field><Field label="Role"><select name="role">{['treasurer', 'coordinator', 'volunteer', 'auditor'].map(role => <option key={role}>{role}</option>)}</select></Field></ActionForm>}
          </div>
          {cap.configure && <section className="grid">{page.festivals.map(f => <ActionForm key={f.id} title={`Publish: ${f.name}`} submit="Update festival" onSubmit={data => run('festival_update', { festival_id: f.id, published: data.has('published'), venue: field(data, 'venue') }, crypto.randomUUID()).then(() => {})}><Field label="Venue"><input name="venue" defaultValue={f.venue} /></Field><label className="check"><input name="published" type="checkbox" defaultChecked={f.published} /> Published</label></ActionForm>)}{page.poojas.map(p => <ActionForm key={p.id} title={`Update: ${p.name}`} submit="Update pooja" onSubmit={data => run('pooja_update', { pooja_id: p.id, amount: amount(data), capacity: Number(field(data, 'capacity')), active: data.has('active'), instructions: field(data, 'instructions') }, crypto.randomUUID()).then(() => {})}><Field label="Amount (INR)"><input type="number" name="amount" min="0" step="0.01" defaultValue={p.amount / 100} required /></Field><Field label="Capacity per day"><input name="capacity" type="number" min="1" defaultValue={p.capacity} required /></Field><Field label="Instructions"><textarea name="instructions" defaultValue={p.instructions} /></Field><label className="check"><input name="active" type="checkbox" defaultChecked={p.active} /> Active</label><p>Existing registrations retain their agreed prices.</p></ActionForm>)}</section>}
          {cap.owner && <section className="card"><h2>Committee access</h2>{workspace.members.map(m => <ActionForm key={m.user_id} title={`${m.role}: ${m.user_id.slice(0, 8)}`} submit="Update member" disabled={m.role === 'owner'} onSubmit={data => run('member', { user_id: m.user_id, role: field(data, 'role'), active: data.has('active'), permissions: data.getAll('permissions').map(String) }, crypto.randomUUID()).then(() => {})}><Field label="Role"><select name="role" defaultValue={m.role}>{['owner', 'treasurer', 'coordinator', 'volunteer', 'auditor'].map(role => <option key={role} disabled={role === 'owner'}>{role}</option>)}</select></Field><label className="check"><input type="checkbox" name="active" defaultChecked={m.active} /> Active member</label><fieldset><legend>Additional permissions</legend>{['configure', 'register', 'finance', 'verify', 'expenses', 'approve', 'audit'].map(c => <label className="check" key={c}><input name="permissions" value={c} type="checkbox" defaultChecked={m.permissions.includes(c)} />{c}</label>)}</fieldset></ActionForm>)}</section>}
          {cap.owner && !localMode && <section className="card"><h2>Owner multi-factor authentication</h2><button className="secondary" onClick={() => void button(async () => {
            const { data, error: issue } = await getClient().auth.mfa.enroll({ factorType: 'totp', friendlyName: `Mandap ${Date.now()}` });
            if (issue) throw issue;
            setMfa({ id: data.id, qr: data.totp.qr_code });
          })}>Set up authenticator</button>{mfa && <><img className="qr" src={mfa.qr} alt="Scan this QR code with your authenticator app" /><ActionForm title="Confirm authenticator" submit="Verify MFA" onSubmit={async data => {
            const { error: issue } = await getClient().auth.mfa.challengeAndVerify({ factorId: mfa.id, code: field(data, 'code') });
            if (issue) throw issue;
            setMfa(null);
          }}><Field label="Authenticator code"><input name="code" inputMode="numeric" autoComplete="one-time-code" required /></Field></ActionForm></>}</section>}
          {!!workspace.audit.length && <section className="card"><h2>Recent audit history</h2><ul>{workspace.audit.map(a => <li key={a.id}>{new Date(a.created_at).toLocaleString()} / {a.action} / {a.entity_id?.slice(0, 8)}</li>)}</ul></section>}
        </>}
      </>}
    </main><footer id="runtime-note"><span><Database size={15} />{localMode ? 'Local PostgreSQL / saved on this computer' : 'Connected to Supabase'}</span><span>{localMode ? 'Development inbox. Not for public hosting or real financial data.' : 'Financial actions require a server confirmation.'}</span></footer>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><MantineProvider theme={theme} defaultColorScheme="light"><App /></MantineProvider></StrictMode>);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(error => {
    console.error('PWA installation support could not start:', error);
    const notice = document.createElement('p'); notice.setAttribute('role', 'alert');
    notice.textContent = 'Offline installation support is unavailable. The online app can still be used.';
    document.body.append(notice);
  }); });
}
