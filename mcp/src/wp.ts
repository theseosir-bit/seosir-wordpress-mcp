import 'dotenv/config';

const base = (process.env.WP_URL ?? '').replace(/\/+$/, '');
const username = process.env.WP_USERNAME ?? '';
const appPassword = process.env.WP_APPLICATION_PASSWORD ?? '';

export function validateWordPressEnv() {
  if (!base || !username || !appPassword) {
    throw new Error('WP_URL, WP_USERNAME and WP_APPLICATION_PASSWORD are mandatory');
  }
  const url = new URL(base);
  const local = ['localhost','127.0.0.1','::1'].includes(url.hostname);
  if (!local && url.protocol !== 'https:') {
    throw new Error('WP_URL must use HTTPS outside localhost');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('WP_URL may not contain credentials, query or fragment');
  }
}

export class WordPressError extends Error {
  constructor(public readonly status: number, readonly detail: unknown) {
    super(`WordPress returned HTTP ${status}`);
  }
}

export async function wp(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  // Critical: path must be a relative internal WP REST path, never a model-supplied URL.
  if (!path.startsWith('/wp-json/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('Blocked unsafe WordPress path');
  }
  const url = new URL(base + path);
  if (url.origin !== new URL(base).origin) throw new Error('Blocked cross-origin WordPress URL');
  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const response = await fetch(url, {
    method,
    redirect: 'error',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : {'Content-Type': 'application/json'})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000)
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new WordPressError(response.status, 'Expected JSON; check WAF, URL and authentication');
  }
  const payload = await response.json();
  if (!response.ok) throw new WordPressError(response.status, payload);
  return payload;
}
