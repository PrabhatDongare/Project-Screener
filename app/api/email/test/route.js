import { ok, handle } from '@/lib/api';
import { sendTestEmail, getEmailOverview } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

// Sends a test message from the saved account: { to, subject?, body? }
export const POST = handle(async (request) => {
  const message = await sendTestEmail(await request.json());
  return ok({ message, email: getEmailOverview() });
});
