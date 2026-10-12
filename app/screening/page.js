'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RequireSetup, useApp } from '@/components/AppShell';
import { api, usePoll } from '@/lib/client';

const RUN_TONE = {
  running: 'sig-dark',
  finished: 'sig-forest',
  paused: 'sig-coral',
  stopped: 'sig-strong',
};

function ScreeningInner() {
  const { profile } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api(`/api/screening?profile=${encodeURIComponent(profile)}`)); setError(''); } catch (err) { setError(err.message); }
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  const run = data?.run;
  const running = run?.status === 'running';
  usePoll(load, 2000, running);

  const act = async (action, file) => {
    setError('');
    try { setData(await api('/api/screening', { json: { profile, action, file } })); } catch (err) { setError(err.message); }
  };

  const pct = run ? Math.round(((run.alreadyDone + run.done) / Math.max(1, run.total)) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">AI Screening</h1>
        <p className="page-desc">
          Each new post goes to the AI one by one, together with your resume and preferences. It decides if the post is a job you could get shortlisted for
          and extracts every way to reach out (emails, phone, form links, LinkedIn contacts). Progress is saved after every post.
        </p>
      </div>

      {error && <div className="notice notice-bad">{error}</div>}
      {data && !data.hasPreferences && (
        <div className="card text-sm">This profile has no preferences yet. <Link className="underline" href="/">Extract them on Profile Setup</Link> first.</div>
      )}

      {run && (
        <section className={`${RUN_TONE[run.status]} text-[14px]`}>
          <div className="flex items-center justify-between gap-4">
            <div className="text-[18px] font-medium">
              {run.status === 'running' ? 'Screening…' : run.status === 'finished' ? 'Run finished' : run.status === 'paused' ? 'Run paused' : 'Run stopped'} - {run.file}
            </div>
            {running && <button className="btn btn-on-dark" onClick={() => act('stop')}>Stop</button>}
          </div>
          <div className={`h-1.5 rounded-full ${run.status === 'stopped' ? 'bg-ink/15' : 'bg-white/25'} mt-4 overflow-hidden`}><div className={`h-full transition-all ${run.status === 'stopped' ? 'bg-ink' : 'bg-white'}`} style={{ width: `${pct}%` }} /></div>
          <div className="text-sm mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <span>{run.alreadyDone + run.done}/{run.total} screened</span>
            <span><b>{run.relevant}</b> fit you</span>
            <span><b>{run.notRelevant}</b> not a fit</span>
            {run.failed > 0 && <span><b>{run.failed}</b> failed</span>}
          </div>
          {run.message && <div className="text-sm mt-2">{run.message}</div>}
          {run.errors.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer">Recent errors ({run.errors.length})</summary>
              <ul className="mt-1 space-y-1">{run.errors.map((e, i) => <li key={i}>{e.postId}: {e.message}</li>)}</ul>
            </details>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="section-title mb-3">Unique-post files</h2>
        {data && !data.llmConfigured && <p className="text-sm text-bad mb-3">{data.configMessage}</p>}
        {data && !data.files.length && <p className="hint">Nothing here yet - <Link className="underline" href="/intake">upload a posts file</Link> first.</p>}
        <ul className="divide-y divide-line">
          {data?.files.map((f) => (
            <li key={f.file} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium break-all"><span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${f.done ? 'bg-ok' : 'bg-warn'}`} />{f.file}</div>
                <div className="hint">{f.evaluated}/{f.total} screened · {f.relevant} fit you · results in <code>{f.resultsFile}</code></div>
              </div>
              {f.done ? (
                <span className="chip chip-ok">Screened</span>
              ) : (
                <button className="btn btn-primary" disabled={running || !data.llmConfigured || !data.hasPreferences} onClick={() => act('start', f.file)}>
                  {f.evaluated > 0 ? 'Continue' : 'Start'}
                </button>
              )}
            </li>
          ))}
        </ul>
        {data?.files.some((f) => f.done) && <Link href="/outreach" className="btn btn-primary mt-4">Go to Outreach →</Link>}
      </section>

      <p className="hint">
        Stop any time, or if the free model starts failing the run pauses by itself. Press Continue later - only posts without a result are sent to the model again.
      </p>
    </div>
  );
}

export default function ScreeningPage() {
  return <RequireSetup><ScreeningInner /></RequireSetup>;
}
