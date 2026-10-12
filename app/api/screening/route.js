import { ok, handle, profileParam } from '@/lib/api';
import { getScreeningOverview, startRun, stopRun } from '@/lib/screening';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => ok(getScreeningOverview(profileParam(request))));

// body: { profile, action: "start" | "stop", file }
export const POST = handle(async (request) => {
  const { profile, action, file } = await request.json();
  if (action === 'stop') stopRun();
  else startRun(profile, file);
  return ok(getScreeningOverview(profile));
});
