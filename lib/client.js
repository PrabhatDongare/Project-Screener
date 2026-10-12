'use client';

import { useEffect, useRef } from 'react';

/** fetch wrapper: returns parsed JSON, throws Error(message) when the API says success:false. */
export async function api(url, options = {}) {
  const { json, ...rest } = options;
  const init = { ...rest };
  if (json !== undefined) {
    init.method = init.method || 'POST';
    init.headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
    init.body = JSON.stringify(json);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Could not reach the app server. Is `npm run dev` still running?');
  }
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`Unexpected response from server (HTTP ${res.status})`);
  if (data.success === false) throw new Error(data.message || 'Request failed');
  return data;
}

/** Calls fn every `ms` while `active` is true (used to follow background runs). */
export function usePoll(fn, ms, active) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms, active]);
}
