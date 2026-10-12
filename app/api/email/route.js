import { ok, handle } from '@/lib/api';
import { getEmailOverview, saveEmailSettings, verifyMail, saveAccount } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => ok({ email: getEmailOverview() }));

// Daily limit / delay between emails, editable from the Outreach screen.
export const PUT = handle(async (request) => {
  saveEmailSettings(await request.json());
  return ok({ email: getEmailOverview() });
});

// Checks the SMTP login without sending anything.
export const POST = handle(async () => ok({ message: await verifyMail() }));

// Save the SMTP account from the screen (stored in data/email-account.json, which is gitignored).
export const PATCH = handle(async (request) => {
  saveAccount(await request.json());
  return ok({ email: getEmailOverview() });
});
