// Example: OpenAI Responses API -> Cloudflare MCP (read-only staging)
// Run with Node.js >=20. Environment variables are deliberately not read from a committed file.
// Keep OPENAI_API_KEY and STAGING_BEARER_TOKEN out of Git and chat.
const {OPENAI_API_KEY, OPENAI_MODEL, SEOSIR_MCP_URL, STAGING_BEARER_TOKEN} = process.env;
if (!OPENAI_API_KEY || !OPENAI_MODEL || !SEOSIR_MCP_URL || !/^[a-f0-9]{64}$/i.test(STAGING_BEARER_TOKEN ?? '')) {
  throw new Error('Set OPENAI_API_KEY, OPENAI_MODEL, SEOSIR_MCP_URL and STAGING_BEARER_TOKEN in your private environment');
}
if (!SEOSIR_MCP_URL.startsWith('https://') || !SEOSIR_MCP_URL.endsWith('/mcp')) {
  throw new Error('SEOSIR_MCP_URL must be an HTTPS URL ending with /mcp');
}
const response = await fetch('https://api.openai.com/v1/responses', {
  method:'POST',
  headers:{Authorization:`Bearer ${OPENAI_API_KEY}`, 'Content-Type':'application/json'},
  body:JSON.stringify({
    model:OPENAI_MODEL,
    input:'فقط با ابزار سایت وردپرس، نام سایت و چند مقاله منتشرشده را بررسی و خلاصه کن. هیچ تغییری ایجاد نکن.',
    tools:[{
      type:'mcp', server_label:'seosir_wordpress', server_url:SEOSIR_MCP_URL,
      authorization:STAGING_BEARER_TOKEN,
      allowed_tools:['site_info','posts_search'],
      require_approval:'never'
    }]
  })
});
const json = await response.json();
if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${JSON.stringify(json)}`);
const text = (json.output ?? []).flatMap(x => x.type==='message' ? (x.content ?? []) : [])
  .filter(x => x.type==='output_text').map(x => x.text).join('\n');
console.log(text || JSON.stringify(json.output ?? [],null,2));
