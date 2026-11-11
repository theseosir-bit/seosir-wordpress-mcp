// Public, read-only diagnostic. Does not need credentials and never changes WordPress.
// Run: node scripts/check-seosir-public.mjs
const base = 'https://seosir.ir';
const checks = [
  ['/wp-json/', 'WP REST root'],
  ['/wp-json/wp/v2/posts?per_page=1&_fields=id,link,title', 'Public posts']
];
let failed = false;
for (const [path,label] of checks) {
  try {
    const response = await fetch(base + path, {
      headers: {'Accept':'application/json'},
      redirect: 'follow',
      signal: AbortSignal.timeout(12000)
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    let json;
    try { json = JSON.parse(body); } catch { json = null; }
    console.log(`${label}: HTTP ${response.status}; type=${contentType}; finalHost=${new URL(response.url).host}`);
    if (path === '/wp-json/' && json && !Array.isArray(json)) {
      console.log('REST namespaces:', JSON.stringify((json.namespaces || []).filter(x => ['wp/v2','ai-bridge/v1'].includes(x))));
      console.log('Application Passwords supported/advertised:', Boolean(json.authentication?.['application-passwords']));
    }
    if (!response.ok || !contentType.includes('json')) {
      failed = true;
      console.log('Potential WAF, hosting restriction, redirect or non-WordPress endpoint.');
    }
  } catch (err) { failed = true; console.log(`${label}: FAIL ${err.message}`); }
}
if (failed) process.exitCode = 1;
