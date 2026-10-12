'use client';

import { useState } from 'react';
import { timeAgo } from '@/lib/timeAgo';

const LINK_LABEL = {
  google_form: 'Google Form', microsoft_form: 'Microsoft Form', other_form: 'Online form',
  job_portal: 'Job portal', website: 'Website', whatsapp: 'WhatsApp', linkedin: 'LinkedIn',
};

const METHOD_LABEL = {
  email: 'Email', form: 'Form', website: 'Website', phone: 'Phone', linkedin_dm: 'LinkedIn DM', comment: 'Comment', none: 'No direct contact',
};

// The post's own LinkedIn page, built from its numeric id: .../feed/update/urn:li:activity:<postId>/
// (falls back to the scraped postUrl for ids that are not numeric).
export function linkedinPostUrl(post) {
  const id = String(post.postId || '');
  if (/^\d+$/.test(id)) return `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`;
  return post.postUrl || '';
}

function LinkedInIcon({ className = 'w-[18px] h-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function A({ href, children }) {
  return <a className="text-link break-all" href={href} target="_blank" rel="noreferrer">{children}</a>;
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-3 items-baseline">
      <span className="text-[11px] font-medium uppercase tracking-wide text-mute">{label}</span>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

export default function OutreachCard({ post, busy, emailReady, onSend, onDone, onUndo, onPreview }) {
  const [showPost, setShowPost] = useState(false);
  const [showMail, setShowMail] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const runPreview = async () => {
    setPreviewing(true);
    try { setPreview(await onPreview(post)); } catch (err) { setPreview({ error: err.message }); } finally { setPreviewing(false); }
  };

  const c = post.contacts || {};
  const roles = post.matchedRoles || [];
  const o = post.outreach;
  const isDone = o && o.status !== 'failed';
  const hasEmail = (c.emails || []).length > 0;
  const links = (c.links || []).filter((l) => l.type !== 'linkedin' || (l.resolvedUrl || l.url).includes('/in/'));
  const people = c.linkedinContacts || [];
  const fitTone = post.fitScore >= 75 ? 'chip-ok' : post.fitScore >= 50 ? 'chip-warn' : '';
  const meta = [post.company, timeAgo(post.postedAt) && `posted ${timeAgo(post.postedAt)}`, post.keyword && `“${post.keyword}”`].filter(Boolean).join(' · ');

  return (
    <article className="card !p-0 overflow-hidden">
      <div className={`p-5 ${isDone ? 'opacity-70' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-[18px] font-medium">
              {roles[0]?.title || post.company || 'Hiring post'}
              {roles.length > 1 && <span className="text-mute font-normal text-[13px]"> +{roles.length - 1} more</span>}
            </h3>
            {meta && <div className="hint mt-0.5">{meta}</div>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {o?.status === 'sent' && <span className="chip chip-ok">Email sent</span>}
            {o?.status === 'done' && <span className="chip chip-ok">Done</span>}
            {o?.status === 'failed' && <span className="chip chip-bad">Send failed</span>}
            {post.relevant && <span className={`chip ${fitTone}`} title="How good a match the AI thinks this is">{post.fitScore}% fit</span>}
            {linkedinPostUrl(post) && (
              <a
                href={linkedinPostUrl(post)}
                target="_blank"
                rel="noreferrer"
                title="Open this post on LinkedIn"
                aria-label="Open this post on LinkedIn"
                className="inline-grid place-items-center w-9 h-9 rounded-full border border-line bg-canvas text-ink active:bg-sunken ml-1"
              >
                <LinkedInIcon />
              </a>
            )}
          </div>
        </div>

        {post.summary && <p className="mt-3 text-[13.5px] leading-relaxed">{post.summary}</p>}
        {post.relevanceReason && <p className="hint mt-1.5">{post.relevanceReason}</p>}

        {roles.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {roles.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <span className="font-medium">{r.title}</span>
                {[r.experience, r.salary, r.location, r.workMode !== 'Unknown' && r.workMode, r.jobType !== 'Unknown' && r.jobType]
                  .filter(Boolean).filter((t, j, all) => all.findIndex((x) => String(x).toLowerCase() === String(t).toLowerCase()) === j)
                  .map((t, j) => <span key={j} className="chip">{t}</span>)}
              </li>
            ))}
          </ul>
        )}

        <div className="well mt-4 space-y-2.5 text-[13px]">
          <Row label="Reach via">
            <div className="flex flex-wrap gap-1.5">{post.methods.map((m) => <span key={m} className="chip chip-accent">{METHOD_LABEL[m]}</span>)}</div>
          </Row>
          {(c.emails || []).length > 0 && (
            <Row label="Email">{c.emails.map((e) => <div key={e}><a className="text-link" href={`mailto:${e}`}>{e}</a></div>)}</Row>
          )}
          {(c.phones || []).length > 0 && <Row label="Phone">{c.phones.map((p) => <div key={p}>{p}</div>)}</Row>}
          {links.length > 0 && (
            <Row label="Links">
              {links.map((l) => (
                <div key={l.url} className="flex items-baseline gap-2"><span className="chip shrink-0">{LINK_LABEL[l.type] || l.type}</span><A href={l.resolvedUrl || l.url}>{l.resolvedUrl || l.url}</A></div>
              ))}
            </Row>
          )}
          {people.length > 0 && (
            <Row label="People">{people.map((p, i) => <div key={i}>{p.url ? <A href={p.url}>{p.name || p.url}</A> : p.name}</div>)}</Row>
          )}
          {c.howToApply && <Row label="How">{<span className="text-mute">{c.howToApply}</span>}</Row>}
          <div className="hint pt-0.5">
            {post.authorProfileUrl && <A href={post.authorProfileUrl}>Author profile</A>}
            {c.commentInstruction && `${post.authorProfileUrl ? ' · ' : ''}asks you to comment on the post`}
            {c.dmInstruction && `${post.authorProfileUrl || c.commentInstruction ? ' · ' : ''}asks you to DM the poster`}
          </div>
        </div>

        {o?.status === 'sent' && (
          <div className="notice notice-ok mt-3">
            Sent to <b>{o.to}</b> {timeAgo(o.at)} — “{o.subject}”
            <button className="underline ml-2" onClick={() => setShowMail(!showMail)}>{showMail ? 'hide' : 'show'} copy</button>
            {showMail && <pre className="whitespace-pre-wrap font-sans mt-2 text-xs">{o.body}</pre>}
          </div>
        )}
        {o?.status === 'failed' && <div className="notice notice-bad mt-3">{o.error}</div>}
        {preview && (
          <div className="notice notice-info mt-3">
            {preview.error
              ? <span className="text-bad">{preview.error}</span>
              : <><div className="font-medium text-ink">Subject: {preview.subject}</div><pre className="whitespace-pre-wrap font-sans mt-2 text-xs text-ink">{preview.body}</pre></>}
            <button className="underline text-xs mt-2" onClick={() => setPreview(null)}>Close preview</button>
          </div>
        )}
        {showPost && <p className="mt-3 text-[13px] whitespace-pre-wrap well leading-relaxed">{post.content}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/60 px-5 py-3">
        {hasEmail && !isDone && (
          <button className="btn btn-primary" disabled={busy || !emailReady} title={emailReady ? '' : 'Set up your email account first'} onClick={() => onSend(post)}>
            {busy ? 'Writing & sending…' : o?.status === 'failed' ? 'Retry email' : 'Send email'}
          </button>
        )}
        {hasEmail && !isDone && <button className="btn" disabled={busy || previewing} onClick={runPreview}>{previewing ? 'Writing…' : 'Preview email'}</button>}
        {!isDone && <button className="btn" disabled={busy} onClick={() => onDone(post)}>Mark as done</button>}
        {(isDone || o?.status === 'failed') && <button className="btn" disabled={busy} onClick={() => onUndo(post)}>Undo</button>}
        <button className="btn btn-ghost ml-auto" onClick={() => setShowPost(!showPost)}>
          {showPost ? 'Hide original post' : 'Read original post'}
        </button>
      </div>
    </article>
  );
}
