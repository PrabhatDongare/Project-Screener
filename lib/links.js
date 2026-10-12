// Link handling for scraped posts: LinkedIn shows every URL as a lnkd.in short link, so the real
// destination (Google Form? Microsoft Form? company site?) is only visible after resolving it.

const SHORTENERS = ['bit.ly', 'rb.gy', 'tinyurl.com', 'goo.gle', 't.co', 'ow.ly', 'cutt.ly', 'shorturl.at', 'is.gd', 'buff.ly', 'tiny.cc'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
};

/** Pulls http(s) URLs out of flat post text, trimming glued-on trailing words/punctuation. */
export function extractUrls(text) {
  const found = [];
  for (const raw of String(text || '').match(/https?:\/\/[^\s<>"')\]]+/g) || []) {
    let url = raw.replace(/[.,;:!?…]+$/, '');
    // lnkd.in codes are 8 chars; scraped text often glues the next word on ("lnkd.in/gtW-tegwWe are...").
    const m = url.match(/^(https?:\/\/lnkd\.in\/)([\w-]{8})/i);
    if (m) url = m[1] + m[2];
    if (!found.includes(url)) found.push(url);
  }
  return found;
}

export function classifyUrl(url) {
  const host = hostOf(url);
  const lower = url.toLowerCase();
  if (host === 'forms.gle' || (host === 'docs.google.com' && lower.includes('/forms'))) return 'google_form';
  if (host.endsWith('forms.office.com') || host.endsWith('forms.microsoft.com') || host.endsWith('forms.cloud.microsoft')) return 'microsoft_form';
  if (/(^|\.)(typeform\.com|jotform\.com|tally\.so|airtable\.com|zohopublic\.com|zfrmz\.(com|in)|wufoo\.com|surveymonkey\.com|forms\.app|paperform\.co|fillout\.com|hubspot\.com)$/.test(host)) return 'other_form';
  if (host === 'wa.me' || host.endsWith('whatsapp.com')) return 'whatsapp';
  if (host.endsWith('linkedin.com') || host === 'lnkd.in') return 'linkedin';
  if (/(greenhouse\.io|lever\.co|workday|myworkdayjobs|ashbyhq|smartrecruiters|naukri\.com|indeed\.com|instahyre|wellfound|angel\.co|foundit|cutshort|unstop|internshala|ats\.|jobs\.|careers\.)/.test(host)) return 'job_portal';
  return 'website';
}

export const isFormType = (type) => type === 'google_form' || type === 'microsoft_form' || type === 'other_form';

const cache = new Map();

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000), ...options });
}

/** Follows a short link to its real destination. Returns the original URL if it cannot be resolved. */
export async function resolveUrl(url) {
  if (cache.has(url)) return cache.get(url);
  let resolved = url;
  try {
    const host = hostOf(url);
    if (host === 'lnkd.in') {
      // LinkedIn answers with an interstitial HTML page that contains the external destination.
      const html = await (await fetchWithTimeout(url)).text();
      const candidates = (html.match(/https?:\/\/[^"'<>\s]+/g) || [])
        .map((u) => u.replace(/&amp;/g, '&'))
        .filter((u) => !/(^https?:\/\/([\w-]+\.)*(linkedin\.com|licdn\.com|lnkd\.in)|w3\.org|schema\.org)/i.test(u));
      if (candidates[0]) resolved = candidates[0];
    } else if (SHORTENERS.includes(host)) {
      const res = await fetchWithTimeout(url, { redirect: 'follow' });
      if (res.url && !/cloudflare|challenge/i.test(res.url)) resolved = res.url;
    }
  } catch {
    // network/timeouts: keep the short link; the user can still open it by hand
  }
  cache.set(url, resolved);
  return resolved;
}

/** [{ url, resolvedUrl, type }] for each URL, with form type detected after resolving short links. */
export async function describeLinks(urls) {
  const out = [];
  for (const url of urls) {
    const resolvedUrl = await resolveUrl(url);
    const type = classifyUrl(resolvedUrl !== url ? resolvedUrl : url);
    out.push({ url, resolvedUrl, type });
  }
  return out;
}
