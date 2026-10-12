import { NextResponse } from 'next/server';

export const ok = (data = {}) => NextResponse.json({ success: true, ...data });

export const fail = (err, status = 400) =>
  NextResponse.json({ success: false, message: err?.message || String(err) }, { status });

// Wraps a handler so thrown errors become { success: false, message } responses.
export const handle = (fn) => async (request, ctx) => {
  try {
    return await fn(request, ctx);
  } catch (err) {
    return fail(err);
  }
};

export const profileParam = (request) => new URL(request.url).searchParams.get('profile') || '';
