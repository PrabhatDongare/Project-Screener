'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

const BULK_TONE = {
  running: 'notice-info',
  finished: 'notice-ok',
  paused: 'notice-warn',
  limit_reached: 'notice-warn',
  stopped: 'notice-idle',
};

/** Email account status, daily limit settings and the "send to all" controls. */
export default function EmailPanel({ email, setEmail, profile, filters, pendingEmailCount, onChanged }) {
  const [limit, setLimit] = useState('');
  const [delay, setDelay] = useState('');
  const [msg, setMsg] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const autoOpened = useRef(false);
  const [acct, setAcct] = useState({ host: '', port: '', user: '', pass: '', fromName: '' });
  const [testTo, setTestTo] = useState('');
  const [testSubject, setTestSubject] = useState('');
  const [testBody, setTestBody] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    if (email?.settings) { setLimit(String(email.settings.dailyLimit)); setDelay(String(email.settings.delaySeconds)); }
  }, [email?.settings?.dailyLimit, email?.settings?.delaySeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const a = email?.account;
    if (a) setAcct((cur) => ({ ...cur, host: a.host, port: String(a.port), user: a.user, fromName: a.fromName }));
  }, [email?.account?.host, email?.account?.port, email?.account?.user, email?.account?.fromName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (email && !email.configured && !autoOpened.current) { autoOpened.current = true; setSettingsOpen(true); }
  }, [email]);

  if (!email) return null;
  const bulk = email.bulk && email.bulk.profile === profile ? email.bulk : null;
  const running = bulk?.status === 'running';

  const run = async (fn, okText) => {
    setMsg(null);
    try {
      const data = await fn();
      if (data?.email) setEmail(data.email);
      if (okText) setMsg({ text: data?.message || okText });
      onChanged?.();
    } catch (err) {
      setMsg({ error: true, text: err.message });
    }
  };

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="section-title">Email sending</h2>
          <span className={`chip ${email.configured ? "chip-ok" : "chip-warn"}`}>{email.configured ? "Connected" : "Not set up"}</span>
          <span className="hint truncate">{email.configured ? email.from : "Add your email account in settings"}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right leading-tight">
            <span className="text-[20px] font-medium text-ink">{email.sentToday}</span><span className="text-mute"> / {email.settings.dailyLimit}</span>
            <div className="hint">sent today</div>
          </div>
          <button className="btn" onClick={() => setSettingsOpen(!settingsOpen)}>{settingsOpen ? "Hide settings" : "Settings"}</button>
        </div>
      </div>

      {settingsOpen && (
        <div className="space-y-4 border-t border-line pt-4">
      <details className="rounded-md border border-line p-4" open>
        <summary className="cursor-pointer text-[13px] font-medium">Email account (SMTP) <span className={`chip ml-2 ${email.configured ? 'chip-ok' : 'chip-warn'}`}>{email.configured ? 'Connected' : 'Not set up'}</span></summary>
        <p className="hint mt-2">Saved only on this computer in <code>data/email-account.json</code> (gitignored, never committed). Gmail: use an <b>App password</b>, not your normal password.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <div><label className="label">SMTP host</label><input className="input" value={acct.host} onChange={(e) => setAcct({ ...acct, host: e.target.value })} placeholder="smtp.gmail.com" /></div>
          <div><label className="label">Port</label><input className="input" value={acct.port} onChange={(e) => setAcct({ ...acct, port: e.target.value })} placeholder="465" /></div>
          <div><label className="label">Display name (optional)</label><input className="input" value={acct.fromName} onChange={(e) => setAcct({ ...acct, fromName: e.target.value })} /></div>
          <div className="col-span-2 md:col-span-1"><label className="label">From email / username</label><input className="input" type="email" value={acct.user} onChange={(e) => setAcct({ ...acct, user: e.target.value })} placeholder="you@gmail.com" /></div>
          <div className="col-span-2"><label className="label">Password / app password</label><input className="input" type="password" autoComplete="new-password" value={acct.pass} onChange={(e) => setAcct({ ...acct, pass: e.target.value })} placeholder={email.account?.hasPassword ? 'saved - leave empty to keep' : ''} /></div>
        </div>
        <button className="btn btn-primary mt-3" onClick={() => run(() => api('/api/email', { method: 'PATCH', json: acct }).then((d) => { setAcct((c) => ({ ...c, pass: '' })); return d; }), 'Account saved.')}>Save account</button>
      </details>

      <details className="rounded-md border border-line p-4">
        <summary className="cursor-pointer text-[13px] font-medium">Send a test email</summary>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div><label className="label">From</label><input className="input opacity-70" readOnly value={email.from || '(save an account first)'} /></div>
          <div><label className="label">To</label><input className="input" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="where to send the test" /></div>
          <div className="md:col-span-2"><label className="label">Subject (optional)</label><input className="input" value={testSubject} onChange={(e) => setTestSubject(e.target.value)} /></div>
          <div className="md:col-span-2"><label className="label">Message (optional)</label><textarea className="input h-20" value={testBody} onChange={(e) => setTestBody(e.target.value)} /></div>
        </div>
        <button className="btn btn-primary mt-3" disabled={!email.configured || !testTo.trim() || sendingTest}
          onClick={async () => { setSendingTest(true); await run(() => api('/api/email/test', { json: { to: testTo, subject: testSubject, body: testBody } }), 'Test email sent.'); setSendingTest(false); }}>
          {sendingTest ? 'Sending…' : 'Send test email'}
        </button>
      </details>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32"><label className="label">Daily limit</label><input className="input" type="number" min="1" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
        <div className="w-40"><label className="label">Seconds between mails</label><input className="input" type="number" min="0" value={delay} onChange={(e) => setDelay(e.target.value)} /></div>
        <button className="btn" onClick={() => run(() => api('/api/email', { method: 'PUT', json: { dailyLimit: limit, delaySeconds: delay } }), 'Settings saved.')}>Save</button>
        <button className="btn" disabled={!email.configured} onClick={() => run(() => api('/api/email', { method: 'POST' }), 'Connected.')}>Verify email login</button>
      </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 ">
        <button
          className="btn btn-primary"
          disabled={!email.configured || running || pendingEmailCount === 0}
          onClick={() => run(() => api('/api/outreach/bulk', { json: { profile, action: 'start', filters: { search: filters.search, sortBy: filters.sortBy } } }))}
        >
          {pendingEmailCount == null ? "Send to all pending email posts" : `Send to all ${pendingEmailCount} pending email posts`}
        </button>
        {running && <button className="btn btn-danger" onClick={() => run(() => api('/api/outreach/bulk', { json: { profile, action: 'stop' } }))}>Stop</button>}
        <span className="hint">AI writes a short note for each post, attaches your resume, sends it and marks the post done. Safe to stop and restart.</span>
      </div>

      {bulk && (
        <div className={`rounded-md px-4 py-3 text-[13px] ${BULK_TONE[bulk.status]}`}>
          <div className="font-medium">
            {bulk.status === 'running' ? 'Sending…' : bulk.status === 'finished' ? 'Finished' : bulk.status === 'limit_reached' ? 'Daily limit reached' : bulk.status === 'paused' ? 'Paused' : 'Stopped'}
            {' '}- {bulk.sent} sent{bulk.failed ? `, ${bulk.failed} failed` : ''} of {bulk.total}
          </div>
          {bulk.message && <div className="mt-1">{bulk.message}</div>}
          {bulk.errors.length > 0 && (
            <details className="mt-1 text-xs"><summary className="cursor-pointer">Errors ({bulk.errors.length})</summary>
              <ul className="mt-1 space-y-1">{bulk.errors.map((e, i) => <li key={i}>{e.postId}: {e.message}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {msg && <div className={`notice ${msg.error ? 'notice-bad' : 'notice-ok'}`}>{msg.text}</div>}
    </section>
  );
}
