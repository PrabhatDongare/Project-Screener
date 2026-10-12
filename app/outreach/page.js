'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireSetup, useApp } from '@/components/AppShell';
import EmailPanel from '@/components/EmailPanel';
import OutreachCard from '@/components/OutreachCard';
import { api, usePoll } from '@/lib/client';

const METHODS = [
  ['all', 'All'], ['email', 'Email'], ['form', 'Form'], ['website', 'Website'],
  ['phone', 'Phone'], ['linkedin_dm', 'LinkedIn DM'], ['comment', 'Comment'], ['none', 'No contact'],
];

function OutreachInner() {
  const { profile } = useApp();
  const [filters, setFilters] = useState({ method: 'all', formType: '', status: 'pending', relevance: 'relevant', search: '', sortBy: 'newest' });
  const [search, setSearch] = useState('');
  const [data, setData] = useState({ posts: [], counts: {}, total: 0 });
  const [email, setEmail] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ profile, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
      const [list, mail] = await Promise.all([api(`/api/outreach?${q}`), api('/api/email')]);
      setData(list);
      setEmail(mail.email);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [profile, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => setFilters((f) => (f.search === search ? f : { ...f, search })), 350); return () => clearTimeout(t); }, [search]);

  const bulkRunning = email?.bulk?.status === 'running' && email.bulk.profile === profile;
  usePoll(load, 3000, bulkRunning);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const wrap = (post, fn) => async () => {
    setBusyId(post.postId); setError('');
    try { await fn(); await load(); } catch (err) { setError(err.message); await load(); } finally { setBusyId(''); }
  };
  const onSend = (post) => wrap(post, () => api('/api/outreach', { json: { profile, postId: post.postId } }))();
  const onDone = (post) => wrap(post, () => api('/api/outreach', { method: 'PUT', json: { profile, postId: post.postId, action: 'done', method: filters.method !== 'all' ? filters.method : post.methods[0] } }))();
  const onPreview = async (post) => (await api("/api/outreach", { json: { profile, postId: post.postId, preview: true } })).preview;
  const onUndo = (post) => wrap(post, () => api('/api/outreach', { method: 'PUT', json: { profile, postId: post.postId, action: 'undo' } }))();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Outreach</h1>
        <p className="page-desc">Posts that fit you, grouped by how you can apply. Mark each as done once you have acted on it.</p>
      </div>

      <EmailPanel email={email} setEmail={setEmail} profile={profile} filters={filters} pendingEmailCount={filters.status === "pending" && filters.relevance === "relevant" ? (data.counts.email ?? 0) : null} onChanged={load} />

      <section className="card space-y-4">
        <div className="seg">
          {METHODS.map(([key, label]) => (
            <button key={key} onClick={() => set({ method: key, formType: '' })}
              className={`seg-item ${filters.method === key ? 'seg-item-on' : ''}`}>
              {label} <span className="text-[11px] opacity-60 ml-0.5">{data.counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input className="input col-span-2" placeholder="Search role, company, text…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="pending">To do</option><option value="done">Done / sent</option><option value="failed">Failed</option><option value="all">Everything</option>
          </select>
          <select className="input" value={filters.relevance} onChange={(e) => set({ relevance: e.target.value })}>
            <option value="relevant">Fits me</option><option value="not_relevant">Not a fit</option><option value="all">All screened</option>
          </select>
          <select className="input" value={filters.sortBy} onChange={(e) => set({ sortBy: e.target.value })}>
            <option value="newest">Newest first</option><option value="fit">Best fit first</option>
          </select>
          {filters.method === 'form' && (
            <select className="input" value={filters.formType} onChange={(e) => set({ formType: e.target.value })}>
              <option value="">Any form type</option><option value="google_form">Google Form</option>
              <option value="microsoft_form">Microsoft Form</option><option value="other_form">Other form</option>
            </select>
          )}
        </div>
      </section>

      {error && <div className="notice notice-bad">{error}</div>}

      <div className="hint">{data.total} post(s){data.total > data.posts.length ? ` - showing the first ${data.posts.length}` : ''}</div>
      <div className="space-y-4">
        {data.posts.map((post) => (
          <OutreachCard key={post.postId} post={post} busy={busyId === post.postId} emailReady={Boolean(email?.configured)}
            onSend={onSend} onDone={onDone} onUndo={onUndo} onPreview={onPreview} />
        ))}
        {!data.posts.length && (
          <div className="card text-sm">
            Nothing to show. Screen a posts file on the AI Screening page, or loosen the filters above.
          </div>
        )}
      </div>
    </div>
  );
}

export default function OutreachPage() {
  return <RequireSetup><OutreachInner /></RequireSetup>;
}
