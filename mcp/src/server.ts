import 'dotenv/config';
import express from 'express';
import {z} from 'zod';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {authMiddleware,protectedResourceMetadata,validateAuthConfig,type AuthContext} from './auth.js';
import {wp,validateWordPressEnv,WordPressError} from './wp.js';

validateWordPressEnv();
validateAuthConfig();

function result(data: unknown): CallToolResult {
  // MCP structuredContent must be a JSON object, not an arbitrary `object` type.
  const structuredContent: Record<string, unknown> =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {data};
  return {
    content: [{type: 'text', text: JSON.stringify(structuredContent)}],
    structuredContent
  };
}
function failure(error:unknown): CallToolResult {
  if (error instanceof WordPressError) {
    const code=error.detail && typeof error.detail==='object' && 'code' in error.detail ? String((error.detail as {code:string}).code) : 'wordpress_error';
    return {isError:true as const,content:[{type:'text' as const,text:`WordPress error: HTTP ${error.status} (${code})`}]};
  }
  console.error('Tool failure',error instanceof Error?error.message:'unknown');
  return {isError:true as const,content:[{type:'text' as const,text:'Tool failed. Check private server logs; no changes assumed.'}]};
}
function guard(fn: () => Promise<unknown>): () => Promise<CallToolResult> {
  return async () => {
    try { return result(await fn()); }
    catch (e) { return failure(e); }
  };
}
function createServer(auth:AuthContext) {
  const s=new McpServer({name:'private-wordpress-mcp',version:'0.3.1'}, {
    instructions:'Use posts_search and posts_get before editing. Never assume a tool call succeeded without checking its output. Drafts only by default; explicit confirmation required for live SEO changes. Never expose credentials.'
  });
  const read={readOnlyHint:true,openWorldHint:false,destructiveHint:false};
  const write={readOnlyHint:false,openWorldHint:false,destructiveHint:false};

  s.registerTool('site_info',{
    title:'WordPress site capabilities',
    description:'Check that the configured WordPress site is reachable and whether Yoast and Elementor are active.',
    inputSchema:{},annotations:read
  },guard(async()=>await wp('/wp-json/ai-bridge/v1/capabilities')));

  s.registerTool('posts_search',{
    title:'Search posts',description:'Search WordPress articles by term; returns IDs and brief metadata, not complete content.',
    inputSchema:{query:z.string().max(150).default(''),limit:z.number().int().min(1).max(25).default(10)},annotations:read
  },async({query,limit})=>{
    try {
      const posts=await wp(`/wp-json/wp/v2/posts?context=edit&search=${encodeURIComponent(query)}&per_page=${limit}&_fields=id,title,status,link,modified_gmt,slug`);
      return result({posts:(posts as any[]).map(p=>({id:p.id,title:p.title?.raw??p.title?.rendered,status:p.status,link:p.link,modified_gmt:p.modified_gmt,slug:p.slug}))});
    }catch(e){return failure(e);}
  });

  s.registerTool('posts_get',{
    title:'Read post',description:'Read content and modification timestamp of an article before proposing any changes.',
    inputSchema:{id:z.number().int().positive()},annotations:read
  },async({id})=>{
    try {
      const p:any=await wp(`/wp-json/wp/v2/posts/${id}?context=edit&_fields=id,title,content,excerpt,slug,status,link,modified_gmt`);
      return result({post:{id:p.id,title:p.title?.raw??p.title?.rendered,content:p.content?.raw,excerpt:p.excerpt?.raw,slug:p.slug,status:p.status,link:p.link,modified_gmt:p.modified_gmt}});
    }catch(e){return failure(e);}
  });

  s.registerTool('seo_get',{
    title:'Read Yoast metadata',description:'Get stored Yoast title, description, focus keyword and canonical, plus an optimistic-concurrency revision.',
    inputSchema:{id:z.number().int().positive()},annotations:read
  },async({id})=>{try{return result(await wp(`/wp-json/ai-bridge/v1/seo/${id}`));}catch(e){return failure(e);}});

  s.registerTool('elementor_outline',{
    title:'Inspect Elementor layout',description:'Read a condensed, read-only outline of supported widgets and a layout hash; does not change the page.',
    inputSchema:{id:z.number().int().positive()},annotations:read
  },async({id})=>{try{return result(await wp(`/wp-json/ai-bridge/v1/elementor/${id}`));}catch(e){return failure(e);}});

  if (auth.scopes.has('wordpress:write')) {
    s.registerTool('posts_create_draft',{
      title:'Create draft article',description:'Create an unpublished draft WordPress article; this tool NEVER publishes.',
      inputSchema:{title:z.string().min(1).max(240),content:z.string().max(100000),excerpt:z.string().max(1000).optional()},annotations:write
    },async({title,content,excerpt})=>{
      try {
        const p:any=await wp('/wp-json/wp/v2/posts','POST',{title,content,excerpt,status:'draft'});
        return result({id:p.id,status:p.status,link:p.link,edit_url:`${process.env.WP_URL}/wp-admin/post.php?post=${p.id}&action=edit`});
      }catch(e){return failure(e);}
    });

    s.registerTool('posts_update_draft',{
      title:'Update existing draft',description:'Modify only an unpublished draft. Caller must provide exact modified_gmt read via posts_get, to prevent stale overwrites.',
      inputSchema:{id:z.number().int().positive(),expected_modified_gmt:z.string().min(10).max(32),title:z.string().min(1).max(240).optional(),content:z.string().max(100000).optional(),excerpt:z.string().max(1000).optional()},annotations:write
    },async({id,expected_modified_gmt,title,content,excerpt})=>{
      try {
        if (title===undefined && content===undefined && excerpt===undefined) return failure(new Error('No changes specified'));
        // Atomic status + revision validation is repeated in the WordPress bridge endpoint.
        return result(await wp(`/wp-json/ai-bridge/v1/draft/${id}`,'POST',{expected_modified_gmt,title,content,excerpt}));
      }catch(e){return failure(e);}
    });

    s.registerTool('seo_update',{
      title:'Update Yoast metadata',description:'Update only supplied Yoast fields. First call seo_get, supply its revision. For published pages set confirm_live_change=true after user approval.',
      inputSchema:{
        id:z.number().int().positive(),expected_revision:z.string().length(64),
        seo_title:z.string().max(240).optional(),meta_description:z.string().max(500).optional(),focus_keyword:z.string().max(200).optional(),canonical:z.string().max(500).optional(),
        confirm_live_change:z.boolean().default(false)
      },annotations:write
    },async({id,...body})=>{try{return result(await wp(`/wp-json/ai-bridge/v1/seo/${id}`,'POST',body));}catch(e){return failure(e);}});

    if (process.env.ENABLE_ELEMENTOR_WRITES==='true') {
      s.registerTool('elementor_update_text_experimental',{
        title:'Edit Elementor text (experimental)',
        description:'EXPERIMENTAL: modify existing Heading, Text Editor or Button widget by ID only. Requires site-level opt-in, matching layout hash, and separate user approval. Does not build new layouts.',
        inputSchema:{id:z.number().int().positive(),widget_id:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),field:z.enum(['title','editor','text']),value:z.string().max(20000),expected_hash:z.string().length(64),confirm_change:z.literal(true)},
        annotations:{...write,destructiveHint:true}
      },async({id,...body})=>{try{return result(await wp(`/wp-json/ai-bridge/v1/elementor/${id}/text`,'POST',body));}catch(e){return failure(e);}});
    }
  }
  return s;
}

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'600kb'}));
app.get('/healthz',(_req,res)=>res.json({ok:true,service:'private-wordpress-mcp'}));
app.get('/.well-known/oauth-protected-resource',(_req,res)=>res.json(protectedResourceMetadata()));
app.get('/.well-known/oauth-protected-resource/mcp',(_req,res)=>res.json(protectedResourceMetadata()));
const auth=authMiddleware();
app.post('/mcp',auth,async(req,res)=>{
  const context=req.authContext!;
  const server=createServer(context);
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
  res.on('close',()=>{void transport.close();void server.close();});
  try {
    await server.connect(transport);
    await transport.handleRequest(req,res,req.body);
  } catch(e) {
    console.error('MCP transport failure',e instanceof Error?e.message:'unknown');
    if (!res.headersSent) res.status(500).json({error:'Internal MCP error'});
  }
});
app.get('/mcp',auth,(_req,res)=>res.set('Allow','POST').status(405).end());
app.delete('/mcp',auth,(_req,res)=>res.set('Allow','POST').status(405).end());

const host=process.env.HOST??'127.0.0.1';
const port=Number(process.env.PORT??3000);
app.listen(port,host,()=>console.log(`MCP listening on http://${host}:${port}/mcp`));
