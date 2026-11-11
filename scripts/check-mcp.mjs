// Minimal local MCP health, auth challenge and metadata check (no node_modules required).
const endpoint=process.env.LOCAL_MCP_URL??'http://127.0.0.1:3000';
const [health,missingAuth,metadata]=await Promise.all([
  fetch(endpoint+'/healthz'),
  fetch(endpoint+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}),
  fetch(endpoint+'/.well-known/oauth-protected-resource')
]);
console.log('health:',health.status,await health.text());
console.log('without token:',missingAuth.status,missingAuth.headers.get('www-authenticate'));
console.log('protected metadata:',metadata.status,await metadata.text());
if(health.status!==200||missingAuth.status!==401||metadata.status!==200) process.exitCode=1;
