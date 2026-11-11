import type {Env} from './types';

/**
 * Temporary staging authentication, deliberately NOT OAuth.
 * Can only access the read-only MCP tools in index.ts.
 */
export function isAuthorized(request: Request, env: Pick<Env, 'STAGING_BEARER_TOKEN'>): boolean {
  const match = /^Bearer ([0-9a-fA-F]{64})$/.exec(request.headers.get('Authorization') ?? '');
  const expected = env.STAGING_BEARER_TOKEN ?? '';
  if (!match || !/^[0-9a-fA-F]{64}$/.test(expected)) return false;
  const candidate = match[1];
  // Compare all fixed-length bytes without exiting on the first mismatch.
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function configError(env: Partial<Env>): string | null {
  if (env.APP_MODE !== 'staging-readonly') return 'APP_MODE must be staging-readonly';
  if (env.WP_URL !== 'https://seosir.ir') return 'WP_URL must exactly match https://seosir.ir';
  if (env.WP_USERNAME !== 'mcp-editor') return 'WP_USERNAME must equal mcp-editor';
  if (!/^[0-9a-fA-F]{64}$/.test(env.STAGING_BEARER_TOKEN ?? '')) return 'Missing or invalid STAGING_BEARER_TOKEN';
  if (!env.WP_APPLICATION_PASSWORD || !/^[0-9a-zA-Z\s]{24,40}$/.test(env.WP_APPLICATION_PASSWORD)) return 'Missing or invalid WordPress Application Password';
  if (!env.DB || typeof env.DB.prepare !== 'function') return 'D1 database binding DB missing';
  return null;
}
