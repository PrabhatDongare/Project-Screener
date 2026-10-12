import { ok, handle } from '@/lib/api';
import { listProfiles, createProfile, profilePaths } from '@/lib/profiles';
import { extractResumeText } from '@/lib/resumePdf';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => ok({ profiles: listProfiles() }));

// multipart: name + resume (PDF). Creates user-data/<name>/ with the resume and its extracted text.
export const POST = handle(async (request) => {
  const form = await request.formData();
  const name = String(form.get('name') || '').trim();
  const file = form.get('resume');
  profilePaths(name); // validates the folder name early
  if (!file || typeof file === 'string') throw new Error('Choose a PDF resume to upload.');
  if (!/\.pdf$/i.test(file.name || '')) throw new Error('Only PDF resumes are accepted.');

  const buffer = Buffer.from(await file.arrayBuffer());
  const text = await extractResumeText(buffer);
  createProfile(name, buffer, text);
  return ok({ profile: name, resumeChars: text.length, profiles: listProfiles() });
});
