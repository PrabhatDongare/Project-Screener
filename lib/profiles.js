import fs from 'fs';
import path from 'path';
import { USER_DATA_DIR, relPath } from './fsx';

// Folder layout of one profile (everything the app stores for a user lives here):
//   resume/               resume.pdf + resume.txt (extracted text)
//   preferences.md        editable job preferences, plain text in the candidate's own words
//   posts/1-uploaded/     untouched copies of every uploaded scrape
//   posts/2-unique/       posts never seen before (.unique.json -> .screened.json once the AI step is done)
//   posts/processed-ids.json
//   results/              AI screening results, one file per unique file
//   outreach/status.json  what has been sent / marked done
export const profilePaths = (name) => {
  const clean = String(name || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,49}$/.test(clean)) {
    throw new Error('Profile name must be 1-50 characters: letters, numbers, spaces, "-" or "_".');
  }
  const dir = path.join(USER_DATA_DIR, clean);
  return {
    name: clean,
    dir,
    resumePdf: path.join(dir, 'resume', 'resume.pdf'),
    resumeTxt: path.join(dir, 'resume', 'resume.txt'),
    preferences: path.join(dir, 'preferences.md'),
    preferencesLegacy: path.join(dir, 'preferences.json'), // older versions stored JSON; converted to .md on first use
    uploadedDir: path.join(dir, 'posts', '1-uploaded'),
    uniqueDir: path.join(dir, 'posts', '2-unique'),
    processedIds: path.join(dir, 'posts', 'processed-ids.json'),
    resultsDir: path.join(dir, 'results'),
    outreachStatus: path.join(dir, 'outreach', 'status.json'),
  };
};

export const requireProfile = (name) => {
  const p = profilePaths(name);
  if (!fs.existsSync(p.dir)) throw new Error(`Profile "${name}" does not exist.`);
  return p;
};

export const listProfiles = () => {
  if (!fs.existsSync(USER_DATA_DIR)) return [];
  return fs.readdirSync(USER_DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => {
      const p = profilePaths(d.name);
      return {
        name: d.name,
        hasResume: fs.existsSync(p.resumeTxt),
        hasPreferences: fs.existsSync(p.preferences) || fs.existsSync(p.preferencesLegacy),
        preferencesFile: relPath(p.preferences),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const createProfile = (name, pdfBuffer, resumeText) => {
  const p = profilePaths(name);
  if (fs.existsSync(p.dir)) {
    throw new Error(`A profile named "${p.name}" already exists. Pick another name or select the existing one.`);
  }
  fs.mkdirSync(path.dirname(p.resumePdf), { recursive: true });
  fs.writeFileSync(p.resumePdf, pdfBuffer);
  fs.writeFileSync(p.resumeTxt, resumeText);
  return p;
};

export const readResumeText = (name) => {
  const p = requireProfile(name);
  if (!fs.existsSync(p.resumeTxt)) throw new Error('This profile has no resume text.');
  return fs.readFileSync(p.resumeTxt, 'utf8');
};

