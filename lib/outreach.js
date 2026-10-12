import fs from 'fs';
import path from 'path';
import { readJson, writeJson } from './fsx';
import { requireProfile } from './profiles';
import { isFormType } from './links';

export const METHODS = ['email', 'form', 'website', 'phone', 'linkedin_dm', 'comment', 'none'];

/** All screened posts of a profile (every results file merged), newest first. */
export function loadResults(profile) {
  const { resultsDir } = requireProfile(profile);
  const merged = {};
  if (fs.existsSync(resultsDir)) {
    for (const f of fs.readdirSync(resultsDir).filter((n) => n.endsWith('.results.json'))) {
      const source = f.replace(/\.results\.json$/, '');
      for (const [id, post] of Object.entries(readJson(path.join(resultsDir, f), {}))) {
        merged[id] = { ...post, sourceFile: source };
      }
    }
  }
  return Object.values(merged);
}

/** Ways to reach the hiring side of a post, derived from the stored extraction. */
export function deriveMethods(post) {
  const c = post.contacts || {};
  const links = c.links || [];
  const methods = [];
  if ((c.emails || []).length) methods.push('email');
  if (links.some((l) => isFormType(l.type))) methods.push('form');
  if (links.some((l) => l.type === 'website' || l.type === 'job_portal')) methods.push('website');
  if ((c.phones || []).length || links.some((l) => l.type === 'whatsapp')) methods.push('phone');
  if ((c.linkedinContacts || []).length || c.dmInstruction) methods.push('linkedin_dm');
  if (c.commentInstruction) methods.push('comment');
  if (!methods.length) methods.push('none');
  return methods;
}

export const getStatusMap = (profile) => readJson(requireProfile(profile).outreachStatus, {});

export function setStatus(profile, postId, entry) {
  const file = requireProfile(profile).outreachStatus;
  const map = readJson(file, {});
  map[postId] = { ...entry, at: new Date().toISOString() };
  writeJson(file, map);
  return map[postId];
}

export function clearStatus(profile, postId) {
  const file = requireProfile(profile).outreachStatus;
  const map = readJson(file, {});
  delete map[postId];
  writeJson(file, map);
}

const statusGroup = (entry) => (!entry ? 'pending' : entry.status === 'failed' ? 'failed' : 'done');

/**
 * Filtered view for the Outreach page.
 * filters: { method, formType, status: pending|done|failed|all, relevance: relevant|not_relevant|all, search, sortBy: newest|fit }
 */
export function listOutreach(profile, filters = {}) {
  const statusMap = getStatusMap(profile);
  const relevance = filters.relevance || 'relevant';
  const wantedStatus = filters.status || 'pending';
  const search = (filters.search || '').toLowerCase();

  let posts = loadResults(profile).map((p) => ({ ...p, methods: deriveMethods(p), outreach: statusMap[p.postId] || null }));

  if (relevance === 'relevant') posts = posts.filter((p) => p.relevant);
  else if (relevance === 'not_relevant') posts = posts.filter((p) => !p.relevant);
  if (wantedStatus !== 'all') posts = posts.filter((p) => statusGroup(p.outreach) === wantedStatus);
  if (search) {
    posts = posts.filter((p) =>
      [p.content, p.summary, p.company, p.authorProfileUrl, ...(p.matchedRoles || []).map((r) => r.title)]
        .some((v) => v && String(v).toLowerCase().includes(search)));
  }

  // Counts for the filter chips are taken before the method filter is applied.
  const counts = { all: posts.length };
  for (const m of METHODS) counts[m] = posts.filter((p) => p.methods.includes(m)).length;

  if (filters.method && filters.method !== 'all') posts = posts.filter((p) => p.methods.includes(filters.method));
  if (filters.formType) posts = posts.filter((p) => (p.contacts?.links || []).some((l) => l.type === filters.formType));

  if (filters.sortBy === 'fit') posts.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));
  else posts.sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));

  return { posts, counts };
}

export function getPost(profile, postId) {
  return loadResults(profile).find((p) => p.postId === String(postId)) || null;
}
