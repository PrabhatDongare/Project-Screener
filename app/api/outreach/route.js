import { ok, handle } from '@/lib/api';
import { listOutreach, setStatus, clearStatus, getPost } from '@/lib/outreach';
import { sendOne, previewEmail, getEmailOverview } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request) => {
  const q = new URL(request.url).searchParams;
  const { posts, counts } = listOutreach(q.get('profile'), {
    method: q.get('method') || undefined,
    formType: q.get('formType') || undefined,
    status: q.get('status') || undefined,
    relevance: q.get('relevance') || undefined,
    search: q.get('search') || undefined,
    sortBy: q.get('sortBy') || undefined,
  });
  return ok({ total: posts.length, counts, posts: posts.slice(0, 300) });
});

// Manual marks: { profile, postId, action: "done" | "undo", method }
export const PUT = handle(async (request) => {
  const { profile, postId, action, method } = await request.json();
  if (!getPost(profile, postId)) throw new Error('Post not found.');
  if (action === 'undo') {
    clearStatus(profile, postId);
    return ok({ outreach: null });
  }
  return ok({ outreach: setStatus(profile, postId, { status: 'done', method: method || 'manual' }) });
});

// Generate email copy with the LLM and send it for one post: { profile, postId }
export const POST = handle(async (request) => {
  const { profile, postId, preview } = await request.json();
  if (preview) return ok({ preview: await previewEmail(profile, postId) });
  const outreach = await sendOne(profile, postId);
  return ok({ outreach, email: getEmailOverview() });
});
