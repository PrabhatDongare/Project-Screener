'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RequireSetup, useApp } from '@/components/AppShell';
import { api } from '@/lib/client';

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-md border border-line bg-sunken p-4">
      <div className={`text-[32px] leading-none font-normal ${tone || 'text-ink'}`}>{value}</div>
      <div className="hint">{label}</div>
    </div>
  );
}

function IntakeInner() {
  const { profile } = useApp();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);

  const load = useCallback(async () => {
    try { setOverview(await api(`/api/intake?profile=${encodeURIComponent(profile)}`)); } catch (err) { setError(err.message); }
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      const form = new FormData();
      form.append('profile', profile);
      form.append('file', file);
      const data = await api('/api/intake', { method: 'POST', body: form });
      setResult(data.result);
      setOverview(data.overview);
      setFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Upload Posts</h1>
        <p className="page-desc">
          Upload a scraped posts file (like <code>linkedin_hiring_posts_2026-09-11.json</code>). Posts this profile has already processed are dropped;
          only brand-new posts move on to AI screening.
        </p>
      </div>

      <section className="card">
        <input className="input" type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="btn btn-primary mt-3" disabled={!file || busy} onClick={upload}>{busy ? 'Checking posts…' : 'Upload & remove duplicates'}</button>
        {error && <div className="mt-3 notice notice-bad">{error}</div>}

        {result && (
          <div className="mt-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Posts in uploaded file" value={result.totalInUpload} />
              <Stat label="New (unique) posts" value={result.newPosts} tone="text-ok" />
              <Stat label="Already processed before" value={result.alreadyProcessed} tone="text-warn" />
              <Stat label="Repeated inside the file" value={result.duplicatesInFile} />
            </div>
            <ul className="hint mt-4 space-y-1">
              <li>Copy of your upload kept at <code>{result.uploadedCopy}</code></li>
              {result.uniqueFile
                ? <li>New posts saved to <code>posts/2-unique/{result.uniqueFile}</code></li>
                : <li>Nothing new in this file - every post was seen before.</li>}
            </ul>
            {result.uniqueFile && <Link href="/screening" className="btn btn-primary mt-4">Continue to AI Screening →</Link>}
          </div>
        )}
      </section>

      {overview && (
        <section className="card">
          <h2 className="section-title mb-2">History for “{profile}”</h2>
          <p className="text-sm mb-3"><b>{overview.totalProcessedIds}</b> post ids recorded so far.</p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="label">Uploaded copies ({overview.uploads.length})</div>
              <ul className="hint space-y-1 max-h-48 overflow-auto">{overview.uploads.map((f) => <li key={f}>{f}</li>)}{!overview.uploads.length && <li>none yet</li>}</ul>
            </div>
            <div>
              <div className="label">Unique-post files ({overview.uniqueFiles.length})</div>
              <ul className="hint space-y-1 max-h-48 overflow-auto">{overview.uniqueFiles.map((f) => <li key={f}><span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${f.endsWith('.screened.json') ? 'bg-ok' : 'bg-warn'}`} />{f}</li>)}{!overview.uniqueFiles.length && <li>none yet</li>}</ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function IntakePage() {
  return <RequireSetup><IntakeInner /></RequireSetup>;
}
