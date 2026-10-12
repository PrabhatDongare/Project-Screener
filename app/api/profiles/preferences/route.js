import { ok, handle, profileParam } from '@/lib/api';
import { requireProfile } from '@/lib/profiles';
import {
  extractPreferences, refinePreferences, listPreferenceFiles, readPreferenceFile,
  readPreferencesText, savePreferencesText, parseCandidate, TEMPLATE,
} from '@/lib/preferences';
import { relPath } from '@/lib/fsx';

export const dynamic = 'force-dynamic';

// Preferences are plain text (Markdown).
// ?profile=x            -> list of preference files + the text of the current one
// ?profile=x&file=name  -> text of one file (current or an earlier version)
export const GET = handle(async (request) => {
  const profile = profileParam(request);
  const paths = requireProfile(profile);
  const wanted = new URL(request.url).searchParams.get('file');
  const files = listPreferenceFiles(profile);
  const name = wanted || (files.length ? files[0].name : '');
  const content = name ? readPreferenceFile(profile, name) : '';
  return ok({
    files,
    selected: name,
    content,
    template: TEMPLATE,
    candidate: parseCandidate(readPreferencesText(profile) || ''),
    file: relPath(paths.preferences),
  });
});

// "Save as written": stores the text exactly as typed in preferences.md (no AI).
export const PUT = handle(async (request) => {
  const { profile, content } = await request.json();
  savePreferencesText(profile, content);
  return ok({ content: readPreferencesText(profile) });
});

// Without `refine`: AI writes preferences.md from the resume (+ `additionalPreferences`).
// With `refine: true`: AI merges the edited `content` (+ `notes`) into the final preferences.md.
export const POST = handle(async (request) => {
  const { profile, additionalPreferences, refine, content, notes } = await request.json();
  const file = relPath(requireProfile(profile).preferences);
  if (refine) return ok({ content: await refinePreferences(profile, content, notes), file });
  return ok({ content: await extractPreferences(profile, additionalPreferences), file });
});
