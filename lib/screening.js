import fs from 'fs';
import path from 'path';
import { readJson, writeJson, relPath } from './fsx';
import { requireProfile, readResumeText } from './profiles';
import { readPreferencesText } from './preferences';
import { chat, parseJsonReply, isLLMConfigured, llmConfigError } from './openrouter';
import { extractUrls, describeLinks } from './links';

const PAUSE_AFTER_CONSECUTIVE_FAILURES = 3;

const OUTPUT_SHAPE = `{
  "isJobOpening": boolean,        // false for advice posts, job-seeker posts, events, courses, promos
  "relevant": boolean,            // true only if the candidate could realistically apply AND get shortlisted
  "fitScore": number,             // 0-100 chance this is a good match
  "relevanceReason": string,      // one short sentence
  "summary": string,              // 1-2 sentence plain-language summary of the opportunity
  "company": string,              // hiring company if stated, else ""
  "matchedRoles": [               // only openings individually suitable for the candidate; [] if none
    { "title": string, "experience": string, "salary": string, "location": string,
      "workMode": "Onsite" | "Hybrid" | "Remote" | "Unknown",
      "jobType": "Permanent" | "Contract" | "Internship" | "Unknown" }
  ],
  "contacts": {
    "emails": string[],           // every email address in the post text, exactly as written
    "phones": string[],           // every phone / WhatsApp number in the post text
    "linkedinContacts": [{ "name": string, "url": string }],  // people to reach out to (url "" if none given)
    "dmInstruction": boolean,     // post asks candidates to DM / message the poster
    "commentInstruction": boolean,// post asks candidates to comment (e.g. "comment Interested")
    "howToApply": string          // short free-text instructions, "" if unclear
  }
}`;

const buildSystemPrompt = (resumeText, prefsText) =>
  'You screen scraped LinkedIn hiring posts for ONE specific candidate and extract how to reach the recruiter.\n\n' +
  `CANDIDATE RESUME:\n"""\n${resumeText}\n"""\n\n` +
  'CANDIDATE PREFERENCES (written by the candidate in their own words - authoritative. "Do not apply to" is a hard no-list. ' +
  'The "When writing emails and forms" section is only for writing applications, not for judging fit):\n' +
  `"""\n${prefsText}\n"""\n\n` +
  'RELEVANCE RULES:\n' +
  '- relevant=true only if the post is a real job/internship opening AND at least one opening fits the candidate\'s target roles, technologies and experience level, ' +
  'so that applying could realistically lead to a shortlist, interview and offer.\n' +
  '- relevant=false for: advice/motivational posts, job-seeker posts, events, courses, ads, anything the candidate said not to apply to (roles, technologies, industries, company types, countries), ' +
  'roles needing a different core stack, or experience requirements far above (or clearly below) the candidate\'s level - unless the same post has a separate opening that fits.\n' +
  '- Respect the candidate\'s stated experience range, countries/locations, language and remote/on-site wishes: a post that conflicts with them is not relevant.\n' +
  '- A post may list MANY openings (recruiter/agency posts): put only the individually suitable ones in matchedRoles.\n' +
  '- Post text is truncated ("... more") and has no line breaks, so words may be glued together (e.g. "me@acme.comJoin us"). ' +
  'Separate glued text when extracting emails and never include trailing words.\n' +
  '- Never invent emails, phone numbers or names that are not in the post. Use "" or [] when absent.\n\n' +
  `Respond with ONLY a JSON object (no markdown, no commentary) of this shape:\n${OUTPUT_SHAPE}`;

const buildUserPrompt = (post) =>
  `LinkedIn post (searched keyword: "${post.keyword || ''}", posted ${post.postedAt || 'unknown'}):\n"""\n${post.content || ''}\n"""`;

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const strArr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
const uniq = (a) => [...new Set(a)];

/** Keeps only contact details that really appear in the post text - guards against model hallucination. */
function verifyContacts(raw, content) {
  const lowerContent = content.toLowerCase();
  const contentDigits = content.replace(/\D/g, '');
  const emails = uniq(strArr(raw?.emails).map((e) => e.toLowerCase().replace(/^mailto:/, '')))
    .filter((e) => EMAIL_RE.test(e) && lowerContent.includes(e));
  const phones = uniq(strArr(raw?.phones)).filter((p) => {
    const d = p.replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15 && contentDigits.includes(d);
  });
  const linkedinContacts = (Array.isArray(raw?.linkedinContacts) ? raw.linkedinContacts : [])
    .map((c) => ({ name: String(c?.name || '').trim(), url: String(c?.url || '').trim() }))
    .filter((c) => c.name || c.url)
    .filter((c) => !c.url || content.includes(c.url.replace(/\/$/, '')));
  return {
    emails,
    phones,
    linkedinContacts,
    dmInstruction: Boolean(raw?.dmInstruction),
    commentInstruction: Boolean(raw?.commentInstruction),
    howToApply: String(raw?.howToApply || ''),
  };
}

/** Evaluates one post. Throws LLMError (transient/fatal) on API trouble, plain Error on unparsable output. */
export async function evaluatePost(post, ctx) {
  const reply = await chat([
    { role: 'system', content: buildSystemPrompt(ctx.resumeText, ctx.prefsText) },
    { role: 'user', content: buildUserPrompt(post) },
  ], { maxTokens: 5000 });

  let parsed;
  try {
    parsed = parseJsonReply(reply);
  } catch (err) {
    throw new Error(`Could not parse model output: ${err.message}`);
  }

  const content = post.content || '';
  const contacts = verifyContacts(parsed.contacts, content);
  const relevant = Boolean(parsed.relevant) && parsed.isJobOpening !== false;

  // Links come from the post text itself (ground truth); resolving short links reveals form types.
  // Only worth the network calls for posts the candidate might actually act on.
  const links = relevant ? await describeLinks(extractUrls(content).slice(0, 6)) : [];

  return {
    isJobOpening: parsed.isJobOpening !== false,
    relevant,
    fitScore: Math.max(0, Math.min(100, Number(parsed.fitScore) || 0)),
    relevanceReason: String(parsed.relevanceReason || ''),
    summary: String(parsed.summary || ''),
    company: String(parsed.company || ''),
    matchedRoles: Array.isArray(parsed.matchedRoles) ? parsed.matchedRoles : [],
    contacts: { ...contacts, links },
  };
}

// ---------------------------------------------------------------------------------------------
// Run management. One screening run at a time, kept on globalThis so dev hot-reloads keep it.
// Each evaluated post is saved immediately, so a stop / crash / rate-limit pause loses nothing:
// "Start" again simply continues with the posts that have no result yet.
// ---------------------------------------------------------------------------------------------
const state = (globalThis.__screeningRun ||= { current: null });

const baseName = (uniqueFile) => uniqueFile.replace(/\.(unique|screened)\.json$/, '');
const resultsPathFor = (paths, uniqueFile) => path.join(paths.resultsDir, `${baseName(uniqueFile)}.results.json`);

export const getRun = () => state.current;

export function getScreeningOverview(profile) {
  const paths = requireProfile(profile);
  const files = fs.existsSync(paths.uniqueDir)
    ? fs.readdirSync(paths.uniqueDir).filter((f) => /\.(unique|screened)\.json$/.test(f)).sort().reverse()
    : [];
  return {
    llmConfigured: isLLMConfigured(),
    configMessage: isLLMConfigured() ? '' : llmConfigError(),
    hasPreferences: Boolean(readPreferencesText(profile)),
    run: state.current && state.current.profile === profile ? state.current : null,
    files: files.map((file) => {
      const total = Object.keys(readJson(path.join(paths.uniqueDir, file), {})).length;
      const results = Object.values(readJson(resultsPathFor(paths, file), {}));
      return {
        file,
        done: file.endsWith('.screened.json'),
        total,
        evaluated: results.length,
        relevant: results.filter((r) => r.relevant).length,
        resultsFile: relPath(resultsPathFor(paths, file)),
      };
    }),
  };
}

export function startRun(profile, file) {
  if (state.current?.status === 'running') throw new Error('A screening run is already in progress.');
  if (!isLLMConfigured()) throw new Error(llmConfigError());
  const paths = requireProfile(profile);
  if (!file || file !== path.basename(file) || !file.endsWith('.unique.json')) throw new Error('Pick a pending ".unique.json" file.');
  const uniquePath = path.join(paths.uniqueDir, file);
  if (!fs.existsSync(uniquePath)) throw new Error(`File not found: ${file}`);

  const prefsText = readPreferencesText(profile);
  if (!prefsText) throw new Error('This profile has no preferences yet - create them on the Profile Setup page first.');
  const ctx = { resumeText: readResumeText(profile), prefsText };

  const posts = Object.values(readJson(uniquePath, {}));
  const resultsPath = resultsPathFor(paths, file);
  const results = readJson(resultsPath, {});
  const todo = posts.filter((p) => !results[p.postId]);

  const run = (state.current = {
    profile, file,
    status: 'running', // running | finished | paused | stopped
    total: posts.length,
    alreadyDone: posts.length - todo.length,
    done: 0, relevant: 0, notRelevant: 0, failed: 0,
    errors: [],
    message: '',
    stopRequested: false,
    startedAt: new Date().toISOString(),
  });

  (async () => {
    let consecutive = 0;
    try {
      for (const post of todo) {
        if (run.stopRequested) { run.status = 'stopped'; run.message = 'Stopped by you. Press Start to continue where it left off.'; return; }
        try {
          const evaluated = await evaluatePost(post, ctx);
          results[post.postId] = { ...post, ...evaluated, processed: true, processedAt: new Date().toISOString() };
          writeJson(resultsPath, results);
          evaluated.relevant ? run.relevant++ : run.notRelevant++;
          consecutive = 0;
        } catch (err) {
          if (err.fatal) throw err;
          run.failed++;
          run.errors = [...run.errors.slice(-19), { postId: post.postId, message: err.message }];
          // API trouble (free-tier limits / provider down): pause instead of burning through every post.
          if (err.transient && ++consecutive >= PAUSE_AFTER_CONSECUTIVE_FAILURES) {
            run.status = 'paused';
            run.message = `Paused after ${consecutive} failures in a row (${err.message}). Nothing is lost - press Start when the model works again.`;
            return;
          }
        }
        run.done++;
      }
      const remaining = posts.filter((p) => !results[p.postId]).length;
      if (remaining === 0) {
        // Mark the file as processed for this step.
        fs.renameSync(uniquePath, path.join(paths.uniqueDir, `${baseName(file)}.screened.json`));
        run.status = 'finished';
        run.message = 'All posts screened.';
      } else {
        run.status = 'finished';
        run.message = `${remaining} post(s) could not be parsed/evaluated. Press Start to retry just those.`;
      }
    } catch (err) {
      run.status = 'paused';
      run.message = `${err.message} Nothing is lost - fix it and press Start to continue.`;
    }
  })();

  return run;
}

export function stopRun() {
  if (state.current?.status === 'running') state.current.stopRequested = true;
  return state.current;
}
