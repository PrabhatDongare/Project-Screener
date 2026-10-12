import { sleep } from './fsx';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class LLMError extends Error {
  constructor(message, { fatal = false, transient = false, status = 0 } = {}) {
    super(message);
    this.fatal = fatal;         // auth/credit/config problem: no point continuing a run
    this.transient = transient; // rate limit / upstream / network: retry, then pause the run
    this.status = status;
  }
}

export const isLLMConfigured = () => Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL);

export const llmConfigError = () => {
  const missing = ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL'].filter((k) => !process.env[k]);
  return `${missing.join(' and ')} not set. Add ${missing.length > 1 ? 'them' : 'it'} to v2/.env.local and restart the dev server.`;
};

// One HTTP call, no retries. Classifies failures so callers can retry, pause or abort.
async function request(body) {
  if (!isLLMConfigured()) throw new LLMError(llmConfigError(), { fatal: true });
  let response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'LinkedIn Job Outreach',
      },
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL, ...body }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (err) {
    throw new LLMError(`Network error talking to OpenRouter: ${err.message}`, { transient: true });
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    // OpenRouter can also answer HTTP 200 with an {error} body when the upstream provider fails.
    const code = response.ok ? Number(data.error.code) || 502 : response.status;
    const apiMsg = data?.error?.message || (data?.error ? JSON.stringify(data.error) : `HTTP ${code}`);
    if (code === 401) throw new LLMError(`Authentication failed - check OPENROUTER_API_KEY (${apiMsg})`, { fatal: true, status: code });
    if (code === 402) throw new LLMError(`Insufficient OpenRouter credits (${apiMsg})`, { fatal: true, status: code });
    if (code === 404) throw new LLMError(`Model not found / unavailable - check OPENROUTER_MODEL (${apiMsg})`, { fatal: true, status: code });
    throw new LLMError(`OpenRouter error ${code}: ${apiMsg}`, { transient: code === 429 || code === 408 || code >= 500, status: code });
  }
  return data;
}

/** The "Hi are you listening" ping behind the Test button (single attempt, no retries). */
export async function testConnection() {
  const data = await request({
    max_tokens: 300,
    messages: [{ role: 'user', content: 'Hi are you listening' }],
  });
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new LLMError('OpenRouter answered but returned no message.', { transient: true });
  return { model: data.model || process.env.OPENROUTER_MODEL, reply: (msg.content || msg.reasoning || '(empty reply)').trim() };
}

/** Chat completion returning text, retrying transient (free-tier) failures with backoff. */
// Reasoning ("thinking") models spend part of max_tokens on hidden reasoning. If that eats the whole
// budget the reply comes back empty/cut off with finish_reason "length"; we then retry with a bigger budget.
const MAX_TOKEN_CEILING = 16000;

export async function chat(messages, { maxTokens = 4000, attempts = 4 } = {}) {
  let lastError;
  let budget = maxTokens;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let truncated = false;
    try {
      const data = await request({ temperature: 0, max_tokens: budget, reasoning: { effort: 'low' }, messages });
      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      truncated = choice?.finish_reason === 'length';
      if (!content || !content.trim()) {
        throw new LLMError(
          truncated ? 'Model ran out of tokens before answering (reasoning model).' : 'Model returned an empty reply.',
          { transient: true },
        );
      }
      if (truncated && !content.includes('}')) throw new LLMError('Model reply was cut off (token limit).', { transient: true });
      return content;
    } catch (err) {
      lastError = err;
      if (!err.transient || attempt === attempts) break;
      if (/token/i.test(err.message)) {
        budget = Math.min(budget * 2, MAX_TOKEN_CEILING); // retry straight away with more room
      } else {
        await sleep(3000 * 2 ** (attempt - 1)); // 3s, 6s, 12s
      }
    }
  }
  throw lastError;
}

// Models sometimes wrap JSON in ```fences``` or add a preamble; pull out the outermost object.
export function parseJsonReply(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Model reply contained no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}
