import { ok, handle, profileParam } from '@/lib/api';
import { intakePostsFile, getIntakeOverview } from '@/lib/intake';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => ok(getIntakeOverview(profileParam(request))));

// multipart: profile + file (scraped posts JSON). Dedupes against ids already seen by this profile.
export const POST = handle(async (request) => {
  const form = await request.formData();
  const profile = String(form.get('profile') || '');
  const file = form.get('file');
  if (!file || typeof file === 'string') throw new Error('Choose the posts JSON file to upload.');
  if (!/\.json$/i.test(file.name || '')) throw new Error('Only .json files are accepted.');
  const result = intakePostsFile(profile, file.name, await file.text());
  return ok({ result, overview: getIntakeOverview(profile) });
});
