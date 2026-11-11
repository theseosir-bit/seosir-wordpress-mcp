import type {Env} from './types';

export class WPRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(`WordPress returned HTTP ${status} (${code})`);
  }
}

const ALLOWED_ORIGIN = 'https://seosir.ir';

export async function wpRequest(env: Env, restPath: string): Promise<any> {
  if (env.WP_URL !== ALLOWED_ORIGIN) throw new Error('Unexpected WordPress origin');
  if (!restPath.startsWith('/wp-json/') || restPath.startsWith('//') || restPath.includes('\\')) {
    throw new Error('Unsafe internal WordPress endpoint');
  }
  const url = new URL(restPath, env.WP_URL);
  if (url.origin !== ALLOWED_ORIGIN) throw new Error('Blocked cross-origin WordPress URL');
  const basic = btoa(`${env.WP_USERNAME}:${env.WP_APPLICATION_PASSWORD.replace(/\s+/g, '')}`);
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'error',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Accept': 'application/json',
      'Cache-Control': 'no-store',
    },
    signal: AbortSignal.timeout(25000),
  });
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new WPRequestError(response.status, 'non_json_response');
  }
  const payload: any = await response.json();
  if (!response.ok) {
    throw new WPRequestError(response.status, typeof payload?.code === 'string' ? payload.code : 'wordpress_error');
  }
  return payload;
}

export async function publishedPost(env: Env, id: number): Promise<any> {
  const p = await wpRequest(env, `/wp-json/wp/v2/posts/${id}?context=edit&_fields=id,title,content,excerpt,status,slug,link,modified_gmt`);
  if (p.status !== 'publish') throw new WPRequestError(403, 'only_published_posts_allowed');
  return p;
}

export async function assertPublishedPostOrPage(env: Env, id: number): Promise<void> {
  // Only post/page are accepted, not arbitrary CPTs or private Elementor templates.
  for (const type of ['posts', 'pages']) {
    try {
      const p = await wpRequest(env, `/wp-json/wp/v2/${type}/${id}?context=edit&_fields=id,status`);
      if (p.status !== 'publish') throw new WPRequestError(403, 'only_published_content_allowed');
      return;
    } catch (e) {
      if (e instanceof WPRequestError && e.status === 404) continue;
      throw e;
    }
  }
  throw new WPRequestError(404, 'post_or_page_not_found');
}
