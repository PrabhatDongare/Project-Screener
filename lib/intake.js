import fs from 'fs';
import path from 'path';
import { readJson, writeJson, relPath, timestamp } from './fsx';
import { requireProfile } from './profiles';

// processed-ids.json: { "<postId>": { source: "<unique file>", addedAt: "<ISO>" } }
// Keyed by id for O(1) lookups; written only after the unique file is safely on disk.

const toEntries = (data) => {
  if (Array.isArray(data)) {
    return data.filter((p) => p && p.postId != null).map((p) => [String(p.postId), p]);
  }
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .filter(([, p]) => p && typeof p === 'object')
      .map(([id, p]) => [String(p.postId ?? id), { ...p, postId: String(p.postId ?? id) }]);
  }
  throw new Error('Expected a JSON array of posts, or an object keyed by postId.');
};

const safeBase = (fileName) =>
  path.basename(fileName, path.extname(fileName)).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'posts';

/**
 * Step 2: dedupe an uploaded scrape against everything this profile has already seen.
 *  1. keep an untouched copy in posts/1-uploaded
 *  2. write never-seen posts to posts/2-unique/<name>__<stamp>.unique.json
 *  3. record their ids in posts/processed-ids.json
 */
export function intakePostsFile(profile, originalName, rawText) {
  const paths = requireProfile(profile);

  let entries;
  try {
    entries = toEntries(JSON.parse(rawText));
  } catch (err) {
    throw new Error(`Could not read that file: ${err.message}`);
  }
  if (!entries.length) throw new Error('No posts with a postId were found in that file.');

  let base = `${safeBase(originalName)}__${timestamp()}`;
  fs.mkdirSync(paths.uploadedDir, { recursive: true });
  // Two uploads inside the same second must not overwrite each other's copy.
  for (let n = 2; fs.existsSync(path.join(paths.uploadedDir, `${base}.uploaded.json`)); n++) {
    base = `${base.replace(/-\d+$/, '')}-${n}`;
  }
  const copyPath = path.join(paths.uploadedDir, `${base}.uploaded.json`);
  fs.writeFileSync(copyPath, rawText);

  const processed = readJson(paths.processedIds, {});
  const now = new Date().toISOString();
  const fresh = {};
  let alreadyProcessed = 0;
  let duplicatesInFile = 0;

  for (const [id, post] of entries) {
    if (processed[id]) alreadyProcessed++;
    else if (fresh[id]) duplicatesInFile++;
    else fresh[id] = post;
  }

  const freshIds = Object.keys(fresh);
  let uniqueFile = null;
  if (freshIds.length) {
    uniqueFile = `${base}.unique.json`;
    writeJson(path.join(paths.uniqueDir, uniqueFile), fresh);
    const newIds = {};
    for (const id of freshIds) newIds[id] = { source: uniqueFile, addedAt: now };
    writeJson(paths.processedIds, { ...processed, ...newIds });
  }

  return {
    uploadedCopy: relPath(copyPath),
    uniqueFile,
    totalInUpload: entries.length,
    newPosts: freshIds.length,
    alreadyProcessed,
    duplicatesInFile,
    totalProcessedIds: Object.keys(processed).length + freshIds.length,
  };
}

export function getIntakeOverview(profile) {
  const paths = requireProfile(profile);
  const list = (dir, test) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(test).sort().reverse() : []);
  return {
    totalProcessedIds: Object.keys(readJson(paths.processedIds, {})).length,
    uploads: list(paths.uploadedDir, (f) => f.endsWith('.uploaded.json')),
    uniqueFiles: list(paths.uniqueDir, (f) => /\.(unique|screened)\.json$/.test(f)),
  };
}
