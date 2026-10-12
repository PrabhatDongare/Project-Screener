import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import { SHARED_DATA_DIR, readJson, writeJson, localDateKey, sleep } from './fsx';
import { requireProfile, readResumeText } from './profiles';
import { readPreferencesText, parseCandidate } from './preferences';
import { chat, parseJsonReply, isLLMConfigured, llmConfigError } from './openrouter';
import { getPost, getStatusMap, setStatus, listOutreach } from './outreach';

// Email settings, the SMTP account and the send log are shared across profiles because they belong to one mailbox.
// The account is saved from the Outreach screen into data/email-account.json (gitignored); SMTP_* in .env.local is only a fallback.
const SETTINGS_FILE = path.join(SHARED_DATA_DIR, 'email-settings.json');
const LOG_FILE = path.join(SHARED_DATA_DIR, 'email-log.json');
const DEFAULT_SETTINGS = { dailyLimit: 400, delaySeconds: 5 };
const PAUSE_AFTER_CONSECUTIVE_LLM_FAILURES = 3;

const ACCOUNT_FILE = path.join(SHARED_DATA_DIR, "email-account.json");

/** Effective SMTP account: values saved from the screen win, .env.local fills the gaps. Never sent to the browser as-is. */
const getAccount = () => {
  const saved = readJson(ACCOUNT_FILE, {});
  const pick = (k, envKey, dflt = "") => String(saved[k] || process.env[envKey] || dflt).trim();
  return {
    host: pick("host", "SMTP_HOST", "smtp.gmail.com"),
    port: Number(saved.port || process.env.SMTP_PORT) || 465,
    user: pick("user", "SMTP_USER"),
    pass: String(saved.pass || process.env.SMTP_PASS || ""),
    fromName: pick("fromName", "SMTP_FROM_NAME"),
  };
};

export const isMailConfigured = () => { const a = getAccount(); return Boolean(a.user && a.pass); };

const NOT_CONFIGURED = "Email account is not set up. Enter it in the Email sending panel on the Outreach screen.";

export function saveAccount(input) {
  const current = readJson(ACCOUNT_FILE, {});
  const next = {
    host: String(input.host || "").trim() || "smtp.gmail.com",
    port: Math.floor(Number(input.port)) || 465,
    user: String(input.user || "").trim(),
    // An empty password box means "keep the one already saved".
    pass: String(input.pass || "") || current.pass || "",
    fromName: String(input.fromName || "").trim(),
  };
  if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(next.user)) throw new Error("Enter the sender email address (the SMTP username).");
  if (!next.pass) throw new Error("Enter the password / app password.");
  fs.mkdirSync(SHARED_DATA_DIR, { recursive: true });
  fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return publicAccount();
}

const publicAccount = () => {
  const { pass, ...rest } = getAccount();
  return { ...rest, hasPassword: Boolean(pass) };
};

export const getEmailSettings = () => ({ ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) });

export function saveEmailSettings(input) {
  const dailyLimit = Math.floor(Number(input.dailyLimit));
  const delaySeconds = Math.floor(Number(input.delaySeconds));
  if (!(dailyLimit >= 1 && dailyLimit <= 5000)) throw new Error('Daily limit must be between 1 and 5000.');
  if (!(delaySeconds >= 0 && delaySeconds <= 600)) throw new Error('Delay must be between 0 and 600 seconds.');
  const settings = { dailyLimit, delaySeconds };
  writeJson(SETTINGS_FILE, settings);
  return settings;
}

const readLog = () => readJson(LOG_FILE, { counts: {}, sends: [] });
export const getSentToday = () => readLog().counts[localDateKey()] || 0;

function recordSend(entry) {
  const log = readLog();
  const day = localDateKey();
  log.counts[day] = (log.counts[day] || 0) + 1;
  log.sends.push({ ...entry, at: new Date().toISOString() });
  writeJson(LOG_FILE, log);
}

export function getEmailOverview() {
  const settings = getEmailSettings();
  const sentToday = getSentToday();
  return {
    configured: isMailConfigured(),
    from: getAccount().user,
    account: publicAccount(),
    settings,
    sentToday,
    remainingToday: Math.max(0, settings.dailyLimit - sentToday),
    bulk: bulkState.current,
  };
}

const transporter = () => {
  const a = getAccount();
  return nodemailer.createTransport({ host: a.host, port: a.port, secure: a.port === 465, auth: { user: a.user, pass: a.pass } });
};

/** Sends a plain test message from the saved account to any address. */
export async function sendTestEmail({ to, subject, body }) {
  if (!isMailConfigured()) throw new Error(NOT_CONFIGURED);
  const address = String(to || "").trim();
  if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(address)) throw new Error("Enter a valid recipient email address.");
  const a = getAccount();
  try {
    await transporter().sendMail({
      from: { name: a.fromName, address: a.user },
      to: address,
      subject: String(subject || "").trim() || "Test email from LinkedIn Job Outreach",
      text: String(body || "").trim() || "This is a test email. If you can read it, your email account is set up correctly.",
    });
  } catch (err) {
    throw new Error(`Test email failed: ${err.message}`);
  }
  return `Test email sent from ${a.user} to ${address}.`;
}

export async function verifyMail() {
  if (!isMailConfigured()) throw new Error(NOT_CONFIGURED);
  await transporter().verify();
  return `Connected as ${getAccount().user}`;
}

// Auth/connection problems stop everything; a rejected single recipient only fails that post.
const isFatalMailError = (err) => ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(err.code);

const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || '';

async function generateEmailCopy(post, ctx) {
  const cand = ctx.candidate;
  const role = post.matchedRoles?.[0];
  const recruiter = firstName(post.contacts?.linkedinContacts?.[0]?.name);
  const reply = await chat([
    {
      role: 'system',
      content:
        'You write short, genuine job-application emails for a candidate. Respond with ONLY a JSON object: {"subject": string, "body": string}.\n' +
        'Rules: plain text, 70-120 words, no markdown. Open with a greeting' + (recruiter ? ` to "${recruiter}"` : ' ("Hi," or "Hello,")') + '. ' +
        'Name the exact role being applied for, give 2-3 concrete strengths from the resume that match THIS post, mention the resume is attached, ' +
        'and end with a polite line about being available to talk. Do NOT write a sign-off or signature (it is added automatically). ' +
        'Only use facts from the resume - never invent companies, years or skills. ' +
        "The candidate wrote their own instructions for emails in the section \"When writing emails and forms\" of their preferences: follow them EXACTLY (location or relocation wording, notice period, salary). " +
        "If those instructions say nothing about salary, do not mention it. If they say to state a salary only when the job post asks for one, check the post: use the figure given there, otherwise the figure from the preferences. " +
        'Subject: short, like "Application for <Role> - <Candidate name>".',
    },
    {
      role: 'user',
      content:
        `CANDIDATE RESUME:\n"""\n${ctx.resumeText}\n"""\n\n` +
        `CANDIDATE PREFERENCES (their own words):\n"""\n${ctx.prefsText}\n"""\n\n` +
        `CANDIDATE NAME: ${cand.name || '(unknown)'}\n\n` +
        `JOB POST (company: ${post.company || 'unknown'}):\n"""\n${String(post.content || '').slice(0, 2500)}\n"""\n\n` +
        `ROLE TO APPLY FOR: ${role ? `${role.title} (${role.experience || ''} ${role.location || ''})` : 'the most suitable opening in the post'}\n` +
        `HOW TO APPLY (from post): ${post.contacts?.howToApply || '(not stated)'}`,
    },
  ], { maxTokens: 3000 });

  let parsed;
  try {
    parsed = parseJsonReply(reply);
  } catch (err) {
    throw new Error(`Could not parse generated email: ${err.message}`);
  }
  const subject = String(parsed.subject || '').trim() || `Application - ${cand.name || 'Candidate'}`;
  const bodyText = String(parsed.body || '').trim();
  if (!bodyText) throw new Error('The model returned an empty email body.');
  const signature = ['Best regards,', cand.name, cand.phone, cand.linkedin].filter(Boolean).join('\n');
  return { subject, body: `${bodyText}\n\n${signature}` };
}

const loadContext = (profile) => {
  if (!isLLMConfigured()) throw new Error(llmConfigError());
  const prefsText = readPreferencesText(profile);
  if (!prefsText) throw new Error('This profile has no preferences yet.');
  return { resumeText: readResumeText(profile), prefsText, candidate: parseCandidate(prefsText), resumePdf: requireProfile(profile).resumePdf };
};

/** Generates the copy with the LLM, sends it with the resume attached, logs it and marks the post sent. */
async function sendForPost(profile, postId, ctx) {
  const post = getPost(profile, postId);
  if (!post) throw new Error('Post not found in this profile\'s results.');
  const to = post.contacts?.emails?.[0];
  if (!to) throw new Error('This post has no email address.');
  if (getStatusMap(profile)[postId] && getStatusMap(profile)[postId].status !== 'failed') throw new Error('This post is already marked done.');
  if (!isMailConfigured()) throw new Error(NOT_CONFIGURED);

  const { dailyLimit } = getEmailSettings();
  if (getSentToday() >= dailyLimit) {
    throw Object.assign(new Error(`Daily limit of ${dailyLimit} emails reached.`), { limitReached: true });
  }

  const copy = await generateEmailCopy(post, ctx);
  const candName = ctx.candidate.name || 'Resume';
  try {
    await transporter().sendMail({
      from: { name: getAccount().fromName || ctx.candidate.name || '', address: getAccount().user },
      to,
      replyTo: ctx.candidate.email || undefined,
      subject: copy.subject,
      text: copy.body,
      attachments: fs.existsSync(ctx.resumePdf) ? [{ filename: `${candName} - Resume.pdf`, path: ctx.resumePdf }] : [],
    });
  } catch (err) {
    if (isFatalMailError(err)) throw Object.assign(new Error(`Email server problem: ${err.message}`), { fatal: true });
    setStatus(profile, postId, { status: 'failed', method: 'email', to, error: err.message });
    throw new Error(`Sending to ${to} failed: ${err.message}`);
  }

  recordSend({ profile, postId, to, subject: copy.subject });
  return setStatus(profile, postId, { status: 'sent', method: 'email', to, subject: copy.subject, body: copy.body });
}

/** Generates the email copy without sending anything (the "Preview email" button). */
export async function previewEmail(profile, postId) {
  const post = getPost(profile, postId);
  if (!post) throw new Error("Post not found in this profile's results.");
  return generateEmailCopy(post, loadContext(profile));
}

export const sendOne = (profile, postId) => sendForPost(profile, postId, loadContext(profile));

// ---------------------------------------------------------------------------------------------
// Bulk send: runs in the background, one post at a time (generate copy -> send -> mark done).
// Safe to stop and restart - finished posts are skipped, so it continues where it left off.
// ---------------------------------------------------------------------------------------------
const bulkState = (globalThis.__bulkMailRun ||= { current: null });

export function startBulk(profile, filters = {}) {
  if (bulkState.current?.status === 'running') throw new Error('A bulk send is already running.');
  const ctx = loadContext(profile);
  if (!isMailConfigured()) throw new Error(NOT_CONFIGURED);

  const queue = listOutreach(profile, { ...filters, method: 'email', status: 'pending', relevance: 'relevant', formType: undefined })
    .posts.map((p) => p.postId);
  if (!queue.length) throw new Error('No pending email posts match the current filters.');

  const run = (bulkState.current = {
    profile, status: 'running', // running | finished | paused | stopped | limit_reached
    total: queue.length, sent: 0, failed: 0, errors: [], current: '', message: '', stopRequested: false,
    startedAt: new Date().toISOString(),
  });

  (async () => {
    let llmFailures = 0;
    try {
      for (const postId of queue) {
        if (run.stopRequested) { run.status = 'stopped'; run.message = 'Stopped by you. Start again to continue.'; return; }
        if (getSentToday() >= getEmailSettings().dailyLimit) {
          run.status = 'limit_reached';
          run.message = `Daily limit reached (${getEmailSettings().dailyLimit}). Continue tomorrow, or raise the limit.`;
          return;
        }
        run.current = postId;
        try {
          await sendForPost(profile, postId, ctx);
          run.sent++;
          llmFailures = 0;
          const delay = getEmailSettings().delaySeconds;
          for (let waited = 0; waited < delay && !run.stopRequested; waited++) await sleep(1000);
        } catch (err) {
          if (err.limitReached) { run.status = 'limit_reached'; run.message = err.message; return; }
          if (err.fatal) throw err;
          run.failed++;
          run.errors = [...run.errors.slice(-19), { postId, message: err.message }];
          if (err.transient && ++llmFailures >= PAUSE_AFTER_CONSECUTIVE_LLM_FAILURES) {
            run.status = 'paused';
            run.message = `Paused: the AI model failed ${llmFailures} times in a row (${err.message}). Start again when it works.`;
            return;
          }
        }
      }
      run.status = 'finished';
      run.message = `Done: ${run.sent} sent, ${run.failed} failed.`;
    } catch (err) {
      run.status = 'paused';
      run.message = `${err.message} Fix it and start again - sent emails are not repeated.`;
    } finally {
      run.current = '';
    }
  })();

  return run;
}

export function stopBulk() {
  if (bulkState.current?.status === 'running') bulkState.current.stopRequested = true;
  return bulkState.current;
}
