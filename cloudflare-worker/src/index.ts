import {McpServer} from '@modelcontextprotocol/server';
import {createMcpHandler} from 'agents/mcp/server';
import {z} from 'zod';
import {configError, isAuthorized} from './auth';
import {wpRequest, publishedPost, assertPublishedPostOrPage, WPRequestError} from './wp';
import type {Env} from './types';

// Deliberately read-only for the first Cloudflare deployment. There are no writes,
// hidden write routes, general fetch tools, or dynamic URL arguments.
const annotations = {readOnlyHint: true, destructiveHint: false, openWorldHint: false};

function output(payload: unknown) {
  const data: Record<string, unknown> = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {data: payload};
  return {content: [{type: 'text' as const, text: JSON.stringify(data)}], structuredContent: data};
}

function errorOutput(error: unknown) {
  const code = error instanceof WPRequestError
    ? `WordPress HTTP ${error.status}: ${error.code}`
    : 'Internal tool error (see private Worker logs)';
  return {isError: true as const, content: [{type: 'text' as const, text: code}]};
}

function saveAudit(ctx: ExecutionContext, env: Env, name: string, targetId: number | null, ok: boolean) {
  ctx.waitUntil(
    env.DB.prepare(
      'INSERT INTO mcp_audit_events (actor, tool_name, target_id, success) VALUES (?, ?, ?, ?)'
    ).bind('staging-reader', name, targetId, ok ? 1 : 0).run().catch(() => { /* audit failure never exposes secrets */ })
  );
}

function createServer(env: Env, ctx: ExecutionContext) {
  const server = new McpServer({name: 'seosir-wordpress-cloudflare', version: '0.4.0'});

  async function execute(name: string, id: number | null, fn: () => Promise<unknown>) {
    try {
      const data = await fn();
      saveAudit(ctx, env, name, id, true);
      return output(data);
    } catch (error) {
      saveAudit(ctx, env, name, id, false);
      return errorOutput(error);
    }
  }

  server.registerTool('site_info', {
    description: 'Read WordPress site capabilities and active SEO/page-builder integrations; never modifies anything.',
    inputSchema: {}, annotations,
  }, async () => execute('site_info', null, async () => {
    const capabilities = await wpRequest(env, '/wp-json/ai-bridge/v1/capabilities');
    return {site: capabilities, cloudflare_mode: 'staging-readonly', wordpress_writes_enabled: false};
  }));

  server.registerTool('posts_search', {
    description: 'Search published WordPress posts by query. Returns up to 20 lightweight results.',
    inputSchema: {query: z.string().max(150).default(''), limit: z.number().int().min(1).max(20).default(5)},
    annotations,
  }, async ({query, limit}) => execute('posts_search', null, async () => {
    const qs = new URLSearchParams({context:'edit', status:'publish', search:query, per_page:String(limit), _fields:'id,title,status,link,modified_gmt,slug'});
    const rows: any[] = await wpRequest(env, `/wp-json/wp/v2/posts?${qs.toString()}`);
    return {posts: rows.map(p => ({id:p.id, title:p.title?.raw ?? p.title?.rendered, status:p.status, link:p.link, modified_gmt:p.modified_gmt, slug:p.slug}))};
  }));

  server.registerTool('posts_get', {
    description: 'Read a published article by numeric ID, including title and content. Draft/private content is blocked in staging.',
    inputSchema: {id: z.number().int().positive()}, annotations,
  }, async ({id}) => execute('posts_get', id, async () => {
    const p = await publishedPost(env, id);
    const content = String(p.content?.raw ?? p.content?.rendered ?? '');
    return {post: {id:p.id, title:p.title?.raw ?? p.title?.rendered, content:content.slice(0,30000), content_truncated:content.length>30000, slug:p.slug, status:p.status, link:p.link, modified_gmt:p.modified_gmt}};
  }));

  server.registerTool('seo_get', {
    description: 'Read Yoast metadata for a published post or page only. Never changes SEO fields.',
    inputSchema: {id: z.number().int().positive()}, annotations,
  }, async ({id}) => execute('seo_get', id, async () => {
    await assertPublishedPostOrPage(env,id);
    return await wpRequest(env, `/wp-json/ai-bridge/v1/seo/${id}`);
  }));

  server.registerTool('elementor_outline', {
    description: 'Read a condensed Elementor outline for a published post or page. Cannot edit widgets.',
    inputSchema: {id: z.number().int().positive()}, annotations,
  }, async ({id}) => execute('elementor_outline', id, async () => {
    await assertPublishedPostOrPage(env,id);
    const result = await wpRequest(env, `/wp-json/ai-bridge/v1/elementor/${id}`);
    const asText = JSON.stringify(result);
    return asText.length > 30000 ? {truncated: true, outline_excerpt:asText.slice(0,30000)} : result;
  }));

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/healthz' && request.method === 'GET') {
      const configured = configError(env) === null;
      return new Response(JSON.stringify({ok:configured, service:'seosir-wordpress-mcp', mode:'staging-readonly'}), {
        status: configured ? 200 : 503,
        headers:{'Content-Type':'application/json', 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
      });
    }
    if (url.pathname !== '/mcp') return new Response('Not found', {status:404});

    // Do not serve any MCP request unless the configuration and bearer token are valid.
    const invalid = configError(env);
    if (invalid) return new Response('Server not configured', {status:503});
    if (!isAuthorized(request, env)) {
      return new Response(JSON.stringify({error:'unauthorized'}), {
        status:401,
        headers:{'Content-Type':'application/json','WWW-Authenticate':'Bearer realm="seosir-staging"','Cache-Control':'no-store'}
      });
    }
    // Cloudflare's stateless MCP handler provides modern & legacy protocol support.
    const handler = createMcpHandler(() => createServer(env, ctx), {
      route:'/mcp', responseMode:'json', corsOptions:false, legacy:'stateless'
    });
    return handler(request, env, ctx);
  }
};
