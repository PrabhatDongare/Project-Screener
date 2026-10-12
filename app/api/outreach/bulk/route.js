import { ok, handle } from '@/lib/api';
import { startBulk, stopBulk, getEmailOverview } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => ok({ email: getEmailOverview() }));

// body: { profile, action: "start" | "stop", filters: { search, sortBy } }
export const POST = handle(async (request) => {
  const { profile, action, filters } = await request.json();
  if (action === 'stop') stopBulk();
  else startBulk(profile, filters || {});
  return ok({ email: getEmailOverview() });
});
