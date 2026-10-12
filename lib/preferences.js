import fs from 'fs';
import path from 'path';
import { chat } from './openrouter';
import { requireProfile, readResumeText } from './profiles';
import { timestamp } from './fsx';

// Preferences are plain text (Markdown) written in the candidate's own words. The AI reads the whole file
// for screening and for writing emails. Code only reads the "Candidate details" block (signature, reply-to).
//   preferences.md                       the live file
//   preferences.backup-<stamp>.md        copies made before every AI rewrite
//   preferences.json (legacy)            auto-converted to preferences.md the first time it is needed
export const PREFS_FILE = 'preferences.md';
const FILE_RE = /^preferences(\.backup-\d{8}-\d{6})?\.md$/;

const H_CANDIDATE = 'Candidate details';
const H_EXPERIENCE = 'My experience';
const H_LOOKING = 'What I am looking for';
const H_AVOID = 'Do not apply to';
const H_EMAIL = 'When writing emails and forms';

export const TEMPLATE = `# Job preferences

## ${H_CANDIDATE}
Name:
Email:
Phone:
LinkedIn:
Location:

## ${H_EXPERIENCE}
(Years of experience, current role, main skills and technologies.)

## ${H_LOOKING}
(Roles, experience range, countries and cities, remote or on-site, job types, industries.)

## ${H_AVOID}
(Roles, technologies, industries, company types or countries you never want to apply to.)

## ${H_EMAIL}
(Tone, how to describe your location or relocation, notice period, whether to mention salary and what to write if asked.)
`;

// ---------------------------------------------------------------------------------------------
// Section helpers (headings are "## Name")
// ---------------------------------------------------------------------------------------------
const headingKey = (h) => h.trim().toLowerCase();

function splitSections(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const sections = [];
  let current = { heading: null, lines: [] };
  for (const line of lines) {
    const m = line.match(/^##\s+(.*\S)\s*$/);
    if (m) {
      sections.push(current);
      current = { heading: m[1], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections; // sections[0] is everything before the first "##" heading
}

const joinSections = (sections) =>
  sections.map((s) => (s.heading === null ? s.lines.join('\n') : `## ${s.heading}\n${s.lines.join('\n')}`)).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';

export function getSection(text, heading) {
  const s = splitSections(text).find((x) => x.heading && headingKey(x.heading) === headingKey(heading));
  return s ? s.lines.join('\n').trim() : '';
}

function setSection(text, heading, body) {
  const sections = splitSections(text);
  const found = sections.find((x) => x.heading && headingKey(x.heading) === headingKey(heading));
  const lines = ['', ...String(body).trim().split('\n'), ''];
  if (found) found.lines = lines;
  else sections.push({ heading, lines });
  return joinSections(sections);
}

/** Reads "Name: ..." style lines from the Candidate details block (falls back to the whole text). */
export function parseCandidate(text) {
  const block = getSection(text, H_CANDIDATE) || String(text || '');
  const get = (key) => {
    const m = block.match(new RegExp(`^[\\s>*-]*${key}\\s*:[ \\t]*(.+)$`, 'im'));
    return m ? m[1].trim().replace(/^\*+|\*+$/g, '').trim() : '';
  };
  return { name: get('Name'), email: get('Email'), phone: get('Phone'), linkedin: get('LinkedIn'), location: get('Location') };
}

const candidateBlock = (c) =>
  [`Name: ${c.name || ''}`, `Email: ${c.email || ''}`, `Phone: ${c.phone || ''}`, `LinkedIn: ${c.linkedin || ''}`, `Location: ${c.location || ''}`].join('\n');

const stripFences = (s) => String(s || '').replace(/^\s*```(?:markdown|md|text)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

// ---------------------------------------------------------------------------------------------
// Legacy JSON -> text (deterministic, no AI), so existing profiles keep working
// ---------------------------------------------------------------------------------------------
const list = (a) => (Array.isArray(a) ? a.filter(Boolean).join(', ') : '');

function jsonToText(p) {
  const c = p.candidate || {};
  const e = p.experience || {};
  const d = p.dontApplyTo || {};
  const bullets = (label, arr) => (arr && arr.length ? `- ${label}: ${list(arr)}` : '');
  const exp = [
    e.totalYears ? `About ${e.totalYears} years of experience${e.level ? ` (${e.level} level)` : ''}.` : '',
    e.currentRole ? `Currently ${e.currentRole}${e.currentCompany ? ` at ${e.currentCompany}` : ''}.` : '',
    e.summary || '',
    p.technologies?.primary?.length ? `Main technologies: ${list(p.technologies.primary)}.` : '',
    p.technologies?.secondary?.length ? `Also know: ${list(p.technologies.secondary)}.` : '',
  ].filter(Boolean).join('\n');
  const looking = [
    p.targetRoles?.length ? `Roles: ${list(p.targetRoles)}.` : '',
    p.alsoAcceptable?.length ? `Also acceptable: ${list(p.alsoAcceptable)}.` : '',
    p.jobTypes?.length ? `Job types: ${list(p.jobTypes)}.` : '',
    p.workModes?.length ? `Work mode: ${list(p.workModes)}.` : '',
    p.preferredLocations?.length ? `Locations: ${list(p.preferredLocations)}.` : '',
    p.preferredIndustries?.length ? `Industries: ${list(p.preferredIndustries)}.` : '',
    p.salaryExpectation ? `Salary expectation: ${p.salaryExpectation}.` : '',
    p.noticePeriod ? `Notice period: ${p.noticePeriod}.` : '',
    p.additionalPreferences || '',
  ].filter(Boolean).join('\n');
  const avoid = [bullets('Roles', d.roles), bullets('Technologies', d.technologies), bullets('Industries', d.industries),
    bullets('Company types', d.companyTypes), bullets('Experience levels', d.experienceLevels), bullets('Other', d.other)]
    .filter(Boolean).join('\n');
  let text = TEMPLATE;
  text = setSection(text, H_CANDIDATE, candidateBlock({ name: c.name, email: c.email, phone: c.phone, linkedin: c.linkedin, location: c.currentLocation }));
  text = setSection(text, H_EXPERIENCE, exp || '(none yet)');
  text = setSection(text, H_LOOKING, looking || '(none yet)');
  text = setSection(text, H_AVOID, avoid || '(nothing listed)');
  return text;
}

// ---------------------------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------------------------
/** The live preferences text, or null if the profile has none yet. Converts a legacy preferences.json on first use. */
export function readPreferencesText(profile) {
  const paths = requireProfile(profile);
  if (fs.existsSync(paths.preferences)) return fs.readFileSync(paths.preferences, 'utf8');
  if (fs.existsSync(paths.preferencesLegacy)) {
    try {
      const text = jsonToText(JSON.parse(fs.readFileSync(paths.preferencesLegacy, 'utf8')));
      fs.writeFileSync(paths.preferences, text);
      return text;
    } catch {
      return null;
    }
  }
  return null;
}

export function savePreferencesText(profile, text) {
  const t = String(text || '').replace(/\r/g, '');
  if (!t.trim()) throw new Error('The preferences text is empty.');
  fs.writeFileSync(requireProfile(profile).preferences, t.endsWith('\n') ? t : `${t}\n`);
}

const backupCurrent = (paths) => {
  if (fs.existsSync(paths.preferences)) {
    fs.copyFileSync(paths.preferences, paths.preferences.replace(/\.md$/, `.backup-${timestamp()}.md`));
  }
};

export function listPreferenceFiles(profile) {
  const paths = requireProfile(profile);
  readPreferencesText(profile); // triggers the legacy conversion so the list is never empty for old profiles
  return fs.readdirSync(paths.dir)
    .filter((f) => FILE_RE.test(f))
    .map((name) => ({ name, current: name === PREFS_FILE, modified: fs.statSync(path.join(paths.dir, name)).mtime.toISOString() }))
    .sort((a, b) => (a.current ? -1 : b.current ? 1 : b.modified.localeCompare(a.modified)));
}

export function readPreferenceFile(profile, name) {
  if (!FILE_RE.test(String(name || ''))) throw new Error('Invalid preferences file name.');
  const file = path.join(requireProfile(profile).dir, name);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${name}`);
  return fs.readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------------------------------------
// AI steps (both return text, so there is nothing to parse and nothing that can be "invalid JSON")
// ---------------------------------------------------------------------------------------------
const FORMAT_RULES =
  `Write plain Markdown using exactly these headings, in this order: "# Job preferences", "## ${H_CANDIDATE}", "## ${H_EXPERIENCE}", ` +
  `"## ${H_LOOKING}", "## ${H_AVOID}", "## ${H_EMAIL}".\n` +
  `Under "${H_CANDIDATE}" write exactly these lines: "Name: ...", "Email: ...", "Phone: ...", "LinkedIn: ...", "Location: ..." (leave a value empty if unknown).\n` +
  "Everything else is short, clear prose or bullet points in the candidate's own words. Do not use tables or JSON. Respond with ONLY the Markdown document.";

function assertLooksRight(text) {
  if (!/^##\s+/m.test(text) || !getSection(text, H_CANDIDATE)) {
    throw new Error("The model's reply was not in the expected format. Nothing was changed - try again.");
  }
}

/** Reads the resume (+ the user's extra wishes) with the LLM and writes preferences.md. */
export async function extractPreferences(profile, additionalPreferences = '') {
  const paths = requireProfile(profile);
  const extra = String(additionalPreferences || '').trim();
  const reply = await chat([
    {
      role: 'system',
      content:
        'You write a job-search preferences document for a candidate from their resume. ' + FORMAT_RULES + '\n' +
        "Never invent facts: keep a section's placeholder sentence in parentheses if nothing is known. " +
        'If the candidate wrote additional preferences, they OVERRIDE the resume and must be kept faithfully: ' +
        `wishes go under "${H_LOOKING}", refusals ("don't", "avoid", "never") under "${H_AVOID}", and how to write emails, salary, notice period or location wording under "${H_EMAIL}".`,
    },
    { role: 'user', content: `RESUME:\n"""\n${readResumeText(profile)}\n"""\n\nADDITIONAL PREFERENCES FROM THE CANDIDATE:\n"""\n${extra || '(none)'}\n"""` },
  ], { maxTokens: 5000 });

  const text = stripFences(reply);
  assertLooksRight(text);
  backupCurrent(paths);
  savePreferencesText(profile, text);
  return text;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Merges the candidate's edited text and plain-word notes into one final, consistent document.
 * Nothing is overwritten unless the model call succeeds; the previous file is backed up first.
 */
export async function refinePreferences(profile, editedText, notes = '') {
  const paths = requireProfile(profile);
  const edited = String(editedText || '').replace(/\r/g, '').trim();
  if (!edited) throw new Error('The preferences text is empty.');
  const extraNotes = String(notes || '').trim();

  const reply = await chat([
    {
      role: 'system',
      content:
        "You finalise a candidate's job-search preferences document. You get the resume, the candidate's CURRENT EDITED document and optional new notes. " + FORMAT_RULES + '\n' +
        'Rules: the edited document and the notes are AUTHORITATIVE. Keep every instruction the candidate wrote, in their meaning and (as far as possible) their words; never drop anything under ' +
        `"${H_AVOID}". Put the new notes into the right section (wishes -> "${H_LOOKING}", refusals -> "${H_AVOID}", email/salary/notice/location wording -> "${H_EMAIL}"). ` +
        'Remove duplicates, fix obvious contradictions in favour of the newest words, and tidy wording. Use the resume only to fill things the candidate left empty; never invent facts.',
    },
    { role: 'user', content: `RESUME:\n"""\n${readResumeText(profile)}\n"""\n\nCURRENT EDITED DOCUMENT:\n"""\n${edited}\n"""\n\nNEW NOTES FROM THE CANDIDATE:\n"""\n${extraNotes || '(none)'}\n"""` },
  ], { maxTokens: 5000 });

  let final = stripFences(reply);
  assertLooksRight(final);

  // Safety net 1: the candidate's own contact lines always win over the model's.
  const mine = parseCandidate(edited);
  const theirs = parseCandidate(final);
  final = setSection(final, H_CANDIDATE, candidateBlock({
    name: mine.name || theirs.name, email: mine.email || theirs.email, phone: mine.phone || theirs.phone,
    linkedin: mine.linkedin || theirs.linkedin, location: mine.location || theirs.location,
  }));

  // Safety net 2: no "Do not apply to" line may be lost. Missing ones are appended back verbatim.
  const finalAvoid = getSection(final, H_AVOID);
  const finalNorm = norm(finalAvoid);
  const lost = getSection(edited, H_AVOID).split('\n').map((l) => l.trim())
    .filter((l) => l && !/^\(.*\)$/.test(l))
    .filter((l) => norm(l) && !finalNorm.includes(norm(l)));
  if (lost.length) final = setSection(final, H_AVOID, `${finalAvoid}\n${lost.join('\n')}`);

  backupCurrent(paths);
  savePreferencesText(profile, final);
  return final;
}
